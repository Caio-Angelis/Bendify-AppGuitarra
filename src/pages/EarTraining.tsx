import { useCallback, useEffect, useRef, useState } from 'react'
import * as Tone from 'tone'
import { useChallengePracticeTracking } from '../hooks/useChallengePracticeTracking'
import { useStore } from '../store/useStore'

const BASE_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const
const OCTAVE = 4
const NEXT_ROUND_MS = 1500

type Feedback = 'idle' | 'success' | 'error'

function pickRandomNote(): (typeof BASE_NOTES)[number] {
  return BASE_NOTES[Math.floor(Math.random() * BASE_NOTES.length)]
}

function withOctave(note: string) {
  return `${note}${OCTAVE}`
}

function progressSteps(streak: number) {
  if (streak <= 0) return 0
  const m = streak % 5
  return m === 0 ? 5 : m
}

export default function EarTraining() {
  useChallengePracticeTracking('challenge-ear-training')

  const earTrainingLevel = useStore((s) => s.userStats.earTrainingLevel)
  const earTrainingStreak = useStore((s) => s.userStats.earTrainingStreak)
  const updateEarTrainingStreak = useStore((s) => s.updateEarTrainingStreak)
  const levelUpEarTraining = useStore((s) => s.levelUpEarTraining)
  const recordDailyEarTrainingCorrect = useStore(
    (s) => s.recordDailyEarTrainingCorrect,
  )

  const [targetNote, setTargetNote] = useState<(typeof BASE_NOTES)[number]>(
    () => pickRandomNote(),
  )
  const [feedback, setFeedback] = useState<Feedback>('idle')
  const [levelUpFlash, setLevelUpFlash] = useState(false)

  const synthRef = useRef<Tone.Synth | null>(null)
  const nextRoundTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const synth = new Tone.Synth().toDestination()
    synthRef.current = synth
    return () => {
      if (nextRoundTimerRef.current) {
        clearTimeout(nextRoundTimerRef.current)
        nextRoundTimerRef.current = null
      }
      synth.dispose()
      synthRef.current = null
    }
  }, [])

  const clearNextRoundTimer = useCallback(() => {
    if (nextRoundTimerRef.current) {
      clearTimeout(nextRoundTimerRef.current)
      nextRoundTimerRef.current = null
    }
  }, [])

  const playTarget = useCallback(async () => {
    await Tone.start()
    const synth = synthRef.current
    if (!synth) return
    synth.triggerAttackRelease(withOctave(targetNote), '8n')
  }, [targetNote])

  const scheduleNextRound = useCallback(
    (nextTarget: (typeof BASE_NOTES)[number]) => {
      clearNextRoundTimer()
      const id = window.setTimeout(() => {
        setTargetNote(nextTarget)
        setFeedback('idle')
        nextRoundTimerRef.current = null
      }, NEXT_ROUND_MS)
      nextRoundTimerRef.current = id
    },
    [clearNextRoundTimer],
  )

  const handleListen = async () => {
    if (feedback === 'success') return
    await Tone.start()
    await playTarget()
  }

  const handleGuess = async (guess: (typeof BASE_NOTES)[number]) => {
    if (feedback === 'success') return
    await Tone.start()
    const synth = synthRef.current
    if (!synth) return

    if (guess === targetNote) {
      setFeedback('success')
      synth.triggerAttackRelease('C6', '16n')

      const prevStreak = useStore.getState().userStats.earTrainingStreak
      const newStreak = prevStreak + 1
      updateEarTrainingStreak(newStreak)
      recordDailyEarTrainingCorrect(1)

      if (newStreak > 0 && newStreak % 5 === 0) {
        levelUpEarTraining()
        setLevelUpFlash(true)
        window.setTimeout(() => setLevelUpFlash(false), 2200)
      }

      let next = pickRandomNote()
      while (next === targetNote && BASE_NOTES.length > 1) {
        next = pickRandomNote()
      }
      scheduleNextRound(next)
    } else {
      setFeedback('error')
      clearNextRoundTimer()
      synth.triggerAttackRelease('C2', '8n')
      updateEarTrainingStreak(0)
      window.setTimeout(() => {
        setFeedback('idle')
        setTargetNote(pickRandomNote())
      }, 900)
    }
  }

  const steps = progressSteps(earTrainingStreak)
  const progressPct = (steps / 5) * 100
  const guessingDisabled = feedback === 'success'

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col text-[#F5F5F5]">
      <header className="mb-8 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold tracking-tight">
            Desafio de Ouvido
          </h1>
          <p className="text-sm font-medium text-[#FFB300]">
            Nível {earTrainingLevel}
          </p>
        </div>
        <div>
          <div className="mb-1 flex justify-between text-xs text-[#F5F5F5]/60">
            <span>Progresso até level up</span>
            <span>
              {steps}/5 acertos
            </span>
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

      {levelUpFlash && (
        <div
          className="mb-6 rounded-lg border border-[#FFB300]/40 bg-white/5 px-4 py-3 text-center text-sm font-semibold text-[#FFB300] shadow-[0_0_20px_rgba(255,179,0,0.20)] backdrop-blur-sm"
          role="status"
        >
          Level Up!
        </div>
      )}

      <section className="flex flex-col items-center justify-center gap-10 rounded-2xl border border-white/10 bg-white/5 px-6 py-10 backdrop-blur-sm">
        <button
          type="button"
          onClick={() => void handleListen()}
          disabled={guessingDisabled}
          className={[
            'rounded-xl border border-white/10 bg-[#121212]/50 px-10 py-4 text-base font-semibold backdrop-blur-sm transition-all duration-300',
            guessingDisabled
              ? 'cursor-not-allowed opacity-50'
              : 'hover:-translate-y-0.5 hover:border-[#FFB300]/30 hover:bg-[#FFB300] hover:text-black hover:shadow-lg hover:shadow-[#FFB300]/10',
            feedback === 'error'
              ? 'ring-2 ring-red-500/70'
              : feedback === 'success'
                ? 'ring-2 ring-[#FFB300]/80'
                : '',
          ].join(' ')}
        >
          Ouvir Nota
        </button>

        <div
          className="grid w-full max-w-md grid-cols-4 gap-3 sm:grid-cols-4"
          role="group"
          aria-label="Escolha da nota"
        >
          {BASE_NOTES.map((note) => (
            <button
              key={note}
              type="button"
              disabled={guessingDisabled}
              onClick={() => void handleGuess(note)}
              className={[
                'rounded-lg border border-white/10 bg-[#121212]/50 py-3 text-center text-lg font-semibold backdrop-blur-sm transition-all duration-300',
                guessingDisabled
                  ? 'cursor-not-allowed opacity-50'
                  : 'hover:-translate-y-0.5 hover:border-[#FFB300]/30 hover:bg-[#FFB300] hover:text-black hover:shadow-lg hover:shadow-[#FFB300]/10',
                feedback === 'success' && note === targetNote
                  ? 'border-[#FFB300] bg-[#FFB300] text-black'
                  : '',
                feedback === 'error' ? 'opacity-90' : '',
              ].join(' ')}
            >
              {note}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
