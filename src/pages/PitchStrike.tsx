import { useCallback, useEffect, useRef, useState } from 'react'
import Pitchfinder from 'pitchfinder'
import { useChallengePracticeTracking } from '../hooks/useChallengePracticeTracking'
import { useStore } from '../store/useStore'
import { getPreferredMicId } from '../utils/audioDevicePreferences'
import {
  chromaticBaseLetter,
  foldToGuitarFundamental,
  freqToTunerLabel,
  rmsFloat32,
  smoothPitchEMA,
} from '../utils/guitarPitch'

const BASE_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const
const FFT_SIZE = 8192
const RMS_SILENCE = 0.0011
const MATCH_FRAMES = 3
const NEXT_ROUND_MS = 1000
const FREQ_MIN = 45
const FREQ_MAX = 1400

function pickRandomNote(): (typeof BASE_NOTES)[number] {
  return BASE_NOTES[Math.floor(Math.random() * BASE_NOTES.length)]
}

function progressSteps(streak: number) {
  if (streak <= 0) return 0
  const m = streak % 5
  return m === 0 ? 5 : m
}

export default function PitchStrike() {
  const [isActive, setIsActive] = useState(false)
  useChallengePracticeTracking('challenge-pitch-strike', isActive)

  const pitchStrikeLevel = useStore((s) => s.userStats.pitchStrikeLevel)
  const pitchStrikeStreak = useStore((s) => s.userStats.pitchStrikeStreak)
  const updatePitchStrikeStreak = useStore((s) => s.updatePitchStrikeStreak)
  const levelUpPitchStrike = useStore((s) => s.levelUpPitchStrike)

  const [targetNote, setTargetNote] = useState<(typeof BASE_NOTES)[number] | ''>(
    '',
  )
  const [detectedNote, setDetectedNote] = useState('—')
  const [hitSuccess, setHitSuccess] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)
  const [levelUpFlash, setLevelUpFlash] = useState(false)

  const rafRef = useRef(0)
  const streamRef = useRef<MediaStream | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const aliveRef = useRef(false)
  const pausedRef = useRef(false)
  const consecutiveMatchRef = useRef(0)
  const smoothFreqRef = useRef<number | null>(null)
  const detectYinRef = useRef<((buf: Float32Array) => number | null) | null>(
    null,
  )
  const detectMacleodRef = useRef<
    ((buf: Float32Array) => { freq: number; probability: number }) | null
  >(null)
  const targetNoteRef = useRef<(typeof BASE_NOTES)[number] | ''>('')
  const resumeTimerRef = useRef<number | null>(null)
  const uiThrottleRef = useRef({ t: 0, label: '—' })

  const generateTarget = useCallback(() => {
    let next = pickRandomNote()
    const cur = targetNoteRef.current
    if (cur && BASE_NOTES.length > 1) {
      while (next === cur) {
        next = pickRandomNote()
      }
    }
    targetNoteRef.current = next
    setTargetNote(next)
  }, [])

  const stopPipeline = useCallback(() => {
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
    pausedRef.current = false
    uiThrottleRef.current = { t: 0, label: '—' }
    setDetectedNote('—')
  }, [])

  useEffect(() => {
    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current)
      resumeTimerRef.current = null
    }
    if (!isActive) {
      aliveRef.current = false
      stopPipeline()
      setTargetNote('')
      targetNoteRef.current = ''
      setHitSuccess(false)
      return
    }

    aliveRef.current = true
    pausedRef.current = false
    consecutiveMatchRef.current = 0
    setMicError(null)

    void (async () => {
      try {
        const micId = getPreferredMicId()
        const audioConstraints: MediaTrackConstraints = {
          echoCancellation: false,
          noiseSuppression: true,
          autoGainControl: true,
        }
        if (micId) {
          audioConstraints.deviceId = { exact: micId }
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
        })
        if (!aliveRef.current) {
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
        const yin = Pitchfinder.YIN({
          sampleRate: sr,
          threshold: 0.085,
          probabilityThreshold: 0.04,
        })
        const macleod = Pitchfinder.Macleod({
          bufferSize: FFT_SIZE,
          sampleRate: sr,
          cutoff: 0.9,
        })
        detectYinRef.current = yin
        detectMacleodRef.current = macleod

        const buffer = new Float32Array(FFT_SIZE)
        smoothFreqRef.current = null

        generateTarget()

        function onThreeFrameMatch() {
          cancelAnimationFrame(rafRef.current)
          rafRef.current = 0
          pausedRef.current = true
          setHitSuccess(true)

          const prevStreak = useStore.getState().userStats.pitchStrikeStreak
          const newStreak = prevStreak + 1
          updatePitchStrikeStreak(newStreak)
          if (newStreak > 0 && newStreak % 5 === 0) {
            levelUpPitchStrike()
            setLevelUpFlash(true)
            window.setTimeout(() => setLevelUpFlash(false), 2200)
          }

          resumeTimerRef.current = window.setTimeout(() => {
            resumeTimerRef.current = null
            runAfterSuccess()
          }, NEXT_ROUND_MS)
        }

        function runAfterSuccess() {
          setHitSuccess(false)
          generateTarget()
          consecutiveMatchRef.current = 0
          pausedRef.current = false
          if (!aliveRef.current) return
          rafRef.current = requestAnimationFrame(tick)
        }

        function tick() {
          if (!aliveRef.current || pausedRef.current) return
          if (!detectYinRef.current || !detectMacleodRef.current) return

          analyser.getFloatTimeDomainData(buffer)
          const energy = rmsFloat32(buffer)

          if (energy < RMS_SILENCE) {
            smoothFreqRef.current = null
            consecutiveMatchRef.current = 0
            const th = uiThrottleRef.current
            const now = performance.now()
            if (now - th.t > 120 || th.label !== '—') {
              uiThrottleRef.current = { t: now, label: '—' }
              setDetectedNote('—')
            }
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
          const display = parts?.label ?? '—'
          const now = performance.now()
          const th = uiThrottleRef.current
          if (now - th.t > 45 || display !== th.label) {
            uiThrottleRef.current = { t: now, label: display }
            setDetectedNote(display)
          }

          const target = targetNoteRef.current
          if (target && parts) {
            const heardLetter = chromaticBaseLetter(parts.chromatic)
            if (heardLetter === target) {
              consecutiveMatchRef.current += 1
              if (consecutiveMatchRef.current >= MATCH_FRAMES) {
                consecutiveMatchRef.current = 0
                onThreeFrameMatch()
                return
              }
            } else {
              consecutiveMatchRef.current = 0
            }
          } else {
            consecutiveMatchRef.current = 0
          }

          rafRef.current = requestAnimationFrame(tick)
        }

        rafRef.current = requestAnimationFrame(tick)
      } catch {
        if (aliveRef.current) {
          setMicError(
            'Microfone indisponível ou permissão negada. Verifique as definições do navegador.',
          )
          setIsActive(false)
        }
      }
    })()

    return () => {
      aliveRef.current = false
      if (resumeTimerRef.current) {
        clearTimeout(resumeTimerRef.current)
        resumeTimerRef.current = null
      }
      stopPipeline()
    }
  }, [
    isActive,
    stopPipeline,
    generateTarget,
    updatePitchStrikeStreak,
    levelUpPitchStrike,
  ])

  useEffect(() => {
    return () => {
      aliveRef.current = false
      if (resumeTimerRef.current) {
        clearTimeout(resumeTimerRef.current)
        resumeTimerRef.current = null
      }
      cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach((tr) => tr.stop())
      void ctxRef.current?.close()
    }
  }, [])

  const steps = progressSteps(pitchStrikeStreak)
  const progressPct = (steps / 5) * 100

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col text-[#F5F5F5]">
      <header className="mb-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold tracking-tight">
            Desafio de Precisão
          </h1>
          <p className="text-sm font-medium text-[#FFB300]">
            Nível {pitchStrikeLevel}
          </p>
        </div>
        <div className="flex items-center justify-between text-sm text-[#F5F5F5]/75">
          <span>Sequência atual</span>
          <span className="font-mono tabular-nums text-[#FFB300]">
            {pitchStrikeStreak} acertos
          </span>
        </div>
        <div>
          <div className="mb-1 flex justify-between text-xs text-[#F5F5F5]/60">
            <span>Progresso até level up</span>
            <span>{steps}/5</span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-white/5 ring-1 ring-white/10 backdrop-blur-sm"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={5}
            aria-valuenow={steps}
          >
            <div
              className="h-full bg-[#FFB300] transition-[width] duration-300 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </header>

      {levelUpFlash ? (
        <div
          className="mb-4 rounded-lg border border-[#FFB300]/40 bg-white/5 px-4 py-3 text-center text-sm font-semibold text-[#FFB300] shadow-[0_0_20px_rgba(255,179,0,0.20)] backdrop-blur-sm"
          role="status"
        >
          Level Up!
        </div>
      ) : null}

      {micError ? (
        <p className="mb-4 text-sm font-medium text-[#D32F2F]">{micError}</p>
      ) : null}

      <section className="flex flex-col items-center justify-center gap-8 rounded-2xl border border-white/10 bg-white/5 py-10 backdrop-blur-sm">
        <div
          className={[
            'flex h-[min(18rem,72vw)] w-[min(18rem,72vw)] shrink-0 items-center justify-center rounded-full border-4 bg-[#121212]/40 backdrop-blur-sm transition-[color,box-shadow,border-color] duration-300 ease-out',
            hitSuccess
              ? 'border-[#FFB300] shadow-[0_0_48px_rgba(255,179,0,0.45)]'
              : 'border-white/10 shadow-none',
          ].join(' ')}
          aria-live="polite"
        >
          {!isActive ? (
            <p className="px-6 text-center text-sm text-[#F5F5F5]/55">
              Ligue o microfone para tocar a nota indicada na guitarra.
            </p>
          ) : (
            <span
              className={[
                'font-mono text-[min(7rem,22vw)] font-bold leading-none tracking-tight transition-colors duration-300',
                hitSuccess ? 'text-[#FFB300]' : 'text-[#F5F5F5]',
              ].join(' ')}
            >
              {targetNote}
            </span>
          )}
        </div>

        {!isActive ? (
          <button
            type="button"
            onClick={() => {
              setMicError(null)
              setIsActive(true)
            }}
            className="rounded-xl border border-white/10 bg-[#121212]/50 px-8 py-4 text-base font-semibold text-[#F5F5F5] backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[#FFB300]/30 hover:bg-white/5 hover:shadow-lg hover:shadow-[#FFB300]/10"
          >
            Ligar Guitarra / Começar
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setIsActive(false)}
            className="rounded-xl border border-white/10 bg-[#121212]/50 px-8 py-3 text-sm font-medium text-[#F5F5F5]/85 backdrop-blur-sm transition hover:border-[#D32F2F]/50 hover:bg-white/5"
          >
            Parar microfone
          </button>
        )}
      </section>

      <footer className="mt-6 border-t border-white/10 pt-4">
        <p className="text-center text-xs text-[#F5F5F5]/50">
          Ouvindo:{' '}
          <span className="font-mono text-[#F5F5F5]/80">{detectedNote}</span>
          …
        </p>
        <p className="mt-2 text-center text-[0.65rem] text-[#F5F5F5]/40">
          Dica: use o afinador em Ferramentas para escolher o microfone. Notas
          sustentadas e limpas são mais fáceis de detetar.
        </p>
      </footer>
    </div>
  )
}
