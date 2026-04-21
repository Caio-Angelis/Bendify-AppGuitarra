import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type { Application, Graphics } from 'pixi.js'
import type { PixiArmatureDisplay } from 'pixi-dragonbones-runtime'

/** Ossos do esqueleto; nomes vêm de `EsqueletoCorpo_ske.json`. */
export const HEAD_BONE_NAME = 'cabeca'
export const STRUM_BONE_NAME = 'AntebracoEsquerdo'
export const FRET_BONE_NAME = 'AntebracoDireito'
export const RIGHT_BICEPS_BONE_NAME = 'BicepsDireito'

/** Alvos IK da guitarra (filhos do osso da guitarra no DragonBones). */
export const IK_TARGET_PALHETADA = 'Alvo_Palheta'
export const IK_TARGET_ACORDE = 'Alvo_Acorde'

const STRUM_DURATION_MS = 150
const AMPLITUDE_PALHETADA = 14
const AMPLITUDE_ACORDE_TREMOR = 10
/** Sem ossos IK no esqueleto, `triggerStrum` anima estes antebraços (ex.: Scale Genius). */
const FALLBACK_STRUM_PULSE_RAD = 0.42
const FALLBACK_FRET_PULSE_RAD = 0.14

export interface GuitarPlayerAnimRef {
  /**
   * Pulso curto de palhetada (ossos IK `Alvo_*` se existirem; senão antebraços
   * `AntebracoEsquerdo` / `AntebracoDireito`), sem re-render React.
   */
  triggerStrum: () => void
}

/** Ajuste visual global do armature no canvas (multiplicador final do auto-fit). */
const SCALE_MULT = 2.00
const OFFSET_X = 40
const OFFSET_Y = 0

const DRAGON_BONES_DATA_NAME = 'EsqueletoCorpo'

const STRUM_SPEED = 9
const STRUM_AMP_RAD = 0.55

const FRET_SPEED = 10.5
const FRET_AMP_RAD = 0.22

const HEADBANG_SPEED = 2.2
const HEADBANG_AMP_RAD = 0.03
const HEAD_REST_OFFSET_Y = 0

const RIGHT_BICEPS_SPEED = 6.2
const RIGHT_BICEPS_AMP_RAD = 0.11

/**
 * Paths literais servidos da pasta `public/` — o Vite não processa esses
 * ficheiros, evitando inlining de base64 e consequente bloqueio de CSP.
 */
