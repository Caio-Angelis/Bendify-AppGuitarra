import { useCallback, useEffect, useRef, useState } from 'react'
import Pitchfinder from 'pitchfinder'
import * as Tone from 'tone'
import AvatarViewer from '../components/AvatarViewer'
import type { GuitarPlayerAnimRef } from '../components/GuitarPlayerAnim'
import Fretboard, {
  type FretHighlight,
  type FretboardClickPayload,
} from '../components/Fretboard'
import { noteAtStringFret } from '../components/fretboardUtils'
import { useChallengePracticeTracking } from '../hooks/useChallengePracticeTracking'
import { useStore } from '../store/useStore'
import { getPreferredMicId } from '../utils/audioDevicePreferences'
import { foldToGuitarFundamental, freqToTunerLabel, rmsFloat32, smoothPitchEMA } from '../utils/guitarPitch'

/** Pentatônica menor de Lá (Am): s=5 é corda 6 (E grave), s=0 é corda 1 (e agudo). No Fretboard: stringIndex = 5 - s. */
export const PENTA_BOX = [
  { s: 5, f: 5 },
  { s: 5, f: 8 },
  { s: 4, f: 5 },
  { s: 4, f: 7 },
  { s: 3, f: 5 },
  { s: 3, f: 7 },
  { s: 2, f: 5 },
  { s: 2, f: 7 },
  { s: 1, f: 5 },
  { s: 1, f: 8 },
  { s: 0, f: 5 },
  { s: 0, f: 8 },
] as const

type PentaPos = (typeof PENTA_BOX)[number]

type GameStatus =
  | 'idle'
  | 'playing_sequence'
  | 'waiting_player'
  /** Rodada concluída: aguarda o jogador antes de tocar a sequência maior (evita sustain da guitarra). */
  | 'between_rounds'

/** Como o jogador repete a sequência na sua vez. */
type GeniusInputMode = 'click' | 'guitar' | 'both'

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function pentaToHighlight(p: PentaPos): FretHighlight {
  return { stringIndex: 5 - p.s, fret: p.f }
}

function randomPentaHighlight(): FretHighlight {
  const i = Math.floor(Math.random() * PENTA_BOX.length)
  return pentaToHighlight(PENTA_BOX[i])
}

function pitchForCell(stringIndex: number, fret: number): string {
  const n = noteAtStringFret(stringIndex, fret)
  const oct = stringIndex <= 1 ? 3 : stringIndex <= 3 ? 4 : 5
  return `${n}${oct}`
}

function expectedChromaticForStep(step: FretHighlight): string {
  return noteAtStringFret(step.stringIndex, step.fret)
}

function matchesPayload(
  seq: FretHighlight,
  payload: FretboardClickPayload,
): boolean {
  return (
    seq.stringIndex === payload.stringIndex && seq.fret === payload.fret
  )
}

/** Tempo para o sustain da guitarra baixar antes de aceitar outra nota pelo microfone. */
const MIC_COOLDOWN_AFTER_NOTE_MS = 1100
const MIC_COOLDOWN_AFTER_MISTAKE_MS = 1500

/** Referências fixas — objetos inline no JSX recriam o Pixi a cada render e piscam a tela. */
const GENIUS_AVATAR_MOTION = {
  enabled: false as const,
}
/** Pixi: centro + `offsetY` (+ desce). Ajustar até os pés encostarem visualmente ao chão. */
const GENIUS_AVATAR_LAYOUT = {
  scaleMult: 1.38,
  offsetX: 0,
  offsetY: 68,
  fitPad: 0.9,
  clampBottomMargin: 4,
  /** Sem isto o clamp inferior anulava o `offsetY` quando a bbox passava da base do canvas. */
  omitBottomClamp: true,
}

/** HTML: `translateY` do canvas vs do chão (+ desce). Mexer só nisto para alinhar os dois. */
const GENIUS_FLOOR_AVATAR_NUDGE_PX = 0
const GENIUS_FLOOR_PLANK_NUDGE_PX = 0

