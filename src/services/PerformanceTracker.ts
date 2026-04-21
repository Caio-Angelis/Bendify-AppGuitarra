import type {
  NoteScoreBreakdown,
  PerformanceFrame,
  RunStats,
} from '../types/guitarHero'

const MAX_NOTE_SCORE = 100

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

function timingFeedback(offsetBeats: number): 'early' | 'late' | 'on-time' {
  if (Math.abs(offsetBeats) <= 0.04) return 'on-time'
  return offsetBeats < 0 ? 'early' : 'late'
}

export class PerformanceTracker {
  scoreFrame(frame: PerformanceFrame): NoteScoreBreakdown {
    if (frame.detectedFrequencyHz == null || frame.pitchDeltaCents == null) {
      return {
        total: 0,
        timing: 0,
        pitch: 0,
        sustain: 0,
        timingFeedback: timingFeedback(frame.timingOffsetBeats),
        pitchFeedback: 'no-input',
        severeMiss: true,
      }
    }

    const timingRatio = clamp01(1 - Math.abs(frame.timingOffsetBeats) / 0.25)
    const pitchRatio = clamp01(1 - Math.abs(frame.pitchDeltaCents) / 40)
    const sustainRatio = clamp01(frame.sustainRatio)

    const timing = Math.round(45 * timingRatio)
    const pitch = Math.round(40 * pitchRatio)
    const sustain = Math.round(15 * sustainRatio)
    const total = Math.min(MAX_NOTE_SCORE, timing + pitch + sustain)

    return {
      total,
      timing,
      pitch,
      sustain,
      timingFeedback: timingFeedback(frame.timingOffsetBeats),
      pitchFeedback: pitchRatio >= 0.65 ? 'in-tune' : 'out-of-tune',
      severeMiss: total < 25,
    }
  }

  aggregate(params: {
    noteScores: NoteScoreBreakdown[]
    timingErrors: number[]
    pitchErrors: number[]
    maxCombo: number
  }): RunStats {
    const notesTotal = params.noteScores.length
    const notesHit = params.noteScores.filter((s) => s.total > 0).length
    const notesMissed = notesTotal - notesHit
    const score = params.noteScores.reduce((acc, s) => acc + s.total, 0)

    const avgTimingErrorBeats =
      params.timingErrors.length > 0
        ? params.timingErrors.reduce((a, b) => a + Math.abs(b), 0) /
          params.timingErrors.length
        : 0
    const avgPitchErrorCents =
      params.pitchErrors.length > 0
        ? params.pitchErrors.reduce((a, b) => a + Math.abs(b), 0) /
          params.pitchErrors.length
        : 0
    const accuracy = notesTotal > 0 ? notesHit / notesTotal : 0

    return {
      notesTotal,
      notesHit,
      notesMissed,
      score,
      maxCombo: params.maxCombo,
      avgTimingErrorBeats,
      avgPitchErrorCents,
      accuracy,
    }
  }
}

export const performanceTracker = new PerformanceTracker()
