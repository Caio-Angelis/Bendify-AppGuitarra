import { describe, expect, it } from 'vitest'
import { performanceTracker } from './PerformanceTracker'

describe('PerformanceTracker', () => {
  it('pontua nota com timing/pitch/sustain e marca feedback', () => {
    const out = performanceTracker.scoreFrame({
      nowBeat: 3.1,
      event: {
        id: 'n1',
        startBeat: 3,
        durationBeats: 1,
        midi: 69,
        frequencyHz: 440,
        lane: 0,
        accent: false,
      },
      detectedFrequencyHz: 441,
      timingOffsetBeats: 0.05,
      sustainRatio: 0.9,
      pitchDeltaCents: 5,
    })
    expect(out.total).toBeGreaterThan(75)
    expect(out.pitchFeedback).toBe('in-tune')
  })

  it('trata ausência de input como erro grave e zera score', () => {
    const out = performanceTracker.scoreFrame({
      nowBeat: 2,
      event: {
        id: 'n2',
        startBeat: 2,
        durationBeats: 1,
        midi: 64,
        frequencyHz: 329.63,
        lane: 1,
        accent: false,
      },
      detectedFrequencyHz: null,
      timingOffsetBeats: 0.2,
      sustainRatio: 0,
      pitchDeltaCents: null,
    })
    expect(out.total).toBe(0)
    expect(out.severeMiss).toBe(true)
    expect(out.pitchFeedback).toBe('no-input')
  })
})
