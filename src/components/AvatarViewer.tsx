import { forwardRef } from 'react'
import GuitarPlayerAnim, { type GuitarPlayerAnimRef } from './GuitarPlayerAnim'

export type { GuitarPlayerAnimRef }

type Props = {
  equippedItems: unknown
  /** Largura e altura do quadro do avatar em px. */
  size?: number
  className?: string
  /**
   * Força a altura externa do container (px). Útil quando o layout automático
   * (baseado em `size`) cria “teto” vazio em cards mais baixos.
   */
  outerHeightPx?: number
  /** Controle de movimento por página/instância. */
  motion?: Parameters<typeof GuitarPlayerAnim>[0]['motion']
  /** Ajustes de layout por página/instância (escala/offset). */
  layout?: Parameters<typeof GuitarPlayerAnim>[0]['layout']
  /** Círculo cinza atrás do personagem (ex.: Dashboard). */
  backdrop?: boolean
  /** “Chão” embaixo do personagem, sem círculo (ex.: Genius de Escalas). */
  floor?: boolean
  /**
   * Desloca o canvas do personagem em px (+ = para baixo).
   * Combinar com `layout.offsetY` (Pixi) e `floorPlankOffsetPx` até alinhar pé e plataforma.
   */
  floorAvatarOffsetPx?: number
  /**
   * Desloca o bloco do chão em px (+ = para baixo).
   */
  floorPlankOffsetPx?: number
}

const AvatarViewer = forwardRef<GuitarPlayerAnimRef, Props>(
  function AvatarViewer(
    {
      equippedItems,
      size = 200,
      className = '',
      outerHeightPx,
      motion,
      layout,
      backdrop = true,
      floor = false,
      floorAvatarOffsetPx = 0,
      floorPlankOffsetPx = 0,
    },
    ref,
  ) {
  void equippedItems
   const frame = Math.max(300, size)
  /** Sem chão, a sprite é mais alta que a largura; altura só = largura corta os pés. */
  const backdropMinHeight = Math.max(frame, Math.round(size * 1.62))
  const minOuterHeight = floor
    ? Math.max(frame, Math.round(size * 1.35) + 52)
    : backdropMinHeight

  return (
    <div
      className={`relative w-full max-w-[500px] ${floor ? 'isolate flex flex-col items-center' : 'flex min-h-0 flex-col'} ${className}`}
      style={{
        maxWidth: size,
        minHeight: outerHeightPx ?? minOuterHeight,
        ...(outerHeightPx ? { height: outerHeightPx } : null),
      }}
    >
      {backdrop ? (
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[80%] w-[80%] max-h-[min(100%,360px)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/5 backdrop-blur-sm ring-1 ring-white/10"
          aria-hidden
        />
      ) : null}

      <div
        className={
          floor
            ? 'relative z-10 flex w-full min-h-0 flex-1 flex-col justify-end'
            : 'relative z-0 flex min-h-0 w-full flex-1 flex-col'
        }
        style={
          floor ? { minHeight: Math.max(440, Math.round(size * 1.28)) } : undefined
        }
      >
        <div
          className={
            floor
              ? 'h-full w-full min-h-[400px]'
              : 'flex min-h-0 flex-1 flex-col'
          }
          style={
            floor
              ? { transform: `translateY(${floorAvatarOffsetPx}px)` }
              : undefined
          }
        >
          <GuitarPlayerAnim
            ref={ref}
            className={
              floor
                ? 'relative z-10 h-full min-h-[400px] w-full max-w-full [&>canvas]:block [&>canvas]:mx-auto [&_canvas]:block [&_canvas]:mx-auto'
                : 'relative z-0 min-h-0 flex-1 [&>canvas]:block [&>canvas]:mx-auto [&_canvas]:block [&_canvas]:mx-auto'
            }
            motion={motion}
            layout={layout}
            floorInPixi={floor}
            floorPlankNudgePx={floorPlankOffsetPx}
          />
        </div>
      </div>

      {floor ? (
        <div
          className="pointer-events-none shrink-0"
          style={{ height: 38 }}
          aria-hidden
        />
      ) : null}
    </div>
  )
},
)

export default AvatarViewer
