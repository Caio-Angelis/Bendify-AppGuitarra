export type GameStyle = 'blues' | 'metal' | 'bossa' | 'fusion'

export type DifficultyTier = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

export type TimingFeedback = 'early' | 'late' | 'on-time'
export type PitchFeedback = 'in-tune' | 'out-of-tune' | 'no-input'

export type NoteEvent = {
  id: string
  startBeat: number
  durationBeats: number
  midi: number
  frequencyHz: number
  lane: number
  accent: boolean
}

export type RenderableNote = {
  id: string
  lane: number
  startBeat: number
  durationBeats: number
  targetLabel: string
  chromatic: string
  octave: number
  yNormalized: number
  isPastHitLine: boolean
  isHit: boolean
  isMissed: boolean
}

export type ChartSegment = {
  id: string
  style: GameStyle
  key: string
  bpm: number
  bars: 8 | 16
  startBeat: number
  endBeat: number
  difficulty: DifficultyTier
  notes: NoteEvent[]
  nextTarget: NoteEvent | null
}

export type PerformanceFrame = {
  nowBeat: number
  event: NoteEvent
  detectedFrequencyHz: number | null
  timingOffsetBeats: number
  sustainRatio: number
  pitchDeltaCents: number | null
}

export type NoteScoreBreakdown = {
  total: number
  timing: number
  pitch: number
  sustain: number
  timingFeedback: TimingFeedback
  pitchFeedback: PitchFeedback
  severeMiss: boolean
}

export type RunStats = {
  notesTotal: number
  notesHit: number
  notesMissed: number
  score: number
  maxCombo: number
  avgTimingErrorBeats: number
  avgPitchErrorCents: number
  accuracy: number
}

export type PlayerSkillModel = {
  rollingAccuracy: number
  rollingTiming: number
  rollingPitch: number
  consistencyHighStreak: number
  consistencyLowStreak: number
  lastTier: DifficultyTier
}

export type DifficultyDecision = {
  nextTier: DifficultyTier
  model: PlayerSkillModel
  reason: 'raise' | 'lower' | 'hold'
}

export type GuitarHeroRunSnapshot = {
  style: GameStyle
  key: string
  bpm: number
  difficulty: DifficultyTier
  score: number
  combo: number
  multiplier: number
  accuracy: number
  feedback: string
  visibleNotes: RenderableNote[]
  hitLineY: number
  lookaheadBeats: number
  laneCount: number
  currentTargetLabel: string
  upcomingTargetLabels: string[]
  detectedNoteLabel: string | null
  detectedCentsDelta: number | null
}
