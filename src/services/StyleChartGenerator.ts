import * as Tone from 'tone'
import type {
  ChartSegment,
  DifficultyTier,
  GameStyle,
  NoteEvent,
} from '../types/guitarHero'

type SegmentParams = {
  style: GameStyle
  key: string
  bpm: number
  difficulty: DifficultyTier
  segmentIndex: number
  bars?: 8 | 16
  seed: number
}

const STYLE_INTERVALS: Record<GameStyle, number[]> = {
  blues: [0, 3, 5, 6, 7, 10],
  metal: [0, 2, 3, 5, 7, 8, 10],
  bossa: [0, 2, 4, 5, 7, 9, 11],
  fusion: [0, 2, 3, 5, 7, 9, 10, 11],
}

const STYLE_DENSITY: Record<GameStyle, number> = {
  blues: 0.45,
  metal: 0.62,
  bossa: 0.4,
  fusion: 0.58,
}

const STYLE_LANES: Record<GameStyle, number> = {
  blues: 3,
  metal: 5,
  bossa: 4,
  fusion: 5,
}

function xmur3(str: string) {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return h >>> 0
  }
}

function mulberry32(seed: number) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let x = Math.imul(t ^ (t >>> 15), 1 | t)
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

function clampTier(value: number): DifficultyTier {
  const rounded = Math.round(value)
  if (rounded <= 1) return 1
  if (rounded >= 10) return 10
  return rounded as DifficultyTier
}

function pickDuration(rand: () => number, tier: DifficultyTier): number {
  if (tier <= 3) return rand() > 0.75 ? 1 : 2
  if (tier <= 6) return rand() > 0.6 ? 1 : 2
  return rand() > 0.75 ? 0.5 : 1
}

function noteFromInterval(key: string, interval: number, octave: number): number {
  return Tone.Frequency(`${key}${octave}`).toMidi() + interval
}

export class StyleChartGenerator {
  generateSegment(params: SegmentParams): ChartSegment {
    const bars = params.bars ?? 8
    const beatsPerBar = 4
    const beatsTotal = bars * beatsPerBar
    const startBeat = params.segmentIndex * beatsTotal
    const seedStr = `${params.seed}:${params.style}:${params.key}:${params.segmentIndex}:${params.difficulty}`
    const seedInt = xmur3(seedStr)()
    const rand = mulberry32(seedInt)

    const intervals = STYLE_INTERVALS[params.style]
    const baseDensity = STYLE_DENSITY[params.style]
    const laneCount = STYLE_LANES[params.style]
    const tier = clampTier(params.difficulty)
    const density = Math.min(0.9, baseDensity + tier * 0.03)

    const notes: NoteEvent[] = []
    let cursorBeat = 0
    let idx = 0
    while (cursorBeat < beatsTotal) {
      const shouldPlace = rand() < density || cursorBeat === 0
      const duration = pickDuration(rand, tier)
      if (shouldPlace) {
        const interval = intervals[Math.floor(rand() * intervals.length)] ?? 0
        const octave = tier >= 6 && rand() > 0.65 ? 4 : 3
        const midi = noteFromInterval(params.key, interval, octave)
        const frequencyHz = Tone.Frequency(midi, 'midi').toFrequency()
        notes.push({
          id: `seg-${params.segmentIndex}-n-${idx}`,
          startBeat: startBeat + cursorBeat,
          durationBeats: duration,
          midi,
          frequencyHz,
          lane: idx % laneCount,
          accent: rand() > 0.78,
        })
        idx += 1
      }
      cursorBeat += duration
    }

    return {
      id: `seg-${params.segmentIndex}-${params.style}-${params.key}`,
      style: params.style,
      key: params.key,
      bpm: params.bpm,
      bars,
      startBeat,
      endBeat: startBeat + beatsTotal,
      difficulty: tier,
      notes,
      nextTarget: notes[0] ?? null,
    }
  }
}

export const styleChartGenerator = new StyleChartGenerator()
