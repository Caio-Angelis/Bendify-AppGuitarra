import { useCallback, useEffect, useRef, useState } from 'react'
import * as Tone from 'tone'
import Pitchfinder from 'pitchfinder'
import { Zap } from 'lucide-react'
import AvatarViewer, { type GuitarPlayerAnimRef } from '../components/AvatarViewer'
import { tryUnlockAchievement } from '../hooks/tryUnlockAchievement'
import { useChallengePracticeTracking } from '../hooks/useChallengePracticeTracking'
import { useStore } from '../store/useStore'
import {
  applyToneOutputDevice,
  getPreferredMicId,
  getPreferredOutputId,
  supportsAudioOutputSelection,
} from '../utils/audioDevicePreferences'
import {
  foldToGuitarFundamental,
  freqToTunerLabel,
  rmsFloat32,
} from '../utils/guitarPitch'

/** Pentatônica de Lá menor (classes de altura; oitava ignorada na detecção). */
export const AM_PENTATONIC = ['A', 'C', 'D', 'E', 'G'] as const

/**
 * Gabarito (24 batidas).
 *
 * Nota: a detecção ignora oitava, então `A` e `A`(oitava) contam como a mesma classe.
 */
export const SCALE_RUNNER_SEQUENCE = [
  'A',
  'C',
  'D',
  'E',
  'G',
  'A',
  'C',
  'D',
  'E',
  'G',
  'A',
  'C',
  'C',
  'A',
  'G',
  'E',
  'D',
  'C',
  'A',
  'G',
  'E',
  'D',
  'C',
  'A',
] as const

const SEQUENCE_LEN = SCALE_RUNNER_SEQUENCE.length
const FIRST_NOTE = SCALE_RUNNER_SEQUENCE[0]
/** Frames consecutivos com a nota certa para disparar o metrônomo (reduz ruído). */
const FIRST_NOTE_STREAK_FRAMES = 5

const FFT_SIZE = 8192
const RMS_SILENCE = 0.0011
const FREQ_MIN = 45
const FREQ_MAX = 1400

const BPM_MIN = 50
const BPM_MAX = 160

/** Igual ao Genius de Escalas: estático até `triggerStrum` (acerto no microfone). */
const SCALE_RUNNER_AVATAR_MOTION = {
  enabled: false as const,
}
/** Palco sem chão Pixi — alinhado ao vestiário do Dashboard (400px). */
const SCALE_RUNNER_AVATAR_LAYOUT = {
  scaleMult: 1.68,
  offsetX: 0,
  offsetY: 12,
  fitPad: 0.85,
  clampBottomMargin: 6,
} as const

type Feedback = 'idle' | 'hit' | 'miss'

function readPitchOnce(
  analyser: AnalyserNode,
  buffer: Float32Array,
  yin: (buf: Float32Array) => number | null,
  macleod: (buf: Float32Array) => { freq: number; probability: number },
): { chromatic: string | null; label: string; silent: boolean } {
  ;(analyser as unknown as { getFloatTimeDomainData: (array: Float32Array) => void })
    .getFloatTimeDomainData(buffer)
  const energy = rmsFloat32(buffer)
  if (energy < RMS_SILENCE) {
    return { chromatic: null, label: '—', silent: true }
  }

  let raw = yin(buffer)
  if (raw == null || raw < FREQ_MIN) {
    const m = macleod(buffer)
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
    return { chromatic: null, label: '—', silent: false }
  }

  const folded = foldToGuitarFundamental(raw)
  const parts = freqToTunerLabel(folded)
  if (!parts) {
    return { chromatic: null, label: '—', silent: false }
  }

  return {
    chromatic: parts.chromatic,
    label: parts.label,
    silent: false,
  }
}

type RunOutcome =
  | null
  | { kind: 'fail' }
  | { kind: 'success'; credits: number }

function effectiveDailyAttemptsRemaining(
  lastAttemptDate: string,
  dailyAttempts: number,
): number {
  const today = new Date().toDateString()
  if (lastAttemptDate !== today) return 3
  return dailyAttempts
}

