import * as Tone from 'tone'
import { difficultyController } from './DifficultyController'
import { performanceTracker } from './PerformanceTracker'
import { VirtualBandEngine, type VirtualBandGenre } from './VirtualBandEngine'
import { styleChartGenerator } from './StyleChartGenerator'
import type {
  ChartSegment,
  DifficultyTier,
  GameStyle,
  GuitarHeroRunSnapshot,
  NoteEvent,
  NoteScoreBreakdown,
  PlayerSkillModel,
  RenderableNote,
  RunStats,
  TimingFeedback,
} from '../types/guitarHero'

const MAX_QUEUE = 3
const SCORE_MULTIPLIER_CAP = 4
const HIT_LINE_Y = 0.88
const LOOKAHEAD_BEATS = 8
const MIN_LANE_COUNT = 4
const MAX_LANE_COUNT = 5
const PERFECT_WINDOW_SECONDS = 0.06
const GOOD_WINDOW_SECONDS = 0.11
const MISS_WINDOW_SECONDS = 0.18
const PITCH_TOLERANCE_CENTS = 35

type StartParams = {
  style: GameStyle
  key: string
  bpm: number
  seed: number
  initialDifficulty?: DifficultyTier
}

type FrameInput = {
  nowBeat: number
  detectedFrequencyHz: number | null
}

type SegmentMetrics = {
  noteScores: NoteScoreBreakdown[]
  timingErrors: number[]
  pitchErrors: number[]
  maxCombo: number
}

type NoteVisualMeta = {
  targetLabel: string
  chromatic: string
  octave: number
}

type DetectionSnapshot = {
  noteLabel: string
  midi: number
}

function styleToBandGenre(style: GameStyle): VirtualBandGenre {
  if (style === 'blues') return 'blues'
  return 'rock'
}

function clampTier(value: number): DifficultyTier {
  if (value <= 1) return 1
  if (value >= 10) return 10
  return Math.round(value) as DifficultyTier
}

function midiFromFrequency(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440)
}

function timingFeedback(offsetBeats: number, perfectWindow: number): TimingFeedback {
  if (Math.abs(offsetBeats) <= perfectWindow) return 'on-time'
  return offsetBeats < 0 ? 'early' : 'late'
}

function windowsForBpm(bpm: number): {
  perfect: number
  good: number
  miss: number
} {
  const beatsPerSecond = bpm / 60
  return {
    perfect: PERFECT_WINDOW_SECONDS * beatsPerSecond,
    good: GOOD_WINDOW_SECONDS * beatsPerSecond,
    miss: MISS_WINDOW_SECONDS * beatsPerSecond,
  }
}

function pitchClassFromMidi(midi: number): number {
  const value = Math.round(midi)
  return ((value % 12) + 12) % 12
}