const skeUrl = '/assets/avatar/EsqueletoCorpo_ske.json'
const texJsonUrl = '/assets/avatar/EsqueletoCorpo_tex.json'
const texPngUrl = '/assets/avatar/EsqueletoCorpo_tex.png'

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Fetch falhou (${res.status}): ${url}`)
  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    // Em dev, um path inexistente costuma cair no index.html (text/html),
    // o que vira "Unexpected token '<'" ao tentar parsear JSON.
    throw new Error(
      `Conteúdo inesperado (${contentType || 'sem content-type'}): ${url}`,
    )
  }
  return res.json() as Promise<Record<string, unknown>>
}

type Props = {
  className?: string
  /**
   * Configuração local de movimento (por página/instância).
   * Se `enabled` for `false`, o personagem fica estático.
   */
  motion?: {
    enabled?: boolean
    strumSpeed?: number
    strumAmpRad?: number
    fretSpeed?: number
    fretAmpRad?: number
    headSpeed?: number
    headAmpRad?: number
    /** Com `enabled: true`, ajusta o balanço do bíceps direito (braço na escala). */
    rightBicepSpeed?: number
    rightBicepAmpRad?: number
    /**
     * Com `enabled: false`, anima só o bíceps direito (ex.: Genius com resto estático).
     */
    idleRightBicep?: { speed?: number; ampRad?: number }
    /** Offset inicial de fase (ex.: para desincronizar instâncias). */
    phase?: number
  }
  /**
   * Ajustes de layout por instância (para evitar cortes em telas diferentes).
   */
  layout?: {
    /** Multiplicador final do auto-fit. Default: constante interna. */
    scaleMult?: number
    /** Offset X em px. Default: constante interna. */
    offsetX?: number
    /** Offset Y em px (centro do canvas + offset; + desce o personagem). */
    offsetY?: number
    /** Padding do auto-fit (0..1). Default: 0.8 */
    fitPad?: number
    /** Margem inferior ao clamp (px). */
    clampBottomMargin?: number
    /**
     * Se `true`, não corrige overflow por baixo — o `offsetY` continua a contar até aos pés.
     * No Genius o clamp inferior costumava travar o boneco antes de encostar ao chão HTML.
     */
    omitBottomClamp?: boolean
  }
  /**
   * Chão desenhado no stage (por baixo do personagem). Evita o bug em que HTML
   * por cima/baixo do canvas WebGL “come” os pés na composição do browser.
   */
  floorInPixi?: boolean
  /** + desce o chão em px (alinhado ao antigo `floorPlankOffsetPx`). */
  floorPlankNudgePx?: number
}

function layoutPropsKey(layout: Props['layout']): string {
  if (!layout) return ''
  return [
    layout.scaleMult ?? '',
    layout.offsetX ?? '',
    layout.offsetY ?? '',
    layout.fitPad ?? '',
    layout.clampBottomMargin ?? '',
    layout.omitBottomClamp ? '1' : '',
  ].join('|')
}

/**
 * Personagem 2D DragonBones (PixiJS v7). Com ossos `Alvo_Palheta` / `Alvo_Acorde`,
 * a palhetada é um **pulso** disparado por `ref.triggerStrum()`; sem esses ossos,
 * mantém-se animação procedural nos antebraços (ex.: Dashboard).
 */
const GuitarPlayerAnim = forwardRef<GuitarPlayerAnimRef, Props>(
  function GuitarPlayerAnim(
    {
      className = '',
      motion,
      layout: layoutCfg,
      floorInPixi = false,
      floorPlankNudgePx = 0,
    },
    ref,
  ) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** Props como refs: objetos inline no pai mudam identidade a cada render e não podem estar nas deps do efeito Pixi (recria o canvas e pisca). */
  const motionRef = useRef(motion)
  const layoutRef = useRef(layoutCfg)
  const floorInPixiRef = useRef(floorInPixi)
  const floorPlankNudgeRef = useRef(floorPlankNudgePx)
  motionRef.current = motion
  layoutRef.current = layoutCfg
  floorInPixiRef.current = floorInPixi
  floorPlankNudgeRef.current = floorPlankNudgePx

  /** Expõe `layout()` para quando só mudam offsetY/scale (efeito Pixi tem deps []). */
  const relayoutRef = useRef<(() => void) | null>(null)

  const layoutKey = layoutPropsKey(layoutCfg)
  useLayoutEffect(() => {
    relayoutRef.current?.()
  }, [layoutKey, floorPlankNudgePx])

  const triggerStrumImplRef = useRef<(() => void) | null>(null)
  useImperativeHandle(ref, () => ({
    triggerStrum: () => {
      triggerStrumImplRef.current?.()
    },
  }))

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let app: Application | null = null
    let armatureDisplay: PixiArmatureDisplay | null = null
    let floorGfx: Graphics | null = null
    let onTick: ((delta: number) => void) | null = null
    let ro: ResizeObserver | null = null
    let cancelled = false
    let dbModule: typeof import('pixi-dragonbones-runtime') | null = null

    const run = async () => {
      try {
        const [pixi, dragonBones] = await Promise.all([
          import('pixi.js'),
          import('pixi-dragonbones-runtime'),
        ])
        dbModule = dragonBones
        if (cancelled) return

        dragonBones.PixiFactory.useSharedTicker = false

        const { Application: AppCtor, Assets, Graphics: GraphicsCtor } = pixi
        app = new AppCtor({
          resizeTo: host,
          backgroundAlpha: 0,
          antialias: true,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
        })
        if (cancelled) {
          app.destroy(true, true)
          app = null
          return
        }

        const canvasEl = app.view as HTMLCanvasElement
        host.appendChild(canvasEl)
        canvasEl.style.position = 'relative'
        canvasEl.style.zIndex = '10'
        canvasEl.style.display = 'block'

        // Garante empilhamento consistente: chão sempre atrás do personagem.
        app.stage.sortableChildren = true

        const [skeJson, texJson] = await Promise.all([
          fetchJson(skeUrl),
          fetchJson(texJsonUrl),
        ])
        const loadedTexture = await Assets.load(texPngUrl)
        if (cancelled) {
          app.destroy(true, true)
          app = null
          return
        }

        const factory = dragonBones.PixiFactory.factory

        // Singleton: em HMR / StrictMode pode sobrar cache antigo — limpar.
        try {
          factory.removeDragonBonesData(DRAGON_BONES_DATA_NAME, true)
          factory.removeTextureAtlasData(DRAGON_BONES_DATA_NAME, true)
        } catch {
          /* noop — primeira montagem */
        }

        // parse já registra internamente na factory; NÃO chamar add* depois.
        factory.parseDragonBonesData(skeJson)
        factory.parseTextureAtlasData(texJson, loadedTexture)

        if (cancelled) {
          factory.removeDragonBonesData(DRAGON_BONES_DATA_NAME, true)
          factory.removeTextureAtlasData(DRAGON_BONES_DATA_NAME, true)
          app.destroy(true, true)
          app = null
          return
        }

        // Descobre o nome da armature dinamicamente em vez de constante chumbada.
        const cached = factory.getDragonBonesData(DRAGON_BONES_DATA_NAME)
        const armatureNames = cached?.armatureNames ?? []
        console.log(
          '[GuitarPlayerAnim] Armatures disponíveis:',
          armatureNames,
        )

        const armatureName = armatureNames[0]
        if (!armatureName) {
          console.error(
            '[GuitarPlayerAnim] Nenhuma armature encontrada no DragonBonesData.',
          )
          setError('Nenhuma armature encontrada.')
          setLoading(false)
          return
        }

        armatureDisplay = factory.buildArmatureDisplay(
          armatureName,
          DRAGON_BONES_DATA_NAME,
        )
        if (!armatureDisplay) {
          console.error(
            `[GuitarPlayerAnim] buildArmatureDisplay('${armatureName}') retornou null.`,
          )
          setError(`Armature '${armatureName}' não pôde ser construída.`)
          setLoading(false)
          return
        }

        console.log(
          'Ossos disponíveis:',
          armatureDisplay.armature.getBones().map((b) => b.name),
        )

        const headBone = armatureDisplay.armature.getBone(HEAD_BONE_NAME)
        const headBaseRotation = headBone ? headBone.offset.rotation : 0
        const headBaseY = headBone ? headBone.offset.y : 0

        const strumBone = armatureDisplay.armature.getBone(STRUM_BONE_NAME)
        const strumBaseRotation = strumBone ? strumBone.offset.rotation : 0

        const fretBone = armatureDisplay.armature.getBone(FRET_BONE_NAME)
        const fretBaseRotation = fretBone ? fretBone.offset.rotation : 0

        const rightBicepBone = armatureDisplay.armature.getBone(
          RIGHT_BICEPS_BONE_NAME,
        )
        const rightBicepBaseRotation = rightBicepBone
          ? rightBicepBone.offset.rotation
          : 0

        const ossoAlvoPalheta = armatureDisplay.armature.getBone(
          IK_TARGET_PALHETADA,
        )
        const ossoAlvoAcorde = armatureDisplay.armature.getBone(
          IK_TARGET_ACORDE,
        )
        const startPalhetaY = ossoAlvoPalheta ? ossoAlvoPalheta.offset.y : 0
        const startAcordeX = ossoAlvoAcorde ? ossoAlvoAcorde.offset.x : 0
        const hasIkStrum = Boolean(ossoAlvoPalheta || ossoAlvoAcorde)

        let isStrumming = false
        let strumProgress = 0

        triggerStrumImplRef.current = () => {
          isStrumming = true
          strumProgress = 0
        }

        if (floorInPixiRef.current) {
          floorGfx = new GraphicsCtor()
          floorGfx.zIndex = 0
          app.stage.addChild(floorGfx)
        }
        armatureDisplay.zIndex = 1
        app.stage.addChild(armatureDisplay)

        const updatePixiFloor = () => {
          if (!floorGfx || !app) return
          const nudge = floorPlankNudgeRef.current
          const H = app.screen.height
          const W = app.screen.width
          const fw = Math.min(W * 0.94, 310)
          const x0 = (W - fw) / 2
          const inset = fw * 0.03
          const topH = 11
          const botH = 10
          const total = topH + botH
          const yTop = H - total - nudge
          const g = floorGfx
          g.clear()
          g.beginFill(0x5a5a5a)
          g.drawPolygon([
            x0 + inset,
            yTop,
            x0 + fw - inset,
            yTop,
            x0 + fw,
            yTop + topH,
            x0,
            yTop + topH,
          ])
          g.endFill()
          g.beginFill(0x1a1a1a)
          g.drawRect(x0, yTop + topH, fw, botH)
          g.endFill()
        }

        let didInitLayout = false
        const clampArmatureToView = () => {
          if (!app || !armatureDisplay) return
          const lc = layoutRef.current
          const marginTop = 6
          const marginBottom = lc?.clampBottomMargin ?? 4
          const b = armatureDisplay.getBounds()
          if (
            !lc?.omitBottomClamp &&
            b.y + b.height > app.screen.height - marginBottom
          ) {
            armatureDisplay.y -= b.y + b.height - (app.screen.height - marginBottom)
          }
          if (b.y < marginTop) {
            armatureDisplay.y += marginTop - b.y
          }
        }

        const layout = () => {
          if (!app || !armatureDisplay) return
          const lc = layoutRef.current
          const scaleMult = lc?.scaleMult ?? SCALE_MULT
          const offsetX = lc?.offsetX ?? OFFSET_X
          const offsetY = lc?.offsetY ?? OFFSET_Y
          const fitPad = lc?.fitPad ?? 0.8

          // Mede bounds/pivot/scale APENAS a partir da pose inicial.
          // Se recalcular a cada frame, os bounds mudam com a rotação dos ossos
          // e o personagem parece "andar" mesmo com x/y constantes.
          if (!didInitLayout) {
            factory.dragonBones.advanceTime(0)
            const bounds = armatureDisplay.getLocalBounds()
            armatureDisplay.pivot.set(
              bounds.x + bounds.width / 2,
              bounds.y + bounds.height / 2,
            )
            didInitLayout = true
          }

          const bounds = armatureDisplay.getLocalBounds()
          const safeW = Math.max(1, bounds.width)
          const safeH = Math.max(1, bounds.height)
          const fit =
            Math.min(app.screen.width / safeW, app.screen.height / safeH) * fitPad

          armatureDisplay.scale.set(fit * scaleMult)
          armatureDisplay.x = app.screen.width / 2 + offsetX
          armatureDisplay.y = app.screen.height / 2 + offsetY
          dragonBones.PixiFactory.factory.dragonBones.advanceTime(0)
          clampArmatureToView()
          updatePixiFloor()
        }

        relayoutRef.current = layout

        layout()

        let elapsed = motionRef.current?.phase ?? 0

        onTick = (delta: number) => {
          if (!armatureDisplay || !app) return
          const m = motionRef.current
          const motionEnabled = m?.enabled ?? true
          const strumSpeed = m?.strumSpeed ?? STRUM_SPEED
          const strumAmpRad = m?.strumAmpRad ?? STRUM_AMP_RAD
          const fretSpeed = m?.fretSpeed ?? FRET_SPEED
          const fretAmpRad = m?.fretAmpRad ?? FRET_AMP_RAD
          const headSpeed = m?.headSpeed ?? HEADBANG_SPEED
          const headAmpRad = m?.headAmpRad ?? HEADBANG_AMP_RAD
          const rightBicepSpeedActive =
            m?.rightBicepSpeed ?? RIGHT_BICEPS_SPEED
          const rightBicepAmpActive =
            m?.rightBicepAmpRad ?? RIGHT_BICEPS_AMP_RAD
          const idleBicep = m?.idleRightBicep
          const bicepIdleOnly = !motionEnabled && Boolean(idleBicep)
          const bicepSpeed = bicepIdleOnly
            ? (idleBicep?.speed ?? RIGHT_BICEPS_SPEED)
            : rightBicepSpeedActive
          const bicepAmp = bicepIdleOnly
            ? (idleBicep?.ampRad ?? RIGHT_BICEPS_AMP_RAD)
            : rightBicepAmpActive
          /** Desfasagem para o bíceps não ficar em fase com o antebraço. */
          const bicepPhase = (m?.phase ?? 0) + 0.55

          elapsed += delta / 60

          if (hasIkStrum) {
            if (isStrumming) {
              strumProgress += (delta / 60) * 1000
              const t = Math.min(strumProgress / STRUM_DURATION_MS, 1)
              const pulse = Math.sin(t * Math.PI)
              if (ossoAlvoPalheta) {
                ossoAlvoPalheta.offset.y =
                  startPalhetaY + pulse * AMPLITUDE_PALHETADA
                ossoAlvoPalheta.invalidUpdate()
              }
              if (ossoAlvoAcorde) {
                ossoAlvoAcorde.offset.x =
                  startAcordeX + pulse * AMPLITUDE_ACORDE_TREMOR
                ossoAlvoAcorde.invalidUpdate()
              }
              if (t >= 1) {
                isStrumming = false
                if (ossoAlvoPalheta) {
                  ossoAlvoPalheta.offset.y = startPalhetaY
                  ossoAlvoPalheta.invalidUpdate()
                }
                if (ossoAlvoAcorde) {
                  ossoAlvoAcorde.offset.x = startAcordeX
                  ossoAlvoAcorde.invalidUpdate()
                }
              }
            } else {
              if (ossoAlvoPalheta) {
                ossoAlvoPalheta.offset.y = startPalhetaY
                ossoAlvoPalheta.invalidUpdate()
              }
              if (ossoAlvoAcorde) {
                ossoAlvoAcorde.offset.x = startAcordeX
                ossoAlvoAcorde.invalidUpdate()
              }
            }
          } else if (isStrumming) {
            strumProgress += (delta / 60) * 1000
            const t = Math.min(strumProgress / STRUM_DURATION_MS, 1)
            const pulse = Math.sin(t * Math.PI)
            const strum = armatureDisplay.armature.getBone(STRUM_BONE_NAME)
            const fret = armatureDisplay.armature.getBone(FRET_BONE_NAME)
            if (strum) {
              strum.offset.rotation =
                strumBaseRotation + pulse * FALLBACK_STRUM_PULSE_RAD
              strum.invalidUpdate()
            }
            if (fret) {
              fret.offset.rotation =
                fretBaseRotation - pulse * FALLBACK_FRET_PULSE_RAD
              fret.invalidUpdate()
            }
            if (t >= 1) {
              isStrumming = false
              if (strum) {
                strum.offset.rotation = strumBaseRotation
                strum.invalidUpdate()
              }
              if (fret) {
                fret.offset.rotation = fretBaseRotation
                fret.invalidUpdate()
              }
            }
          }

          if (motionEnabled) {
            const head = armatureDisplay.armature.getBone(HEAD_BONE_NAME)
            if (head) {
              head.offset.rotation =
                headBaseRotation + Math.sin(elapsed * headSpeed) * headAmpRad
              head.offset.y = headBaseY + HEAD_REST_OFFSET_Y
              head.invalidUpdate()
            }

            if (!hasIkStrum && !isStrumming) {
              const strum = armatureDisplay.armature.getBone(STRUM_BONE_NAME)
              if (strum) {
                strum.offset.rotation =
                  strumBaseRotation +
                  Math.sin(elapsed * strumSpeed) * strumAmpRad
                strum.invalidUpdate()
              }

              const fret = armatureDisplay.armature.getBone(FRET_BONE_NAME)
              if (fret) {
                fret.offset.rotation =
                  fretBaseRotation +
                  Math.sin(elapsed * fretSpeed) * fretAmpRad
                fret.invalidUpdate()
              }
            }

            const rightBicep = armatureDisplay.armature.getBone(
              RIGHT_BICEPS_BONE_NAME,
            )
            if (rightBicep) {
              rightBicep.offset.rotation =
                rightBicepBaseRotation +
                Math.sin(elapsed * bicepSpeed + bicepPhase) * bicepAmp
              rightBicep.invalidUpdate()
            }
          } else {
            const head = armatureDisplay.armature.getBone(HEAD_BONE_NAME)
            if (head) {
              head.offset.rotation = headBaseRotation
              head.offset.y = headBaseY + HEAD_REST_OFFSET_Y
              head.invalidUpdate()
            }
            if (!hasIkStrum && !isStrumming) {
              const strum = armatureDisplay.armature.getBone(STRUM_BONE_NAME)
              if (strum) {
                strum.offset.rotation = strumBaseRotation
                strum.invalidUpdate()
              }
              const fret = armatureDisplay.armature.getBone(FRET_BONE_NAME)
              if (fret) {
                fret.offset.rotation = fretBaseRotation
                fret.invalidUpdate()
              }
            }

            const rightBicep = armatureDisplay.armature.getBone(
              RIGHT_BICEPS_BONE_NAME,
            )
            if (rightBicep) {
              if (bicepIdleOnly) {
                rightBicep.offset.rotation =
                  rightBicepBaseRotation +
                  Math.sin(elapsed * bicepSpeed + bicepPhase) * bicepAmp
              } else {
                rightBicep.offset.rotation = rightBicepBaseRotation
              }
              rightBicep.invalidUpdate()
            }
          }
          dragonBones.PixiFactory.factory.dragonBones.advanceTime(-1)
        }
        app.ticker.add(onTick)

        ro = new ResizeObserver(() => {
          requestAnimationFrame(() => {
            if (!cancelled && app) {
              app.resize()
              layout()
            }
          })
        })
        ro.observe(host)

        setLoading(false)
      } catch (e) {
        console.error('[GuitarPlayerAnim] Falha ao carregar avatar DragonBones', {
          skeUrl,
          texJsonUrl,
          texPngUrl,
          error: e,
        })
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : 'Erro ao carregar o avatar.',
          )
          setLoading(false)
        }
      }
    }

    void run()

    return () => {
      triggerStrumImplRef.current = null
      relayoutRef.current = null
      cancelled = true
      ro?.disconnect()
      ro = null

      if (app && onTick) {
        app.ticker.remove(onTick)
        onTick = null
      }

      if (armatureDisplay) {
        try {
          armatureDisplay.dispose(true)
        } catch {
          /* noop */
        }
        armatureDisplay = null
      }

      if (app && floorGfx) {
        try {
          app.stage.removeChild(floorGfx)
          floorGfx.destroy(true)
        } catch {
          /* noop */
        }
        floorGfx = null
      }

      if (dbModule) {
        try {
          dbModule.PixiFactory.factory.removeDragonBonesData(
            DRAGON_BONES_DATA_NAME,
            true,
          )
          dbModule.PixiFactory.factory.removeTextureAtlasData(
            DRAGON_BONES_DATA_NAME,
            true,
          )
        } catch {
          /* noop */
        }
      }

      if (app) {
        try {
          app.destroy(true, true)
        } catch {
          /* noop */
        }
        app = null
      }
    }
    // Montagem única: motion/layout vêm de refs (atualizadas a cada render).
  }, [])

  return (
    <div
      ref={hostRef}
      className={`relative flex h-full min-h-[300px] w-full items-center justify-center bg-transparent ${className}`}
    >
      {loading ? (
        <span className="pointer-events-none text-sm text-[#F5F5F5]/55">
          Carregando…
        </span>
      ) : null}
      {error ? (
        <span
          className="pointer-events-none px-2 text-center text-xs text-[#D32F2F]"
          role="alert"
        >
          {error}
        </span>
      ) : null}
    </div>
  )
},
)

export default GuitarPlayerAnim