export default function ScaleRunner() {
  const addCredits = useStore((s) => s.addCredits)
  const consumeAttempt = useStore((s) => s.useAttempt)
  const dailyAttempts = useStore((s) => s.dailyAttempts)
  const lastAttemptDate = useStore((s) => s.lastAttemptDate)
  const globalBpm = useStore((s) => s.globalBpm)
  const equippedItems = useStore((s) => s.equippedItems)

  const attemptsLeft = effectiveDailyAttemptsRemaining(
    lastAttemptDate,
    dailyAttempts,
  )

  const [micReady, setMicReady] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  /** Clicou em Iniciar; aguarda a primeira nota correta antes do metrônomo. */
  const [awaitingFirstNote, setAwaitingFirstNote] = useState(false)
  const [bpm, setBpm] = useState(() =>
    Math.min(BPM_MAX, Math.max(BPM_MIN, globalBpm)),
  )
  const [beatIndex, setBeatIndex] = useState(0)
  const [combo, setCombo] = useState(0)
  const [feedback, setFeedback] = useState<Feedback>('idle')
  const [lastHeard, setLastHeard] = useState('—')
  const [lastHeardChromatic, setLastHeardChromatic] = useState<string | null>(
    null,
  )
  const [micError, setMicError] = useState<string | null>(null)
  const [runOutcome, setRunOutcome] = useState<RunOutcome>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const bufferRef = useRef<Float32Array | null>(null)
  const detectYinRef = useRef<((buf: Float32Array) => number | null) | null>(
    null,
  )
  const detectMacleodRef = useRef<
    ((buf: Float32Array) => { freq: number; probability: number }) | null
  >(null)

  const clickSynthRef = useRef<Tone.Synth | null>(null)
  const repeatIdRef = useRef<number | null>(null)
  const beatIndexRef = useRef(0)
  const awaitingFirstNoteRef = useRef(false)
  const avatarRef = useRef<GuitarPlayerAnimRef>(null)

  useChallengePracticeTracking(
    'challenge-scale-runner',
    micReady || isRunning || awaitingFirstNote,
  )

  const stopMic = useCallback(() => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop())
    streamRef.current = null
    void ctxRef.current?.close()
    ctxRef.current = null
    analyserRef.current = null
    bufferRef.current = null
    detectYinRef.current = null
    detectMacleodRef.current = null
    setMicReady(false)
    setLastHeard('—')
    setLastHeardChromatic(null)
  }, [])

  const stopTransport = useCallback(() => {
    const transport = Tone.getTransport()
    transport.stop()
    if (repeatIdRef.current !== null) {
      transport.clear(repeatIdRef.current)
      repeatIdRef.current = null
    }
    clickSynthRef.current?.dispose()
    clickSynthRef.current = null
    setIsRunning(false)
    Tone.getDraw().cancel()
  }, [])

  const startMic = useCallback(async () => {
    setMicError(null)
    const micId = getPreferredMicId()
    const audioConstraints: MediaTrackConstraints = {
      echoCancellation: false,
      noiseSuppression: true,
      autoGainControl: true,
    }
    if (micId) {
      audioConstraints.deviceId = { exact: micId }
    }
    await Tone.start()
    const ctx = new AudioContext()
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints,
    })
    streamRef.current = stream

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

    ctxRef.current = ctx
    analyserRef.current = analyser
    bufferRef.current = new Float32Array(FFT_SIZE)

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

    setMicReady(true)
  }, [])

  const launchMetronome = useCallback(async () => {
    if (!analyserRef.current || !bufferRef.current) return
    if (!detectYinRef.current || !detectMacleodRef.current) return

    try {
      await Tone.start()
      const outPref = getPreferredOutputId()
      if (outPref && supportsAudioOutputSelection()) {
        try {
          await applyToneOutputDevice(outPref)
        } catch {
          /* ignore */
        }
      }

      const transport = Tone.getTransport()
      transport.stop()
      transport.cancel()
      transport.bpm.value = bpm
      transport.position = 0

      const synth = new Tone.Synth({
        oscillator: { type: 'sine' },
        envelope: {
          attack: 0.001,
          decay: 0.1,
          sustain: 0,
          release: 0.02,
        },
      }).toDestination()
      synth.volume.value = -8
      clickSynthRef.current = synth

      const analyser = analyserRef.current
      const buffer = bufferRef.current
      const yin = detectYinRef.current
      const macleod = detectMacleodRef.current

      beatIndexRef.current = 0
      setBeatIndex(0)
      setFeedback('idle')

      const stopMetronomeAndDispose = () => {
        transport.stop()
        if (repeatIdRef.current !== null) {
          transport.clear(repeatIdRef.current)
          repeatIdRef.current = null
        }
        clickSynthRef.current?.dispose()
        clickSynthRef.current = null
        setIsRunning(false)
        Tone.getDraw().cancel()
      }

      const id = transport.scheduleRepeat((time) => {
        const idx = beatIndexRef.current
        if (idx >= SEQUENCE_LEN) return

        const expected = SCALE_RUNNER_SEQUENCE[idx] ?? SCALE_RUNNER_SEQUENCE[0]

        const read = readPitchOnce(analyser, buffer, yin, macleod)
        const match =
          !read.silent &&
          read.chromatic !== null &&
          read.chromatic === expected

        synth.triggerAttackRelease('C5', '32n', time, 0.55)

        Tone.getDraw().schedule(() => {
          setLastHeard(read.label)
          setLastHeardChromatic(read.chromatic)

          if (!match) {
            setBeatIndex(idx)
            setFeedback('miss')
            setCombo(0)
            setRunOutcome({ kind: 'fail' })
            stopMetronomeAndDispose()
            return
          }

          avatarRef.current?.triggerStrum()
          setFeedback('hit')
          setCombo((c) => c + 1)

          if (idx === SEQUENCE_LEN - 1) {
            const reward = Math.floor(bpm / 2)
            addCredits(reward)
            setRunOutcome({ kind: 'success', credits: reward })
            beatIndexRef.current = SEQUENCE_LEN
            setBeatIndex(SEQUENCE_LEN)
            stopMetronomeAndDispose()
            const uid = useStore.getState().session?.user?.id
            if (bpm >= 100) {
              void tryUnlockAchievement(uid, 'scale_speed_100')
            }
            return
          }

          beatIndexRef.current = idx + 1
          setBeatIndex(idx + 1)

          window.setTimeout(() => {
            setFeedback('idle')
          }, 280)
        }, time)
      }, '4n', 0)

      repeatIdRef.current = id
      transport.start()
      setIsRunning(true)
    } catch (e) {
      console.error(e)
      setMicError('Não foi possível iniciar o metrônomo. Tente novamente.')
      const today = new Date().toDateString()
      useStore.setState((s) => {
        if (s.lastAttemptDate !== today) return {}
        return { dailyAttempts: Math.min(3, s.dailyAttempts + 1) }
      })
    }
  }, [addCredits, bpm])

  const beginRun = useCallback(() => {
    if (!micReady || !analyserRef.current || !bufferRef.current) return
    if (!detectYinRef.current || !detectMacleodRef.current) return
    if (!consumeAttempt()) return

    setMicError(null)
    setRunOutcome(null)
    beatIndexRef.current = 0
    setBeatIndex(0)
    setCombo(0)
    setFeedback('idle')
    awaitingFirstNoteRef.current = true
    setAwaitingFirstNote(true)
  }, [consumeAttempt, micReady])

  useEffect(() => {
    if (!awaitingFirstNote) return
    if (!analyserRef.current || !bufferRef.current) return
    if (!detectYinRef.current || !detectMacleodRef.current) return

    const analyser = analyserRef.current
    const buffer = bufferRef.current
    const yin = detectYinRef.current
    const macleod = detectMacleodRef.current

    let streak = 0
    let rafId = 0

    const tick = () => {
      if (!awaitingFirstNoteRef.current) return

      const read = readPitchOnce(analyser, buffer, yin, macleod)
      setLastHeard(read.label)
      setLastHeardChromatic(read.chromatic)

      const ok =
        !read.silent &&
        read.chromatic !== null &&
        read.chromatic === FIRST_NOTE
      streak = ok ? streak + 1 : 0

      if (streak >= FIRST_NOTE_STREAK_FRAMES) {
        awaitingFirstNoteRef.current = false
        setAwaitingFirstNote(false)
        void launchMetronome()
        return
      }

      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(rafId)
    }
  }, [awaitingFirstNote, launchMetronome])

  const stopRun = useCallback(() => {
    awaitingFirstNoteRef.current = false
    setAwaitingFirstNote(false)
    stopTransport()
    setBeatIndex(0)
    beatIndexRef.current = 0
    setCombo(0)
    setFeedback('idle')
    setLastHeard('—')
    setLastHeardChromatic(null)
  }, [stopTransport])

  useEffect(() => {
    return () => {
      awaitingFirstNoteRef.current = false
      stopTransport()
      stopMic()
    }
  }, [stopMic, stopTransport])

  const currentNote =
    beatIndex < SEQUENCE_LEN
      ? (SCALE_RUNNER_SEQUENCE[beatIndex] ?? SCALE_RUNNER_SEQUENCE[0])
      : '—'
  const nextNote =
    beatIndex + 1 < SEQUENCE_LEN
      ? (SCALE_RUNNER_SEQUENCE[beatIndex + 1] ?? SCALE_RUNNER_SEQUENCE[0])
      : '—'

  const progressCurrent = (() => {
    if (awaitingFirstNote) return 0
    if (isRunning && beatIndex < SEQUENCE_LEN) return beatIndex + 1
    if (runOutcome?.kind === 'success') return SEQUENCE_LEN
    if (runOutcome?.kind === 'fail')
      return Math.min(beatIndex + 1, SEQUENCE_LEN)
    return Math.min(beatIndex, SEQUENCE_LEN)
  })()
  const progressRatio = progressCurrent / SEQUENCE_LEN

  const expectedChromaticForMic =
    awaitingFirstNote
      ? FIRST_NOTE
      : isRunning && beatIndex < SEQUENCE_LEN
        ? (SCALE_RUNNER_SEQUENCE[beatIndex] ?? null)
        : null

  const heardMicClass = (() => {
    if (lastHeard === '—') return 'text-[#F5F5F5]/40'
    if (!expectedChromaticForMic) return 'text-[#F5F5F5]/90'
    if (
      lastHeardChromatic !== null &&
      lastHeardChromatic === expectedChromaticForMic
    ) {
      return 'text-emerald-400 drop-shadow-[0_0_12px_rgba(52,211,153,0.45)]'
    }
    return 'text-red-400 drop-shadow-[0_0_12px_rgba(248,113,113,0.35)]'
  })()

  const targetNoteClass =
    feedback === 'hit'
      ? 'text-emerald-400 drop-shadow-[0_0_28px_rgba(52,211,153,0.55)]'
      : feedback === 'miss'
        ? 'text-red-500 drop-shadow-[0_0_28px_rgba(239,68,68,0.5)]'
        : 'text-white drop-shadow-[0_0_25px_rgba(255,255,255,0.8)]'

  const feedbackLabel =
    feedback === 'hit' ? 'Acerto!' : feedback === 'miss' ? 'Erro' : null

  return (
    <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl flex-col overflow-hidden bg-[#0a0a0a] text-[#F5F5F5]">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: `radial-gradient(circle at 50% 20%, #FFB300 0%, transparent 55%),
            linear-gradient(180deg, #121212 0%, #0a0a0a 100%)`,
        }}
        aria-hidden
      />

      <header className="relative z-10 border-b border-white/10 px-4 py-5 md:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2 text-[#FFB300]">
              <Zap className="h-5 w-5" strokeWidth={2} aria-hidden />
              <span className="text-xs font-semibold uppercase tracking-[0.2em]">
                Desafio
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              Corrida de Escalas
            </h1>
            <p className="mt-1 text-sm text-[#F5F5F5]/60">
              Pentatônica de Lá menor — uma nota por batida. Após iniciar, toque
              Lá (primeira nota) para o metrônomo começar. Um erro (nota errada
              ou silêncio na batida) encerra na hora. Complete as 16 notas para
              ganhar créditos.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 text-right">
            <p className="text-xs font-medium uppercase tracking-wider text-[#F5F5F5]/45">
              Tentativas Restantes:{' '}
              <span className="font-mono text-lg font-bold tabular-nums text-[#F5F5F5]/90">
                {attemptsLeft}/3
              </span>
            </p>
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs font-medium uppercase tracking-wider text-[#F5F5F5]/45">
                BPM
              </span>
              <span className="font-mono text-2xl font-bold tabular-nums text-[#FFB300]">
                {bpm}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-4">
          <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs text-[#F5F5F5]/55">
            <span>Velocidade (BPM)</span>
            <input
              type="range"
              min={BPM_MIN}
              max={BPM_MAX}
              value={bpm}
              disabled={isRunning || awaitingFirstNote}
              onChange={(e) => setBpm(Number(e.target.value))}
              className="h-2 w-full cursor-pointer accent-[#FFB300] disabled:opacity-50"
            />
          </label>
        </div>
      </header>

      {micError ? (
        <p className="relative z-10 px-4 text-sm font-medium text-red-500 md:px-8">
          {micError}
        </p>
      ) : null}

      {runOutcome ? (
        <div
          className="relative z-10 border-b border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm md:px-8"
          role="status"
        >
          <p
            className={[
              'text-center text-base font-bold tracking-tight',
              runOutcome.kind === 'success'
                ? 'text-emerald-400'
                : 'text-[#F5F5F5]/85',
            ].join(' ')}
          >
            {runOutcome.kind === 'fail'
              ? 'Tentativa Finalizada'
              : `Sucesso! +${runOutcome.credits} Créditos`}
          </p>
        </div>
      ) : null}

      <div className="relative z-10 flex flex-1 flex-col px-4 py-8 md:px-8 md:py-10">
        <div className="grid grid-cols-1 items-stretch gap-8 md:grid-cols-2">
          {/* Palco do avatar — mobile: abaixo do HUD */}
          <div className="order-2 flex h-full min-h-0 md:order-1">
            <div className="relative flex h-full min-h-[400px] w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-b from-[#1E1E1E] to-black shadow-[inset_0_-50px_50px_-50px_rgba(255,179,0,0.15)] backdrop-blur-sm">
              <div
                className="pointer-events-none absolute left-1/2 top-1/2 h-[140%] w-[140%] -translate-x-1/2 -translate-y-1/2 opacity-80"
                style={{
                  backgroundImage:
                    'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 22%, transparent 58%)',
                }}
                aria-hidden
              />
              <div className="relative flex w-full flex-1 flex-col items-center justify-center overflow-hidden p-3">
                <AvatarViewer
                  ref={avatarRef}
                  equippedItems={equippedItems}
                  size={360}
                  motion={SCALE_RUNNER_AVATAR_MOTION}
                  layout={SCALE_RUNNER_AVATAR_LAYOUT}
                  outerHeightPx={400}
                  backdrop={false}
                  floor={false}
                  className="mx-auto w-full max-w-[min(100%,420px)] shrink-0"
                />
              </div>
            </div>
          </div>

          {/* Game HUD */}
          <div className="order-1 flex h-full min-h-0 md:order-2">
            <div className="relative flex h-full min-h-[400px] w-full flex-col justify-between gap-6 rounded-2xl border border-white/10 bg-white/5 p-6 pt-14 backdrop-blur-md sm:pt-6 sm:pr-6">
              {/* Combo badge — canto superior direito */}
              <div
                className="absolute right-4 top-4 z-10 flex flex-col items-center rounded-full border border-[#FFB300]/50 bg-[#FFB300]/20 px-4 py-2 font-bold text-[#FFB300] shadow-[0_4px_20px_rgba(255,179,0,0.12)]"
                aria-label={`Combo ${combo}`}
              >
                <span className="text-[0.6rem] font-bold uppercase tracking-[0.15em] text-[#FFB300]/95">
                  Combo
                </span>
                <span className="font-mono text-2xl font-black tabular-nums leading-none">
                  {combo}
                </span>
              </div>

              {/* Topo: progresso */}
              <div className="shrink-0 pr-2 sm:pr-36">
                <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-[#F5F5F5]/50">
                  <span>Progresso</span>
                  <span className="font-mono tabular-nums text-[#FFB300]">
                    {progressCurrent}/{SEQUENCE_LEN}
                  </span>
                </div>
                <div
                  className="h-4 w-full overflow-hidden rounded-full bg-black/35"
                  role="progressbar"
                  aria-valuenow={progressCurrent}
                  aria-valuemin={0}
                  aria-valuemax={SEQUENCE_LEN}
                  aria-label={`Nota ${progressCurrent} de ${SEQUENCE_LEN}`}
                >
                  <div
                    className="h-full rounded-full bg-[#FFB300] shadow-[0_0_10px_#FFB300] transition-[width] duration-200 ease-out"
                    style={{ width: `${progressRatio * 100}%` }}
                  />
                </div>
              </div>

              {/* Centro: alvo — ocupa espaço e centraliza no eixo vertical */}
              <div
                className="flex min-h-0 flex-1 flex-col items-center justify-center text-center"
                aria-live="polite"
              >
                <span className="mb-3 text-[0.7rem] font-bold uppercase tracking-[0.35em] text-[#FFB300]/85">
                  Agora
                </span>
                <div className="mx-auto flex h-32 w-32 shrink-0 items-center justify-center rounded-full border-2 border-white/10 bg-black/20">
                  <span
                    className={[
                      'font-mono text-8xl font-black leading-none tracking-tight transition-colors duration-200',
                      targetNoteClass,
                    ].join(' ')}
                  >
                    {currentNote}
                  </span>
                </div>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#F5F5F5]/40">
                    Próxima
                  </span>
                  <span className="font-mono text-2xl font-bold text-[#FFB300] sm:text-3xl">
                    {nextNote}
                  </span>
                </div>
                {feedbackLabel ? (
                  <span
                    className={[
                      'mt-4 text-sm font-bold uppercase tracking-wide',
                      feedback === 'hit' ? 'text-emerald-400' : 'text-red-400',
                    ].join(' ')}
                  >
                    {feedbackLabel}
                  </span>
                ) : (
                  <span className="mt-4 max-w-sm text-sm font-medium text-[#F5F5F5]/50">
                    {awaitingFirstNote
                      ? `Toque ${FIRST_NOTE} (Lá) limpo para iniciar o metrônomo…`
                      : isRunning
                        ? 'Aguardando batida…'
                        : 'Pronto para começar.'}
                  </span>
                )}
              </div>

              {/* Base: ouvindo + gabarito */}
              <div className="shrink-0 space-y-4">
                <div className="space-y-1 text-center sm:text-left">
                  <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-[#F5F5F5]/35">
                    Ouvindo
                  </p>
                  <p
                    className={[
                      'font-mono text-4xl font-black transition-colors duration-150 sm:text-5xl',
                      heardMicClass,
                    ].join(' ')}
                  >
                    {lastHeard}
                  </p>
                  {expectedChromaticForMic ? (
                    <p className="pt-1 text-xs text-[#F5F5F5]/35">
                      Alvo{' '}
                      <span className="font-mono font-semibold text-[#FFB300]/70">
                        {expectedChromaticForMic}
                      </span>
                    </p>
                  ) : null}
                </div>
                <p className="text-center text-[0.65rem] leading-relaxed text-gray-500 sm:text-left">
                  Gabarito: {SCALE_RUNNER_SEQUENCE.join(' → ')} · Recompensa:{' '}
                  metade do BPM em créditos (ex.: {bpm} BPM →{' '}
                  {Math.floor(bpm / 2)} créditos).
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <footer className="relative z-10 mt-auto border-t border-white/10 px-4 py-6 md:px-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3">
          {!micReady ? (
            <button
              type="button"
              onClick={() =>
                void startMic().catch(() => {
                  setMicError(
                    'Microfone indisponível ou permissão negada. Verifique as definições do navegador.',
                  )
                })
              }
              className="w-full rounded-2xl bg-gradient-to-b from-[#2a2418] via-[#1a1814] to-[#0f0e0c] px-6 py-4 text-base font-bold text-[#FFB300] shadow-[0_0_0_1px_rgba(255,179,0,0.35),0_8px_32px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.08)] transition hover:shadow-[0_0_0_1px_rgba(255,179,0,0.55),0_12px_40px_rgba(255,179,0,0.18),inset_0_1px_0_rgba(255,255,255,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB300]/50"
            >
              Ligar microfone
            </button>
          ) : awaitingFirstNote ? (
            <>
              <button
                type="button"
                onClick={stopRun}
                className="w-full rounded-xl border border-white/10 bg-white/5 py-3.5 text-base font-semibold text-[#F5F5F5] backdrop-blur-sm transition hover:border-red-500/50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  stopRun()
                  stopMic()
                }}
                className="w-full rounded-xl border border-white/10 bg-transparent py-3 text-sm font-medium text-[#F5F5F5]/75 transition hover:border-red-500/40 hover:bg-white/5"
              >
                Desligar microfone
              </button>
            </>
          ) : !isRunning ? (
            <>
              <button
                type="button"
                onClick={beginRun}
                disabled={attemptsLeft === 0}
                title={
                  attemptsLeft === 0
                    ? 'Sem tentativas restantes hoje'
                    : undefined
                }
                className="w-full rounded-2xl border border-[#FFB300]/50 bg-gradient-to-b from-[#FFB300] to-[#e6a200] py-4 text-base font-bold text-black shadow-[0_0_32px_rgba(255,179,0,0.35)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:border-[#444] disabled:bg-[#1A1A1A] disabled:bg-none disabled:text-[#F5F5F5]/35 disabled:shadow-none"
              >
                Iniciar corrida
              </button>
              <button
                type="button"
                onClick={() => {
                  stopRun()
                  stopMic()
                }}
                className="w-full rounded-xl border border-white/10 bg-transparent py-3 text-sm font-medium text-[#F5F5F5]/75 transition hover:border-red-500/40 hover:bg-white/5"
              >
                Desligar microfone
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={stopRun}
              className="w-full rounded-xl border border-white/10 bg-white/5 py-3.5 text-base font-semibold text-[#F5F5F5] backdrop-blur-sm transition hover:border-red-500/50"
            >
              Parar corrida
            </button>
          )}
        </div>
      </footer>
    </div>
  )
}
