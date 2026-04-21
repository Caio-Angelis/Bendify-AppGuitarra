import { useCallback, useMemo, useState } from 'react'
import Fretboard, {
  type FretHighlight,
  type FretboardClickPayload,
} from '../components/Fretboard'
import {
  CHROMATIC,
  MAX_OPEN_FRETS,
  STRING_LABELS,
  fretsForNoteOnString,
  noteAtStringFret,
} from '../components/fretboardUtils'
import { useChallengePracticeTracking } from '../hooks/useChallengePracticeTracking'
import { useStore } from '../store/useStore'

type Feedback = 'idle' | 'success' | 'error'

type Challenge = {
  stringIndex: number
  targetNote: string
}

function randomInt(n: number) {
  return Math.floor(Math.random() * n)
}

function pickChallenge(): Challenge {
  const targetNote = CHROMATIC[randomInt(CHROMATIC.length)]
  const stringIndex = randomInt(STRING_LABELS.length)
  return { stringIndex, targetNote }
}

function progressSteps(streak: number) {
  if (streak <= 0) return 0
  const m = streak % 5
  return m === 0 ? 5 : m
}

export default function FretboardMastery() {
  useChallengePracticeTracking('challenge-fretboard')

  const fretboardLevel = useStore((s) => s.userStats.fretboardLevel)
  const fretboardStreak = useStore((s) => s.userStats.fretboardStreak)
  const updateFretboardStreak = useStore((s) => s.updateFretboardStreak)
  const levelUpFretboard = useStore((s) => s.levelUpFretboard)

  const [challenge, setChallenge] = useState<Challenge>(() => pickChallenge())
  const [feedback, setFeedback] = useState<Feedback>('idle')
  const [levelUpFlash, setLevelUpFlash] = useState(false)
  const [solutionHighlights, setSolutionHighlights] = useState<
    FretHighlight[] | undefined
  >(undefined)

  const stringName = STRING_LABELS[challenge.stringIndex]

  const newRound = useCallback(() => {
    setFeedback('idle')
    setSolutionHighlights(undefined)
    setChallenge(pickChallenge())
  }, [])

  const correctHighlightsForChallenge = useMemo((): FretHighlight[] => {
    const frets = fretsForNoteOnString(challenge.stringIndex, challenge.targetNote)
    return frets.map((fret) => ({ stringIndex: challenge.stringIndex, fret }))
  }, [challenge.stringIndex, challenge.targetNote])

  const handleCellClick = (payload: FretboardClickPayload) => {
    if (feedback === 'success') return

    const onChallengeString = payload.stringIndex === challenge.stringIndex
    const noteMatches = payload.note === challenge.targetNote

    if (onChallengeString && noteMatches) {
      setFeedback('success')
      setSolutionHighlights(undefined)

      const prevStreak = useStore.getState().userStats.fretboardStreak
      const newStreak = prevStreak + 1
      updateFretboardStreak(newStreak)

      if (newStreak > 0 && newStreak % 5 === 0) {
        levelUpFretboard()
        setLevelUpFlash(true)
        window.setTimeout(() => setLevelUpFlash(false), 2200)
      }

      window.setTimeout(() => {
        newRound()
      }, 1200)
      return
    }

    setFeedback('error')
    updateFretboardStreak(0)
    setSolutionHighlights(correctHighlightsForChallenge)

    window.setTimeout(() => {
      newRound()
    }, 1800)
  }

  const steps = progressSteps(fretboardStreak)
  const progressPct = (steps / 5) * 100
  const boardDisabled = feedback === 'success'
  const highlights =
    feedback === 'error' ? solutionHighlights : undefined

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-4xl flex-col bg-[#121212] text-[#F5F5F5]">
      <header className="mb-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-xl font-semibold tracking-tight">
            Ninja do Braço
          </h1>
          <p className="text-sm font-medium text-[#FFB300]">
            Nível {fretboardLevel}
          </p>
        </div>
        <p className="text-sm text-[#F5F5F5]/70">
          Encontre a nota{' '}
          <span className="font-semibold text-[#FFB300]">
            {challenge.targetNote}
          </span>{' '}
          na corda{' '}
          <span className="font-semibold text-[#FFB300]">{stringName}</span>{' '}
          (casas 0–{MAX_OPEN_FRETS}).
        </p>
        <div>
          <div className="mb-1 flex justify-between text-xs text-[#F5F5F5]/60">
            <span>Progresso até level up</span>
            <span>{steps}/5 acertos</span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-[#1A1A1A] ring-1 ring-[#333333]"
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
          className="mb-4 rounded-lg border border-[#FFB300] bg-[#1A1A1A] px-4 py-3 text-center text-sm font-semibold text-[#FFB300] shadow-[0_0_20px_rgba(255,179,0,0.35)]"
          role="status"
        >
          Level Up!
        </div>
      )}

      {feedback === 'success' && (
        <p
          className="mb-3 text-center text-sm font-medium text-[#FFB300]"
          role="status"
        >
          Correto! Ótimo ouvido no braço.
        </p>
      )}

      {feedback === 'error' && (
        <p
          className="mb-3 text-center text-sm font-medium text-red-400/95"
          role="alert"
        >
          A posição certa na corda {stringName} está realçada.
        </p>
      )}

      <Fretboard
        onCellClick={handleCellClick}
        highlights={highlights}
        disabled={boardDisabled}
        showCellNotes={false}
      />

      <p className="mt-4 text-center text-xs text-[#F5F5F5]/45">
        Afinação padrão:{' '}
        {STRING_LABELS.map((L, i) => `${L} (${noteAtStringFret(i, 0)})`).join(' · ')}
      </p>
    </div>
  )
}