export default function ScaleGenius() {
  const geniusLevel = useStore((s) => s.userStats.geniusLevel)
  const geniusStreak = useStore((s) => s.userStats.geniusStreak)
  const updateGeniusStreak = useStore((s) => s.updateGeniusStreak)
  const levelUpGenius = useStore((s) => s.levelUpGenius)
  const equippedItems = useStore((s) => s.equippedItems)

  const [status, setStatus] = useState<GameStatus>('idle')
  const [sequence, setSequence] = useState<FretHighlight[]>([])
  const [playerStep, setPlayerStep] = useState(0)
  const [activeHighlight, setActiveHighlight] = useState<FretHighlight[]>([])
  const [roundSuccessFlash, setRoundSuccessFlash] = useState(false)
  const [levelUpFlash, setLevelUpFlash] = useState(false)
  const [inputErrorFlash, setInputErrorFlash] = useState(false)

  const [inputMode, setInputMode] = useState<GeniusInputMode>('both')
  const [micOn, setMicOn] = useState(false)
  const [detectedNote, setDetectedNote] = useState('—')
  const [micError, setMicError] = useState<string | null>(null)

  const clickInputEnabled = inputMode === 'click' || inputMode === 'both'
  const micInputEnabled = inputMode === 'guitar' || inputMode === 'both'

  useEffect(() => {
    if (!micInputEnabled) {
      setMicOn(false)
      setMicError(null)
    }
  }, [micInputEnabled])

  useChallengePracticeTracking('challenge-genius', status !== 'idle')

  const synthRef = useRef<Tone.Synth | null>(null)
  const mountedRef = useRef(true)
  const playingRef = useRef(false)
  const resolvingRoundRef = useRef(false)

  const rafRef = useRef(0)
  const streamRef = useRef<MediaStream | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const aliveMicRef = useRef(false)
  const pausedMicRef = useRef(false)
  const smoothFreqRef = useRef<number | null>(null)
  const detectYinRef = useRef<((buf: Float32Array) => number | null) | null>(null)
  const detectMacleodRef = useRef<
    ((buf: Float32Array) => { freq: number; probability: number }) | null
  >(null)
  const consecutiveMatchRef = useRef(0)
  const consecutiveMismatchRef = useRef(0)
  const micCooldownRef = useRef<number | null>(null)
  /** Enquanto `performance.now() < valor`, o microfone ignora notas (sustain). */
  const micListenReadyAtRef = useRef(0)
  const pendingNextSequenceRef = useRef<FretHighlight[] | null>(null)
  const [micListenHint, setMicListenHint] = useState(false)
  const avatarRef = useRef<GuitarPlayerAnimRef>(null)

  const scheduleMicListenPause = useCallback((ms: number) => {
    const until = performance.now() + ms
    micListenReadyAtRef.current = until
    setMicListenHint(true)
    window.setTimeout(() => {
      if (!mountedRef.current) return
      if (performance.now() >= micListenReadyAtRef.current - 1) {
        setMicListenHint(false)
      }
    }, ms + 50)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      resolvingRoundRef.current = false
      playingRef.current = false
    }
  }, [])

  const stopMicPipeline = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
    streamRef.current?.getTracks().forEach((tr) => tr.stop())
    streamRef.current = null
    void ctxRef.current?.close()
    ctxRef.current = null
    detectYinRef.current = null
    detectMacleodRef.current = null
    smoothFreqRef.current = null
    consecutiveMatchRef.current = 0
    consecutiveMismatchRef.current = 0
    pausedMicRef.current = false
    if (micCooldownRef.current) {
      window.clearTimeout(micCooldownRef.current)
      micCooldownRef.current = null
    }
    setDetectedNote('—')
  }, [])

  useEffect(() => {
    const synth = new Tone.Synth().toDestination()
    synthRef.current = synth
    return () => {
      synth.dispose()
      synthRef.current = null
    }
  }, [])

  const playNote = useCallback((h: FretHighlight) => {
    const synth = synthRef.current
    if (!synth) return
    synth.triggerAttackRelease(
      pitchForCell(h.stringIndex, h.fret),
      '8n',
    )
  }, [])

  const playLowError = useCallback(() => {
    const synth = synthRef.current
    if (!synth) return
    synth.triggerAttackRelease('C2', '8n')
  }, [])

  const flashInputError = useCallback(() => {
    setInputErrorFlash(true)
    window.setTimeout(() => {
      if (mountedRef.current) setInputErrorFlash(false)
    }, 650)
  }, [])

  const playSequence = useCallback(
    async (seq: FretHighlight[]) => {
      resolvingRoundRef.current = false
      if (playingRef.current) return
      playingRef.current = true
      await Tone.start()
      if (!mountedRef.current) {
        playingRef.current = false
        return
      }
      setStatus('playing_sequence')
      setPlayerStep(0)

      for (const pos of seq) {
        if (!mountedRef.current) break
        setActiveHighlight([pos])
        playNote(pos)
        await sleep(500)
        if (!mountedRef.current) break
        setActiveHighlight([])
        await sleep(100)
      }

      if (mountedRef.current) {
        micListenReadyAtRef.current = 0
        setMicListenHint(false)
        setStatus('waiting_player')
      }
      playingRef.current = false
    },
    [playNote],
  )

  const onMistake = useCallback(async () => {
    if (resolvingRoundRef.current) return
    resolvingRoundRef.current = true
    try {
      await Tone.start()
      playLowError()
      updateGeniusStreak(0)
      pendingNextSequenceRef.current = null
      setRoundSuccessFlash(false)
      setLevelUpFlash(false)
      setActiveHighlight([])
      setPlayerStep(0)
      const first = randomPentaHighlight()
      setSequence([first])
      flashInputError()
      if (micOn && micInputEnabled) {
        scheduleMicListenPause(MIC_COOLDOWN_AFTER_MISTAKE_MS)
      }
      void playSequence([first])
    } finally {
      resolvingRoundRef.current = false
    }
  }, [
    flashInputError,
    micInputEnabled,
    micOn,
    playLowError,
    playSequence,
    scheduleMicListenPause,
    updateGeniusStreak,
  ])

  const onCorrectStep = useCallback(
    async (step: FretHighlight) => {
      if (resolvingRoundRef.current) return
      resolvingRoundRef.current = true
      try {
        await Tone.start()
        avatarRef.current?.triggerStrum()
        playNote(step)
        setActiveHighlight([step])
        window.setTimeout(() => {
          if (mountedRef.current) setActiveHighlight([])
        }, 180)

        const nextStep = playerStep + 1

        if (nextStep === sequence.length) {
          const prevStreak = useStore.getState().userStats.geniusStreak
          const newStreak = prevStreak + 1
          updateGeniusStreak(newStreak)

          if (newStreak > 0 && newStreak % 5 === 0) {
            levelUpGenius()
            setLevelUpFlash(true)
            window.setTimeout(() => {
              if (mountedRef.current) setLevelUpFlash(false)
            }, 2200)
          }

          setRoundSuccessFlash(true)
          window.setTimeout(() => {
            if (mountedRef.current) setRoundSuccessFlash(false)
          }, 900)

          const add = randomPentaHighlight()
          const nextSeq = [...sequence, add]
          setSequence(nextSeq)
          setPlayerStep(0)
          pendingNextSequenceRef.current = nextSeq
          setStatus('between_rounds')
        } else {
          setPlayerStep(nextStep)
          if (micOn && micInputEnabled) {
            scheduleMicListenPause(MIC_COOLDOWN_AFTER_NOTE_MS)
          }
        }
      } finally {
        resolvingRoundRef.current = false
      }
    },
    [
      levelUpGenius,
      micInputEnabled,
      micOn,
      playNote,
      playerStep,
      scheduleMicListenPause,
      sequence,
      updateGeniusStreak,
    ],
  )

  const continueNextRound = useCallback(() => {
    const seq = pendingNextSequenceRef.current
    if (!seq?.length) return
    pendingNextSequenceRef.current = null
    void playSequence(seq)
  }, [playSequence])

  const startChallenge = useCallback(() => {
    resolvingRoundRef.current = false
    pendingNextSequenceRef.current = null
    const first = randomPentaHighlight()
    setSequence([first])
    setPlayerStep(0)
    setRoundSuccessFlash(false)
    setLevelUpFlash(false)
    setInputErrorFlash(false)
    void playSequence([first])
  }, [playSequence])

  const handleCellClick = useCallback(
    async (payload: FretboardClickPayload) => {
      if (!clickInputEnabled) return
      if (status !== 'waiting_player' || resolvingRoundRef.current) return
      const step = sequence[playerStep]
      if (!step) return

      if (matchesPayload(step, payload)) {
        await onCorrectStep(step)
      } else {
        await onMistake()
      }
    },
    [
      clickInputEnabled,
      onCorrectStep,
      onMistake,
      status,
      sequence,
      playerStep,
    ],
  )

  const highlights =
    activeHighlight.length > 0 ? activeHighlight : undefined

  const boardDisabled =
    status !== 'waiting_player' || !clickInputEnabled

  useEffect(() => {
    const FFT_SIZE = 8192
    const RMS_SILENCE = 0.0011
    const MATCH_FRAMES = 3
    const FREQ_MIN = 45
    const FREQ_MAX = 1400

    if (!micOn || !micInputEnabled) {
      aliveMicRef.current = false
      stopMicPipeline()
      setMicError(null)
      return
    }

    aliveMicRef.current = true
    pausedMicRef.current = false
    consecutiveMatchRef.current = 0
    consecutiveMismatchRef.current = 0
    setMicError(null)

    void (async () => {
      try {
        const micId = getPreferredMicId()
        const audioConstraints: MediaTrackConstraints = {
          echoCancellation: false,
          noiseSuppression: true,
          autoGainControl: true,
        }
        if (micId) audioConstraints.deviceId = { exact: micId }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
        })
        if (!aliveMicRef.current) {
          stream.getTracks().forEach((tr) => tr.stop())
          return
        }
        streamRef.current = stream

        const ctx = new AudioContext()
        ctxRef.current = ctx
        const source = ctx.createMediaStreamSource(stream)

        const hp = ctx.createBiquadFilter()
        hp.type = 'highpass'
        hp.frequency.value = 70
        hp.Q.value = 0.707

        const preGain = ctx.createGain()
        preGain.gain.value = 3.5

        const analyser = ctx.createAnalyser()
        analyser.fftSize = FFT_SIZE
        analyser.smoothingTimeConstant = 0.25

        source.connect(hp)
        hp.connect(preGain)
        preGain.connect(analyser)

        const sr = ctx.sampleRate
        detectYinRef.current = Pitchfinder.YIN({
          sampleRate: sr,
          threshold: 0.085,
          probabilityThreshold: 0.04,
        })
        detectMacleodRef.current = Pitchfinder.Macleod({
          bufferSize: FFT_SIZE,
          sampleRate: sr,
          cutoff: 0.9,
        })

        const buffer = new Float32Array(FFT_SIZE)
        smoothFreqRef.current = null

        function cooldown(ms: number) {
          pausedMicRef.current = true
          if (micCooldownRef.current) {
            window.clearTimeout(micCooldownRef.current)
          }
          micCooldownRef.current = window.setTimeout(() => {
            micCooldownRef.current = null
            pausedMicRef.current = false
            if (!aliveMicRef.current) return
            rafRef.current = requestAnimationFrame(tick)
          }, ms)
        }

        async function acceptDetectedChromatic(chromatic: string) {
          if (!micInputEnabled) return
          if (status !== 'waiting_player' || resolvingRoundRef.current) return
          if (performance.now() < micListenReadyAtRef.current) {
            consecutiveMatchRef.current = 0
            consecutiveMismatchRef.current = 0
            return
          }
          const step = sequence[playerStep]
          if (!step) return

          const expected = expectedChromaticForStep(step)
          if (chromatic === expected) {
            consecutiveMismatchRef.current = 0
            consecutiveMatchRef.current += 1
            if (consecutiveMatchRef.current >= MATCH_FRAMES) {
              consecutiveMatchRef.current = 0
              cooldown(650)
              await onCorrectStep(step)
            }
          } else {
            consecutiveMatchRef.current = 0
            consecutiveMismatchRef.current += 1
            if (consecutiveMismatchRef.current >= MATCH_FRAMES) {
              consecutiveMismatchRef.current = 0
              cooldown(650)
              await onMistake()
            }
          }
        }

        function tick() {
          if (!aliveMicRef.current || pausedMicRef.current) return
          if (!detectYinRef.current || !detectMacleodRef.current) return

          analyser.getFloatTimeDomainData(buffer)
          const energy = rmsFloat32(buffer)
          if (energy < RMS_SILENCE) {
            smoothFreqRef.current = null
            consecutiveMatchRef.current = 0
            consecutiveMismatchRef.current = 0
            setDetectedNote('—')
            rafRef.current = requestAnimationFrame(tick)
            return
          }

          let raw = detectYinRef.current(buffer)
          if (raw == null || raw < FREQ_MIN) {
            const m = detectMacleodRef.current(buffer)
            if (
              m.freq > FREQ_MIN &&
              m.freq < FREQ_MAX &&
              Number.isFinite(m.probability) &&
              m.probability > 0.2
            ) {
              raw = m.freq
            }
          }
          if (raw == null || raw < FREQ_MIN || raw > FREQ_MAX) {
            rafRef.current = requestAnimationFrame(tick)
            return
          }

          const folded = foldToGuitarFundamental(raw)
          const smoothed = smoothPitchEMA(smoothFreqRef.current, folded, 0.2)
          smoothFreqRef.current = smoothed

          const parts = freqToTunerLabel(smoothed)
          setDetectedNote(parts?.label ?? '—')

          if (parts) {
            void acceptDetectedChromatic(parts.chromatic)
          } else {
            consecutiveMatchRef.current = 0
            consecutiveMismatchRef.current = 0
          }

          rafRef.current = requestAnimationFrame(tick)
        }

        rafRef.current = requestAnimationFrame(tick)
      } catch {
        if (aliveMicRef.current) {
          setMicError(
            'Microfone indisponível ou permissão negada. Verifique as definições do navegador.',
          )
          setMicOn(false)
        }
      }
    })()

    return () => {
      aliveMicRef.current = false
      stopMicPipeline()
    }
  }, [
    micInputEnabled,
    micOn,
    onCorrectStep,
    onMistake,
    playerStep,
    sequence,
    status,
    stopMicPipeline,
  ])

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl flex-col gap-6 text-[#F5F5F5] lg:flex-row lg:items-start">
      <aside className="mx-auto w-full max-w-md shrink-0 lg:mx-0 lg:sticky lg:top-6 lg:w-[340px]">
        <div className="flex justify-center">
          <AvatarViewer
            ref={avatarRef}
            equippedItems={equippedItems}
            size={320}
            motion={GENIUS_AVATAR_MOTION}
            layout={GENIUS_AVATAR_LAYOUT}
            backdrop={false}
            floor
            floorAvatarOffsetPx={GENIUS_FLOOR_AVATAR_NUDGE_PX}
            floorPlankOffsetPx={GENIUS_FLOOR_PLANK_NUDGE_PX}
          />
        </div>
      </aside>

      <section className="min-w-0 flex-1">
        <header className="mb-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-xl font-semibold tracking-tight">
              Genius de Escalas
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <p className="font-medium text-[#FFB300]">
                Nível {geniusLevel}
              </p>
              <p className="text-[#F5F5F5]/85">
                Sequência atual:{' '}
                <span className="font-semibold text-[#FFB300]">
                  {status === 'idle' ? '—' : sequence.length}
                </span>{' '}
                {sequence.length === 1 ? 'nota' : 'notas'}
              </p>
              <p className="text-[#F5F5F5]/70">
                Ofensiva:{' '}
                <span className="font-medium text-[#F5F5F5]">
                  {geniusStreak}
                </span>
              </p>
            </div>
          </div>
          <p className="text-sm text-[#F5F5F5]/70">
            Memorize a sequência na pentatônica menor de Lá e repita no braço
            (clique nas casas) ou na guitarra (microfone), conforme o modo abaixo.
          </p>
          <div
            className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-3 backdrop-blur-sm"
            role="group"
            aria-label="Modo de entrada"
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-[#F5F5F5]/50">
              Como repetir a sequência
            </p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: 'click' as const, label: 'Clique no braço' },
                  { id: 'guitar' as const, label: 'Guitarra (microfone)' },
                  { id: 'both' as const, label: 'Clique e guitarra' },
                ] as const
              ).map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setInputMode(id)}
                  className={[
                    'rounded-lg border px-3 py-2 text-xs font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB300]/50',
                    inputMode === id
                      ? 'border-[#FFB300] bg-[#FFB300]/15 text-[#FFB300]'
                      : 'border-white/10 bg-[#121212]/50 text-[#F5F5F5]/80 backdrop-blur-sm hover:border-[#FFB300]/30 hover:bg-white/5',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </header>

        {status === 'idle' && (
          <div className="mb-6 flex justify-center">
            <button
              type="button"
              onClick={startChallenge}
              className="rounded-xl bg-[#FFB300] px-10 py-4 text-base font-semibold text-black shadow-[0_0_24px_rgba(255,179,0,0.4)] transition hover:bg-[#ffc42e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB300]/70"
            >
              Iniciar Desafio
            </button>
          </div>
        )}

        {micInputEnabled && micError ? (
          <p className="mb-4 text-center text-sm font-medium text-red-400/95">
            {micError}
          </p>
        ) : null}

        {micInputEnabled ? (
          <div className="mb-4 flex flex-wrap items-center justify-center gap-3">
            {!micOn ? (
              <button
                type="button"
                onClick={() => {
                  setMicError(null)
                  setMicOn(true)
                }}
                className="rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-[#F5F5F5] backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[#FFB300]/30 hover:shadow-lg hover:shadow-[#FFB300]/10"
              >
                Ligar guitarra (microfone)
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setMicOn(false)}
                className="rounded-xl border border-white/10 bg-[#121212]/50 px-6 py-3 text-sm font-medium text-[#F5F5F5]/85 backdrop-blur-sm transition hover:border-red-400/60 hover:bg-white/5"
              >
                Parar microfone
              </button>
            )}
            <p className="text-xs text-[#F5F5F5]/55">
              Ouvindo:{' '}
              <span className="font-mono text-[#F5F5F5]/80">
                {detectedNote}
              </span>
            </p>
          </div>
        ) : null}

        {micInputEnabled &&
        inputMode === 'guitar' &&
        !micOn &&
        status === 'waiting_player' ? (
          <p className="mb-3 text-center text-xs font-medium text-[#FFB300]/90">
            Ligue o microfone para o jogo reconhecer a guitarra.
          </p>
        ) : null}

        {levelUpFlash && (
          <div
            className="mb-4 rounded-lg border border-[#FFB300]/40 bg-white/5 px-4 py-3 text-center text-sm font-semibold text-[#FFB300] shadow-[0_0_20px_rgba(255,179,0,0.20)] backdrop-blur-sm"
            role="status"
          >
            Level Up!
          </div>
        )}

        {roundSuccessFlash && status !== 'between_rounds' && (
          <p
            className="mb-3 text-center text-sm font-medium text-[#FFB300]"
            role="status"
          >
            Perfeito! Próxima rodada…
          </p>
        )}

        {status === 'between_rounds' && (
          <div
            className="mb-4 flex flex-col items-center gap-3 rounded-2xl border border-[#FFB300]/30 bg-white/5 px-4 py-5 text-center shadow-[0_0_24px_rgba(255,179,0,0.10)] backdrop-blur-sm"
            role="status"
          >
            <p className="text-sm font-medium text-[#F5F5F5]/90">
              Rodada concluída.
              {micInputEnabled
                ? ' Quando o som apagar (se estiver a usar a guitarra), ouça a sequência com a nova nota.'
                : ' Ouça a sequência com a nova nota.'}
            </p>
            <button
              type="button"
              onClick={continueNextRound}
              className="rounded-xl bg-[#FFB300] px-8 py-3 text-sm font-semibold text-black shadow-[0_0_20px_rgba(255,179,0,0.35)] transition hover:bg-[#ffc42e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB300]/70"
            >
              Ouvir sequência e continuar
            </button>
          </div>
        )}

        {inputErrorFlash && (
          <p
            className="mb-3 text-center text-xs font-medium text-red-400/90"
            role="status"
          >
            Nota errada — progresso perdido. Nova sequência a partir de uma nota.
          </p>
        )}

        {status === 'playing_sequence' && (
          <p className="mb-3 text-center text-xs text-[#F5F5F5]/55">
            Observe a sequência…
          </p>
        )}

        {status === 'waiting_player' && (
          <div className="mb-3 space-y-1 text-center">
            <p className="text-xs text-[#F5F5F5]/55">
              Sua vez — repita a sequência.
            </p>
            {micInputEnabled && micOn && micListenHint ? (
              <p className="text-[11px] text-[#F5F5F5]/45">
                Aguarde o som apagar… o microfone volta em instantes.
              </p>
            ) : null}
          </div>
        )}

        <Fretboard
          onCellClick={handleCellClick}
          highlights={highlights}
          disabled={boardDisabled}
          showCellNotes={false}
        />
      </section>
    </div>
  )
}
