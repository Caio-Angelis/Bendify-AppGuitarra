import type {
  DifficultyDecision,
  DifficultyTier,
  PlayerSkillModel,
  RunStats,
} from '../types/guitarHero'

function clampTier(value: number): DifficultyTier {
  if (value <= 1) return 1
  if (value >= 10) return 10
  return value as DifficultyTier
}

const DEFAULT_MODEL: PlayerSkillModel = {
  rollingAccuracy: 0.5,
  rollingTiming: 0.12,
  rollingPitch: 24,
  consistencyHighStreak: 0,
  consistencyLowStreak: 0,
  lastTier: 1,
}

export class DifficultyController {
  getDefaultModel(initialTier: DifficultyTier): PlayerSkillModel {
    return { ...DEFAULT_MODEL, lastTier: initialTier }
  }

  decide(params: {
    currentTier: DifficultyTier
    stats: RunStats
    model: PlayerSkillModel
  }): DifficultyDecision {
    const { currentTier, stats, model } = params
    const rollingAccuracy = model.rollingAccuracy * 0.65 + stats.accuracy * 0.35
    const rollingTiming =
      model.rollingTiming * 0.65 + stats.avgTimingErrorBeats * 0.35
    const rollingPitch =
      model.rollingPitch * 0.65 + stats.avgPitchErrorCents * 0.35

    const highPerformance =
      stats.accuracy >= 0.88 &&
      stats.score / Math.max(1, stats.notesTotal) >= 82 &&
      stats.avgTimingErrorBeats <= 0.075
    const lowPerformance =
      stats.accuracy <= 0.55 ||
      stats.score / Math.max(1, stats.notesTotal) <= 45 ||
      stats.notesMissed >= Math.ceil(stats.notesTotal * 0.45)

    const consistencyHighStreak = highPerformance
      ? model.consistencyHighStreak + 1
      : 0
    const consistencyLowStreak = lowPerformance ? model.consistencyLowStreak + 1 : 0

    let nextTier = currentTier
    let reason: DifficultyDecision['reason'] = 'hold'

    if (consistencyHighStreak >= 2) {
      nextTier = clampTier(currentTier + 1)
      reason = 'raise'
    } else if (consistencyLowStreak >= 1) {
      nextTier = clampTier(currentTier - 1)
      reason = 'lower'
    }

    return {
      nextTier,
      reason,
      model: {
        rollingAccuracy,
        rollingTiming,
        rollingPitch,
        consistencyHighStreak,
        consistencyLowStreak,
        lastTier: nextTier,
      },
    }
  }
}

export const difficultyController = new DifficultyController()
