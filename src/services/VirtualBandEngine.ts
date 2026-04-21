import * as Tone from 'tone'
import guitarDatabaseJson from '../data/guitarDatabase.json'
import type { GuitarDatabase, ProgressionEntry } from '../types/guitarDatabase'

const guitarDatabase = guitarDatabaseJson as GuitarDatabase

export type VirtualBandGenre = ProgressionEntry['genre']

export type VirtualBandChordUiEvent = {
  chordSymbol: string
  progressionId: string
  stepIndex: number
  stepCount: number
}

type Listener<T> = (evt: T) => void

function parseRootAndSuffix(symbol: string): { root: string; suffix: string } {
  const s = symbol.trim()
  const m = /^([A-G])([#b]?)(.*)$/.exec(s)
  if (!m) return { root: 'C', suffix: '' }
  return { root: `${m[1]}${m[2] ?? ''}`, suffix: m[3] ?? '' }
}

function chordSymbolToRoot(symbol: string): string {
  return parseRootAndSuffix(symbol).root
}

function chordSymbolToBassNote(symbol: string): string {
  return `${chordSymbolToRoot(symbol)}2`
}

function chordSymbolToBassMidi(symbol: string): number {
  const { root, suffix } = parseRootAndSuffix(symbol)
  const rootMidi = midiOfNoteName(root, 2)
  const intervals = qualityIntervalsFromSuffix(suffix)
  // Prefer a stable low-register root.
  return rootMidi + (intervals[0] ?? 0)
}

function chordSymbolToBassNoteByInterval(symbol: string, semitoneInterval: number): string {
  const base = chordSymbolToBassMidi(symbol)
  return Tone.Frequency(base + semitoneInterval, 'midi').toNote()
}

function keyToRoot(key: string): string {
  const s = key.trim()
  const minorStripped = s.endsWith('m') ? s.slice(0, -1) : s
  return parseRootAndSuffix(minorStripped).root
}

function midiOfNoteName(note: string, octave: number): number {
  return Tone.Frequency(`${note}${octave}`).toMidi()
}

function transposePitchClass(note: string, semitones: number): string {
  const midi = midiOfNoteName(note, 4) + semitones
  const withOct = Tone.Frequency(midi, 'midi').toNote()
  return withOct.replace(/-?\d+$/, '')
}

function transposeChordSymbol(symbol: string, semitones: number): string {
  const { root, suffix } = parseRootAndSuffix(symbol)
  return `${transposePitchClass(root, semitones)}${suffix}`
}

function qualityIntervalsFromSuffix(suffixRaw: string): number[] {
  const suffix = suffixRaw.trim()

  // Order matters (more specific first).
  if (/^maj7/i.test(suffix)) return [0, 4, 7, 11]
  if (/^m7/i.test(suffix)) return [0, 3, 7, 10]
  if (/^m(?!aj)/i.test(suffix)) return [0, 3, 7]
  if (/^7/i.test(suffix)) return [0, 4, 7, 10]
  if (/^dim/i.test(suffix)) return [0, 3, 6]
  if (/^aug/i.test(suffix)) return [0, 4, 8]
  if (/^sus2/i.test(suffix)) return [0, 2, 7]
  if (/^sus4/i.test(suffix)) return [0, 5, 7]
  if (/^add9/i.test(suffix)) return [0, 4, 7, 14]
  if (/^6/i.test(suffix)) return [0, 4, 7, 9]
  if (/^9/i.test(suffix)) return [0, 4, 7, 10, 14]

  // Default: major triad
  return [0, 4, 7]
}

function chordNotesForPolySynth(symbol: string): string[] {
  const { root, suffix } = parseRootAndSuffix(symbol)
  const rootMidi = midiOfNoteName(root, 3) // pad-ish register
  const intervals = qualityIntervalsFromSuffix(suffix)
  return intervals.map((st) => Tone.Frequency(rootMidi + st, 'midi').toNote())
}

export type StartJamParams = {
  genre: VirtualBandGenre
  key: string
  bpm: number
}

class VirtualBandEngineImpl {
  private synth: Tone.PolySynth<Tone.Synth> | null = null
  private transportEventId: number | null = null
  private running = false

  /** Callback UI: disparado quando a guitarra base “palheta”. */
  public onStrum?: () => void

  private masterReverb: Tone.Reverb | null = null
  private pianoFilter: Tone.Filter | null = null

  private rhythmGuitar: Tone.PolySynth<Tone.Synth> | null = null
  private guitarChorus: Tone.Chorus | null = null
  private overdrive: Tone.Distortion | null = null
  private cabFilter: Tone.Filter | null = null

  private drumKit: Tone.Sampler | null = null
  private drumLoop: Tone.Sequence<number> | null = null

  private bassSynth: Tone.FMSynth | null = null
  private bassFilter: Tone.Filter | null = null
  private currentRootNote: string = 'C2'
  private currentChordSymbol: string = 'C'
  private currentGenre: VirtualBandGenre = 'rock'
  private currentPowerChord: [string, string] = ['C3', 'G3']

  // Precomputed 16-step patterns for the active jam (avoid allocations in audio callbacks).
  private kickPattern16: Uint8Array = new Uint8Array(16)
  private snarePattern16: Uint8Array = new Uint8Array(16)
  private ghostSnarePattern16: Uint8Array = new Uint8Array(16)
  private hatVelocity16: Float32Array = new Float32Array(16)
  private rockBassVelocity16: Float32Array = new Float32Array(16)
  private rockGuitarPattern16: Uint8Array = new Uint8Array(16)

  private progression: ProgressionEntry | null = null
  private progressionChords: string[] = []
  private stepIndex = 0

  private chordListeners = new Set<Listener<VirtualBandChordUiEvent>>()

  onChordChange(listener: Listener<VirtualBandChordUiEvent>): () => void {
    this.chordListeners.add(listener)
    return () => this.chordListeners.delete(listener)
  }

  isRunning(): boolean {
    return this.running
  }

  setBpm(bpm: number) {
    if (!Number.isFinite(bpm) || bpm <= 0) return
    Tone.Transport.bpm.value = bpm
  }

  private ensureFx() {
    if (this.masterReverb) return
    this.masterReverb = new Tone.Reverb({ decay: 2.5, wet: 0.15 }).toDestination()
  }

  private ensureRhythmGuitar() {
    if (this.rhythmGuitar) return
    this.ensureFx()
    const reverb = this.masterReverb ?? Tone.getDestination()
    this.overdrive = new Tone.Distortion({ distortion: 0.4, oversample: '2x' })
    this.cabFilter = new Tone.Filter(3500, 'lowpass')
    this.guitarChorus = new Tone.Chorus({
      frequency: 1.5,
      delayTime: 3.5,
      depth: 0.7,
    })
      .start()
      .connect(reverb)

    const gtr = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'pwm', modulationFrequency: 0.2 },
      envelope: { attack: 0.005, decay: 0.3, sustain: 0.1, release: 0.5 },
    })
      .connect(this.overdrive)
      .connect(this.cabFilter)
      .connect(this.guitarChorus)
    gtr.volume.value = -12
    this.rhythmGuitar = gtr
  }

  private ensureSynth() {
    if (this.synth) return
    this.ensureFx()
    const reverb = this.masterReverb ?? Tone.getDestination()
    this.pianoFilter = new Tone.Filter(1200, 'lowpass').connect(reverb)

    const chordSynth = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 3,
      modulationIndex: 3.5,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.01, decay: 0.5, sustain: 0.8, release: 1 },
      modulation: { type: 'sine' },
      modulationEnvelope: {
        attack: 0.1,
        decay: 0.5,
        sustain: 0.8,
        release: 0.1,
      },
    }).connect(this.pianoFilter)
    chordSynth.volume.value = -6
    this.synth = chordSynth as unknown as Tone.PolySynth<Tone.Synth>
  }

  private ensureDrumKit() {
    if (this.drumKit) return
    this.drumKit = new Tone.Sampler({
      urls: {
        C1: 'kick.mp3',
        D1: 'snare.mp3',
        E1: 'hihat.mp3',
      },
      baseUrl: 'https://tonejs.github.io/audio/drum-samples/acoustic-kit/',
      volume: -6,
    }).toDestination()
  }

  private ensureBass() {
    if (this.bassSynth) return
    // E-Bass-ish FM patch (warm + controlled top end; no reverb).
    this.bassFilter = new Tone.Filter(700, 'lowpass').connect(Tone.getDestination())
    this.bassSynth = new Tone.FMSynth({
      volume: -8,
      harmonicity: 1.2,
      modulationIndex: 2.2,
      oscillator: { type: 'sine' },
      modulation: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.18, sustain: 0.2, release: 0.08 },
      modulationEnvelope: {
        attack: 0.001,
        decay: 0.12,
        sustain: 0,
        release: 0.05,
      },
    }).connect(this.bassFilter)
  }

  private disposeDrumLoop() {
    if (!this.drumLoop) return
    this.drumLoop.stop()
    this.drumLoop.dispose()
    this.drumLoop = null
  }

  private chooseProgression(genre: VirtualBandGenre): ProgressionEntry {
    const pool = guitarDatabase.progressions.filter((p) => p.genre === genre)
    if (pool.length === 0) {
      throw new Error(`No progressions for genre: ${genre}`)
    }
    const idx = Math.floor(Math.random() * pool.length)
    return pool[idx] ?? pool[0]
  }

  private buildProgressionChords(p: ProgressionEntry, targetKey: string): string[] {
    const from = keyToRoot(p.keyExample)
    const to = keyToRoot(targetKey)
    const semitones = midiOfNoteName(to, 4) - midiOfNoteName(from, 4)
    return p.chords.map((c) => transposeChordSymbol(c, semitones))
  }

  private configurePatternsForGenre(genre: VirtualBandGenre) {
    this.kickPattern16.fill(0)
    this.snarePattern16.fill(0)
    this.ghostSnarePattern16.fill(0)
    this.hatVelocity16.fill(0)
    this.rockBassVelocity16.fill(0)
    this.rockGuitarPattern16.fill(0)

    // Snare backbeat default (2 & 4 over 2 bars).
    this.snarePattern16[4] = 1
    this.snarePattern16[12] = 1

    if (genre === 'rock') {
      // Driving rock: kick 0,8 strong + pushes 10,14
      this.kickPattern16[0] = 1
      this.kickPattern16[8] = 1
      this.kickPattern16[10] = 1
      this.kickPattern16[14] = 1

      // Ghost note right before loop turns.
      this.ghostSnarePattern16[15] = 1

      // Hats straight with alternating dynamics.
      for (let i = 0; i < 16; i++) {
        this.hatVelocity16[i] = i % 2 === 0 ? 0.8 : 0.4
      }

      // Bass chugging: strong on kick steps, softer elsewhere.
      for (let i = 0; i < 16; i++) {
        this.rockBassVelocity16[i] = 0.5
      }
      this.rockBassVelocity16[0] = 0.9
      this.rockBassVelocity16[8] = 0.9
      this.rockBassVelocity16[10] = 0.9
      this.rockBassVelocity16[14] = 0.9

      // Rhythm guitar power-chord rhythm.
      this.rockGuitarPattern16[0] = 1
      this.rockGuitarPattern16[3] = 1
      this.rockGuitarPattern16[4] = 1
      this.rockGuitarPattern16[8] = 1
      this.rockGuitarPattern16[11] = 1
      this.rockGuitarPattern16[12] = 1
      return
    }

    if (genre === 'blues') {
      // Blues: syncopated kick pattern example 0,3,8,11; hats on offbeats.
      this.kickPattern16[0] = 1
      this.kickPattern16[3] = 1
      this.kickPattern16[8] = 1
      this.kickPattern16[11] = 1
      for (let i = 0; i < 16; i++) {
        this.hatVelocity16[i] = i % 2 === 1 ? 0.55 : 0
      }
      return
    }

    // Default
    this.kickPattern16[0] = 1
    this.kickPattern16[4] = 1
    this.kickPattern16[8] = 1
    this.kickPattern16[12] = 1
    for (let i = 0; i < 16; i++) {
      this.hatVelocity16[i] = i % 2 === 0 ? 0.8 : 0.3
    }
  }

  async startJam(params: StartJamParams) {
    const { genre, key, bpm } = params
    if (this.running) this.stopJam()

    this.ensureFx()
    this.ensureSynth()
    this.ensureRhythmGuitar()
    this.ensureDrumKit()
    this.ensureBass()
    this.setBpm(bpm)

    this.currentGenre = genre
    this.configurePatternsForGenre(genre)
    if (this.overdrive) {
      if (genre === 'rock') this.overdrive.distortion = 0.6
      else if (genre === 'blues') this.overdrive.distortion = 0.3
      else this.overdrive.distortion = 0.05
    }

    if (this.masterReverb) {
      const maybeGenerate = (this.masterReverb as unknown as { generate?: () => Promise<void> })
        .generate
      if (typeof maybeGenerate === 'function') {
        void maybeGenerate.call(this.masterReverb)
      }
    }

    // Dynamic swing engine (genre-aware).
    Tone.Transport.swingSubdivision = '8n'
    if (genre === 'blues') Tone.Transport.swing = 0.5
    else if (genre === 'rock') Tone.Transport.swing = 0.05
    else Tone.Transport.swing = 0

    const progression = this.chooseProgression(genre)
    const progressionChords = this.buildProgressionChords(progression, key)

    this.progression = progression
    this.progressionChords = progressionChords
    this.stepIndex = 0
    this.running = true

    if (this.transportEventId !== null) {
      Tone.Transport.clear(this.transportEventId)
      this.transportEventId = null
    }

    this.disposeDrumLoop()

    Tone.Transport.position = 0

    const evId = Tone.Transport.scheduleRepeat((time) => {
      try {
        const p = this.progression
        if (
          !p ||
          this.progressionChords.length === 0 ||
          !this.synth ||
          !this.rhythmGuitar
        ) {
          return
        }

        const idx = this.stepIndex % this.progressionChords.length
        const chordSymbol =
          this.progressionChords[idx] ?? this.progressionChords[0]
        const notes = chordNotesForPolySynth(chordSymbol)

        this.currentChordSymbol = chordSymbol
        this.currentRootNote = chordSymbolToBassNote(chordSymbol)

        // Precompute a guitar-friendly power chord (root + 5th) in mid register.
        const rootPc = chordSymbolToRoot(chordSymbol)
        const rootMidi = midiOfNoteName(rootPc, 3)
        const pcRoot = Tone.Frequency(rootMidi, 'midi').toNote()
        const pcFifth = Tone.Frequency(rootMidi + 7, 'midi').toNote()
        this.currentPowerChord = [pcRoot, pcFifth]

        if (this.currentGenre === 'rock') {
          // Rock: reduce Rhodes and make it a pad (let guitars drive rhythm).
          this.synth.volume.value = -12
          this.synth.triggerAttackRelease(notes, '1n', time, 0.35)
        } else {
          // "Comping" stabs: on beat 1 and an offbeat later in the bar.
          this.synth.volume.value = -6
          this.synth.triggerAttackRelease(notes, '8n', time, 0.8)
          const offbeatTime =
            time + Tone.Time('4n').toSeconds() + Tone.Time('8n').toSeconds()
          this.synth.triggerAttackRelease(notes, '8n', offbeatTime, 0.5)
        }

        // Rhythm guitar: complementary upstroke-style on beats 2 and 4 (ska/funk vibe)
        // with a tiny strum spread across chord tones.
        const strum = (baseTime: number, velocity: number) => {
          if (this.onStrum) {
            Tone.Draw.schedule(() => {
              this.onStrum?.()
            }, baseTime)
          }
          const spread = 0.015
          const sorted = [...notes].sort(
            (a, b) => Tone.Frequency(a).toMidi() - Tone.Frequency(b).toMidi(),
          )
          for (let i = 0; i < sorted.length; i++) {
            const t = baseTime + i * spread
            this.rhythmGuitar?.triggerAttackRelease(
              sorted[i],
              '16n',
              t,
              velocity,
            )
          }
        }

        const beat2 = time + Tone.Time('4n').toSeconds()
        const beat4 =
          time + Tone.Time('2n').toSeconds() + Tone.Time('4n').toSeconds()
        if (this.currentGenre !== 'rock') {
          strum(beat2, 0.55)
          strum(beat4, 0.6)
        }

        Tone.Draw.schedule(() => {
          const evt: VirtualBandChordUiEvent = {
            chordSymbol,
            progressionId: p.id,
            stepIndex: idx,
            stepCount: this.progressionChords.length,
          }
          for (const l of this.chordListeners) l(evt)
        }, time)

        this.stepIndex = idx + 1
      } catch (err) {
        console.error('VirtualBandEngine scheduleRepeat error', err)
      }
    }, '1m', 0)

    this.transportEventId = evId

    // 2-bar pattern: 16 eighth-note steps.
    const steps = Array.from({ length: 16 }, (_, i) => i)
    this.drumLoop = new Tone.Sequence(
      (time, step) => {
        try {
          const drumKit = this.drumKit
          const bass = this.bassSynth
          const gtr = this.rhythmGuitar
          if (!drumKit || !bass) return

          const isRock = this.currentGenre === 'rock'
          const isBlues = this.currentGenre === 'blues'

          const hatVel = this.hatVelocity16[step] ?? 0
          if (hatVel > 0) {
            drumKit.triggerAttackRelease('E1', '16n', time, hatVel)
          }

          const hasKick = (this.kickPattern16[step] ?? 0) === 1
          const hasSnare = (this.snarePattern16[step] ?? 0) === 1
          const hasGhost = (this.ghostSnarePattern16[step] ?? 0) === 1

          if (hasKick) {
            const kickVel = isRock ? 0.95 : isBlues ? 0.9 : 0.85
            drumKit.triggerAttackRelease('C1', '16n', time, kickVel)
          }
          if (hasSnare) {
            const snareVel = isRock ? 1.0 : 0.9
            drumKit.triggerAttackRelease('D1', '16n', time, snareVel)
          }
          if (hasGhost) {
            drumKit.triggerAttackRelease('D1', '32n', time, 0.2)
          }

          // Bass articulation: talks to the kick.
          if (isRock) {
            // Rock: 8th-note chugging on all 16 steps. Louder on kick steps.
            const vel = this.rockBassVelocity16[step] ?? 0.5
            bass.triggerAttackRelease(this.currentRootNote, '8n', time, vel)
          } else if (isBlues) {
            // Simple walking: root most of the time, but add movement on steps 4 and 12.
            if (step === 4 || step === 12) {
              // Alternate between 3rd and 5th to create melodic motion.
              const interval = step === 4 ? 4 : 7
              const note = chordSymbolToBassNoteByInterval(
                this.currentChordSymbol,
                interval,
              )
              bass.triggerAttackRelease(note, '8n', time, 0.85)
            } else if (hasKick) {
              bass.triggerAttackRelease(this.currentRootNote, '8n', time, 0.8)
            }
          } else {
            // Default: bass on kick steps only.
            if (hasKick) {
              bass.triggerAttackRelease(this.currentRootNote, '8n', time, 0.85)
            }
          }

          // Rock rhythm guitar: power-chord rhythm (driving, not ska/reggae).
          if (isRock && gtr) {
            if ((this.rockGuitarPattern16[step] ?? 0) === 1) {
              const [n1, n2] = this.currentPowerChord
              if (this.onStrum) {
                Tone.Draw.schedule(() => {
                  this.onStrum?.()
                }, time)
              }
              gtr.triggerAttackRelease(n1, '16n', time, 0.85)
              gtr.triggerAttackRelease(n2, '16n', time + 0.012, 0.8)
            }
          }
        } catch (err) {
          console.error('VirtualBandEngine drumLoop error', err)
        }
      },
      steps,
      '8n',
    )
    this.drumLoop.humanize = 0.01
    await Tone.loaded()
    this.drumLoop.start(0)

    Tone.Transport.start()
  }

  stopJam() {
    this.running = false
    this.progression = null
    this.progressionChords = []
    this.stepIndex = 0
    this.currentRootNote = 'C2'
    this.currentChordSymbol = 'C'

    if (this.transportEventId !== null) {
      Tone.Transport.clear(this.transportEventId)
      this.transportEventId = null
    }
    this.disposeDrumLoop()
    try {
      this.bassSynth?.triggerRelease(Tone.now())
    } catch {
      /* ignore */
    }
    try {
      this.rhythmGuitar?.releaseAll?.()
    } catch {
      /* ignore */
    }
    // Reset swing to avoid leaking groove into other parts of the app.
    Tone.Transport.swing = 0
    Tone.Transport.stop()
  }
}

export const VirtualBandEngine = new VirtualBandEngineImpl()