function noteVisualMetaFromMidi(midi: number): NoteVisualMeta {
  const noteLabel = Tone.Frequency(midi, 'midi').toNote()
  const match = /^([A-G]#?)(-?\d+)$/.exec(noteLabel)
  if (!match) {
    return {
      targetLabel: noteLabel,
      chromatic: noteLabel,
      octave: 0,
    }
  }
  return {
    targetLabel: noteLabel,
    chromatic: match[1] ?? noteLabel,
    octave: Number(match[2] ?? 0),
  }
}

function createMissBreakdown(offsetBeats: number, perfectWindow: number): NoteScoreBreakdown {
  return {
    total: 0,
    timing: 0,
    pitch: 0,
    sustain: 0,
    timingFeedback: timingFeedback(offsetBeats, perfectWindow),
    pitchFeedback: 'no-input',
    severeMiss: true,
  }
}

function createHitBreakdown(params: {
  offsetBeats: number
  perfectWindow: number
  quality: 'perfect' | 'good'
}): NoteScoreBreakdown {
  const timingScore = params.quality === 'perfect' ? 55 : 35
  const pitchScore = params.quality === 'perfect' ? 35 : 25
  const sustainScore = params.quality === 'perfect' ? 10 : 5
  return {
    total: timingScore + pitchScore + sustainScore,
    timing: timingScore,
    pitch: pitchScore,
    sustain: sustainScore,
    timingFeedback: timingFeedback(params.offsetBeats, params.perfectWindow),
    pitchFeedback: 'in-tune',
    severeMiss: false,
  }
}

class GuitarHeroEngineImpl {
  private running = false
  private style: GameStyle = 'blues'
  private key = 'A'
  private bpm = 100
  private seed = 1
  private difficulty: DifficultyTier = 1
  private skillModel: PlayerSkillModel = difficultyController.getDefaultModel(1)
  private segments: ChartSegment[] = []
  private segmentIndex = 0
  private startBeat = 0
  private judgedNoteIds = new Set<string>()
  private hitNoteIds = new Set<string>()
  private missedNoteIds = new Set<string>()
  private noteMetaById = new Map<string, NoteVisualMeta>()
  private lastDetected: DetectionSnapshot | null = null
  private segmentMetrics: SegmentMetrics = {
    noteScores: [],
    timingErrors: [],
    pitchErrors: [],
    maxCombo: 0,
  }
  private combo = 0
  private multiplier = 1
  private score = 0
  private feedback = 'Ready'
  private hitsTotal = 0
  private judgedTotal = 0
  private lastStats: RunStats | null = null

  async start(params: StartParams): Promise<void> {
    if (this.running) this.stop()

    this.running = true
    this.style = params.style
    this.key = params.key
    this.bpm = params.bpm
    this.seed = params.seed
    this.difficulty = clampTier(params.initialDifficulty ?? 1)
    this.skillModel = difficultyController.getDefaultModel(this.difficulty)
    this.segmentIndex = 0
    this.startBeat = 0
    this.judgedNoteIds.clear()
    this.hitNoteIds.clear()
    this.missedNoteIds.clear()
    this.noteMetaById.clear()
    this.lastDetected = null
    this.segmentMetrics = {
      noteScores: [],
      timingErrors: [],
      pitchErrors: [],
      maxCombo: 0,
    }
    this.combo = 0
    this.multiplier = 1
    this.score = 0
    this.feedback = 'Ready'
    this.hitsTotal = 0
    this.judgedTotal = 0
    this.lastStats = null
    this.segments = []

    for (let i = 0; i < MAX_QUEUE; i += 1) {
      this.segments.push(this.generateNextSegment())
    }
    this.startBeat = Tone.Transport.seconds * (this.bpm / 60)

    await VirtualBandEngine.startJam({
      genre: styleToBandGenre(this.style),
      key: this.key,
      bpm: this.bpm,
    })
  }

  stop(): void {
    this.running = false
    this.segments = []
    this.judgedNoteIds.clear()
    this.hitNoteIds.clear()
    this.missedNoteIds.clear()
    this.noteMetaById.clear()
    this.lastDetected = null
    this.combo = 0
    this.multiplier = 1
    this.feedback = 'Stopped'
    VirtualBandEngine.stopJam()
  }

  isRunning(): boolean {
    return this.running
  }

  private generateNextSegment(): ChartSegment {
    const segment = styleChartGenerator.generateSegment({
      style: this.style,
      key: this.key,
      bpm: this.bpm,
      difficulty: this.difficulty,
      segmentIndex: this.segmentIndex,
      bars: 8,
      seed: this.seed,
    })
    this.segmentIndex += 1
    for (let i = 0; i < segment.notes.length; i += 1) {
      const note = segment.notes[i]
      if (!note) continue
      this.noteMetaById.set(note.id, noteVisualMetaFromMidi(note.midi))
    }
    return segment
  }

  private getLaneCount(): number {
    let highestLane = MIN_LANE_COUNT - 1
    for (let i = 0; i < this.segments.length; i += 1) {
      const segment = this.segments[i]
      if (!segment) continue
      for (let j = 0; j < segment.notes.length; j += 1) {
        const note = segment.notes[j]
        if (note && note.lane > highestLane) highestLane = note.lane
      }
    }
    return Math.max(MIN_LANE_COUNT, Math.min(MAX_LANE_COUNT, highestLane + 1))
  }

  private clearSegmentState(segment: ChartSegment): void {
    for (let i = 0; i < segment.notes.length; i += 1) {
      const note = segment.notes[i]
      if (!note) continue
      this.noteMetaById.delete(note.id)
      this.judgedNoteIds.delete(note.id)
      this.hitNoteIds.delete(note.id)
      this.missedNoteIds.delete(note.id)
    }
  }

  private getCurrentSegment(nowBeat: number): ChartSegment | null {
    const beat = nowBeat - this.startBeat
    if (this.segments.length === 0) return null
    let current = this.segments[0] ?? null
    while (current && beat >= current.endBeat) {
      this.flushRemainingNotesAsMiss(current, beat)
      this.finishCurrentSegment()
      this.segments.shift()
      this.clearSegmentState(current)
      this.segments.push(this.generateNextSegment())
      current = this.segments[0] ?? null
    }
    return current
  }

  private finishCurrentSegment(): void {
    const stats = performanceTracker.aggregate({
      noteScores: this.segmentMetrics.noteScores,
      timingErrors: this.segmentMetrics.timingErrors,
      pitchErrors: this.segmentMetrics.pitchErrors,
      maxCombo: this.segmentMetrics.maxCombo,
    })
    this.lastStats = stats
    const decision = difficultyController.decide({
      currentTier: this.difficulty,
      stats,
      model: this.skillModel,
    })
    this.difficulty = decision.nextTier
    this.skillModel = decision.model
    this.segmentMetrics = {
      noteScores: [],
      timingErrors: [],
      pitchErrors: [],
      maxCombo: this.combo,
    }
  }

  private flushRemainingNotesAsMiss(segment: ChartSegment, localBeat: number): void {
    const windows = windowsForBpm(this.bpm)
    for (let i = 0; i < segment.notes.length; i += 1) {
      const note = segment.notes[i]
      if (!note || this.judgedNoteIds.has(note.id)) continue
      const offset = localBeat - note.startBeat
      this.registerMiss(note, offset, windows.perfect)
    }
  }

  private registerHit(
    note: NoteEvent,
    localBeat: number,
    centsOffset: number,
    quality: 'perfect' | 'good',
    perfectWindow: number,
  ): void {
    if (this.judgedNoteIds.has(note.id)) return
    const timingOffset = localBeat - note.startBeat
    this.judgedNoteIds.add(note.id)
    this.hitNoteIds.add(note.id)
    this.judgedTotal += 1
    this.hitsTotal += 1
    this.combo += 1
    this.multiplier = Math.min(SCORE_MULTIPLIER_CAP, 1 + Math.floor(this.combo / 8))
    this.segmentMetrics.maxCombo = Math.max(this.segmentMetrics.maxCombo, this.combo)

    const breakdown = createHitBreakdown({
      offsetBeats: timingOffset,
      perfectWindow,
      quality,
    })
    this.segmentMetrics.noteScores.push(breakdown)
    this.segmentMetrics.timingErrors.push(timingOffset)
    this.segmentMetrics.pitchErrors.push(centsOffset)
    this.score += breakdown.total * this.multiplier
    this.feedback = quality === 'perfect' ? 'Perfect' : 'Good'
  }

  private registerMiss(note: NoteEvent, timingOffset: number, perfectWindow: number): void {
    if (this.judgedNoteIds.has(note.id)) return
    this.judgedNoteIds.add(note.id)
    this.missedNoteIds.add(note.id)
    this.judgedTotal += 1
    this.combo = 0
    this.multiplier = 1
    this.segmentMetrics.maxCombo = Math.max(this.segmentMetrics.maxCombo, this.combo)
    this.segmentMetrics.noteScores.push(createMissBreakdown(timingOffset, perfectWindow))
    this.segmentMetrics.timingErrors.push(timingOffset)
    const expected = this.noteMetaById.get(note.id)?.targetLabel ?? '—'
    const detected = this.lastDetected?.noteLabel ?? '—'
    const centsDelta =
      this.lastDetected != null ? Math.round((this.lastDetected.midi - note.midi) * 100) : null
    this.feedback =
      centsDelta == null
        ? `Esperado: ${expected}, Detectado: ${detected}, Delta: —`
        : `Esperado: ${expected}, Detectado: ${detected}, Delta: ${centsDelta > 0 ? '+' : ''}${centsDelta}c`
  }

  private getPendingNotes(limit: number): NoteEvent[] {
    const items: NoteEvent[] = []
    for (let i = 0; i < this.segments.length; i += 1) {
      const segment = this.segments[i]
      if (!segment) continue
      for (let j = 0; j < segment.notes.length; j += 1) {
        const note = segment.notes[j]
        if (!note || this.judgedNoteIds.has(note.id)) continue
        items.push(note)
        if (items.length >= limit) return items
      }
    }
    return items
  }

  private buildVisibleNotes(localBeat: number): RenderableNote[] {
    const visible: RenderableNote[] = []
    for (let i = 0; i < this.segments.length; i += 1) {
      const segment = this.segments[i]
      if (!segment) continue
      for (let j = 0; j < segment.notes.length; j += 1) {
        const note = segment.notes[j]
        if (!note) continue
        const distanceToHit = note.startBeat - localBeat
        const isHit = this.hitNoteIds.has(note.id)
        const isMissed = this.missedNoteIds.has(note.id)
        if (distanceToHit > LOOKAHEAD_BEATS) continue
        if (distanceToHit < -1.5 && (isHit || isMissed)) continue
        const yNormalized = 1 - distanceToHit / LOOKAHEAD_BEATS
        const meta = this.noteMetaById.get(note.id)
        visible.push({
          id: note.id,
          lane: note.lane,
          startBeat: note.startBeat,
          durationBeats: note.durationBeats,
          targetLabel: meta?.targetLabel ?? '—',
          chromatic: meta?.chromatic ?? '—',
          octave: meta?.octave ?? 0,
          yNormalized,
          isPastHitLine: yNormalized >= 1,
          isHit,
          isMissed,
        })
      }
    }
    return visible
  }

  updateFrame(input: FrameInput): GuitarHeroRunSnapshot {
    const segment = this.getCurrentSegment(input.nowBeat)
    const localBeat = input.nowBeat - this.startBeat
    const windows = windowsForBpm(this.bpm)
    this.lastDetected = null

    if (segment) {
      if (input.detectedFrequencyHz && input.detectedFrequencyHz > 0) {
        const detectedMidi = midiFromFrequency(input.detectedFrequencyHz)
        const detectedNearestMidi = Math.round(detectedMidi)
        this.lastDetected = {
          midi: detectedMidi,
          noteLabel: Tone.Frequency(detectedNearestMidi, 'midi').toNote(),
        }
        const detectedPitchClass = pitchClassFromMidi(detectedNearestMidi)

        let candidate: NoteEvent | null = null
        let candidateOffset = 0
        let candidateAbsOffset = Number.POSITIVE_INFINITY

        for (let i = 0; i < this.segments.length; i += 1) {
          const seg = this.segments[i]
          if (!seg) continue
          for (let j = 0; j < seg.notes.length; j += 1) {
            const note = seg.notes[j]
            if (!note || this.judgedNoteIds.has(note.id)) continue
            const offset = localBeat - note.startBeat
            const absOffset = Math.abs(offset)
            if (absOffset > windows.good) continue
            if (absOffset >= candidateAbsOffset) continue
            if (detectedPitchClass !== pitchClassFromMidi(note.midi)) continue
            const noteCents = (detectedMidi - note.midi) * 100
            if (Math.abs(noteCents) > PITCH_TOLERANCE_CENTS) continue
            candidate = note
            candidateOffset = offset
            candidateAbsOffset = absOffset
          }
        }

        if (candidate) {
          const centsOffset = (detectedMidi - candidate.midi) * 100
          const quality = Math.abs(candidateOffset) <= windows.perfect ? 'perfect' : 'good'
          this.registerHit(candidate, localBeat, centsOffset, quality, windows.perfect)
        }
      }

      // Late notes become miss automatically once they fully cross the miss window.
      for (let i = 0; i < this.segments.length; i += 1) {
        const seg = this.segments[i]
        if (!seg) continue
        for (let j = 0; j < seg.notes.length; j += 1) {
          const note = seg.notes[j]
          if (!note || this.judgedNoteIds.has(note.id)) continue
          const timingOffset = localBeat - note.startBeat
          if (timingOffset > windows.miss) {
            this.registerMiss(note, timingOffset, windows.perfect)
          }
        }
      }
    }

    const pending = this.getPendingNotes(4)
    const currentTarget = pending[0] ?? null
    const currentTargetLabel =
      currentTarget != null ? (this.noteMetaById.get(currentTarget.id)?.targetLabel ?? '—') : '—'
    const upcomingTargetLabels = pending
      .slice(1, 4)
      .map((note) => this.noteMetaById.get(note.id)?.targetLabel ?? '—')
    const detectedCentsDelta =
      currentTarget && this.lastDetected
        ? (this.lastDetected.midi - currentTarget.midi) * 100
        : null
    const accuracy = this.judgedTotal > 0 ? this.hitsTotal / this.judgedTotal : 0

    return {
      style: this.style,
      key: this.key,
      bpm: this.bpm,
      difficulty: this.difficulty,
      score: this.score,
      combo: this.combo,
      multiplier: this.multiplier,
      accuracy,
      feedback: this.feedback,
      visibleNotes: this.buildVisibleNotes(localBeat),
      hitLineY: HIT_LINE_Y,
      lookaheadBeats: LOOKAHEAD_BEATS,
      laneCount: this.getLaneCount(),
      currentTargetLabel,
      upcomingTargetLabels,
      detectedNoteLabel: this.lastDetected?.noteLabel ?? null,
      detectedCentsDelta,
    }
  }

  getLastSegmentStats(): RunStats | null {
    return this.lastStats
  }
}

export const GuitarHeroEngine = new GuitarHeroEngineImpl()
