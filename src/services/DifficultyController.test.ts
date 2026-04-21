import { describe, expect, it } from 'vitest'
import { difficultyController } from './DifficultyController'

describe('DifficultyController', () => {
  it('sobe tier com performance alta consistente', () => {
    const model = difficultyController.getDefaultModel(4)
    const first = difficultyController.decide({
      currentTier: 4,
      model,
      stats: {
        notesTotal: 20,
        notesHit: 19,
        notesMissed: 1,
        score: 1800,
        maxCombo: 16,
        avgTimingErrorBeats: 0.03,
        avgPitchErrorCents: 8,
        accuracy: 0.95,
      },
    })
    const second = difficultyController.decide({
      currentTier: first.nextTier,
      model: first.model,
      stats: {
        notesTotal: 20,
        notesHit: 18,
        notesMissed: 2,
        score: 1720,
        maxCombo: 12,
        avgTimingErrorBeats: 0.04,
        avgPitchErrorCents: 10,
        accuracy: 0.9,
      },
    })
    expect(second.nextTier).toBe(5)
    expect(second.reason).toBe('raise')
  })

  it('desce tier quando desempenho cai', () => {
    const model = difficultyController.getDefaultModel(7)
    const result = difficultyController.decide({
      currentTier: 7,
      model,
      stats: {
        notesTotal: 20,
        notesHit: 8,
        notesMissed: 12,
        score: 700,
        maxCombo: 3,
        avgTimingErrorBeats: 0.18,
        avgPitchErrorCents: 52,
        accuracy: 0.4,
      },
    })
    expect(result.nextTier).toBe(6)
    expect(result.reason).toBe('lower')
  })
})
