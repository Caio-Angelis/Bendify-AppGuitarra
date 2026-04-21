import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as Tone from 'tone'
import Pitchfinder from 'pitchfinder'
import { GuitarHeroEngine } from '../services/GuitarHeroEngine'
import { useStore } from '../store/useStore'
import type {
  DifficultyTier,
  GameStyle,
  GuitarHeroRunSnapshot,
  RenderableNote,
} from '../types/guitarHero'
import { getPreferredMicId } from '../utils/audioDevicePreferences'
import { foldToGuitarFundamental, rmsFloat32, smoothPitchEMA } from '../utils/guitarPitch'

const FFT_SIZE = 8192
const RMS_SILENCE = 0.0011
const FREQ_MIN = 45
const FREQ_MAX = 1400
const PUBLISH_INTERVAL_MS = 1000 / 30

const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
const STYLES: GameStyle[] = ['blues', 'metal', 'bossa', 'fusion']

type UseGuitarHeroState = {
  isRunning: boolean
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
  detectedHz: number | null
  detectedNote: string
  currentTargetLabel: string
  upcomingTargetLabels: string[]
  detectedCentsDelta: number | null
  micError: string | null
  styles: GameStyle[]
  keyOptions: readonly string[]
}

type UseGuitarHeroApi = {
  setStyle: (style: GameStyle) => void
  setKey: (key: string) => void
  setBpm: (bpm: number) => void
  start: () => Promise<void>
  stop: () => void
}

const EMPTY_SNAPSHOT: GuitarHeroRunSnapshot = {
  style: 'blues',
  key: 'A',
  bpm: 96,
  difficulty: 1,
  score: 0,
  combo: 0,
  multiplier: 1,
  accuracy: 0,
  feedback: 'Ready',
  visibleNotes: [],
  hitLineY: 0.88,
  lookaheadBeats: 8,
  laneCount: 4,
  currentTargetLabel: '—',
  upcomingTargetLabels: [],
  detectedNoteLabel: null,
  detectedCentsDelta: null,
}

export function useGuitarHero(): UseGuitarHeroState & UseGuitarHeroApi {
  const setIsPlaying = useStore((s) => s.setIsPlaying)
  const startTracking = useStore((s) => s.startTracking)
  const stopTracking = useStore((s) => s.stopTracking)
  const setGuitarHeroSnapshot = useStore((s) => s.setGuitarHeroSnapshot)
  const commitGuitarHeroRun = useStore((s) => s.commitGuitarHeroRun)

  const [style, setStyle] = useState<GameStyle>('blues')
  const [key, setKey] = useState<string>('A')
  const [bpm, setBpm] = useState<number>(96)
  const [isRunning, setRunning] = useState(false)
  const [snapshot, setSnapshot] = useState<GuitarHeroRunSnapshot>(EMPTY_SNAPSHOT)
  const [detectedHz, setDetectedHz] = useState<number | null>(null)
  const [micError, setMicError] = useState<string | null>(null)

  const rafRef = useRef(0)
  const streamRef = useRef<MediaStream | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const detectYinRef = useRef<((buf: Float32Array) => number | null) | null>(null)
  const detectMacleodRef = useRef<
    ((buf: Float32Array) => { freq: number; probability: number }) | null
  >(null)
  const smoothFreqRef = useRef<number | null>(null)
  const bufferRef = useRef<Float32Array | null>(null)
  const snapshotRef = useRef<GuitarHeroRunSnapshot>(EMPTY_SNAPSHOT)
  const detectedHzRef = useRef<number | null>(null)
  const lastPublishRef = useRef(0)

  const cleanupAudio = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    void ctxRef.current?.close()
    ctxRef.current = null
    analyserRef.current = null
    detectYinRef.current = null
    detectMacleodRef.current = null
    smoothFreqRef.current = null
    bufferRef.current = null
    detectedHzRef.current = null
    lastPublishRef.current = 0
    setDetectedHz(null)
  }, [])

  const stop = useCallback(() => {
    setRunning(false)
    setIsPlaying(false)
    stopTracking('guitar_hero')
    cleanupAudio()
    GuitarHeroEngine.stop()
    const finalSnapshot = { ...snapshotRef.current, feedback: 'Stopped' }
    snapshotRef.current = finalSnapshot
    commitGuitarHeroRun(finalSnapshot)
    setSnapshot(finalSnapshot)
  }, [cleanupAudio, commitGuitarHeroRun, setIsPlaying, stopTracking])

  const start = useCallback(async () => {
    setMicError(null)
    await Tone.start()
    const micId = getPreferredMicId()
    const constraints: MediaTrackConstraints = {
      echoCancellation: false,
      noiseSuppression: true,
      autoGainControl: true,
    }
    if (micId) constraints.deviceId = { exact: micId }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: constraints })
    const ctx = new AudioContext()
    const source = ctx.createMediaStreamSource(stream)
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 70
    hp.Q.value = 0.707
    const preGain = ctx.createGain()
    preGain.gain.value = 3.5
    const analyser = ctx.createAnalyser()
    analyser.fftSize = FFT_SIZE
    analyser.smoothingTimeConstant = 0.25
    source.connect(hp)
    hp.connect(preGain)
    preGain.connect(analyser)

    streamRef.current = stream
    ctxRef.current = ctx
    analyserRef.current = analyser
    bufferRef.current = new Float32Array(FFT_SIZE)
    smoothFreqRef.current = null

    detectYinRef.current = Pitchfinder.YIN({
      sampleRate: ctx.sampleRate,
      threshold: 0.085,
      probabilityThreshold: 0.04,
    })
    detectMacleodRef.current = Pitchfinder.Macleod({
      bufferSize: FFT_SIZE,
      sampleRate: ctx.sampleRate,
      cutoff: 0.9,
    })

    const seed = Date.now() & 0xffff
    await GuitarHeroEngine.start({
      style,
      key,
      bpm,
      seed,
      initialDifficulty: 1,
    })

    setRunning(true)
    setIsPlaying(true)
    startTracking('guitar_hero')
  }, [bpm, key, setIsPlaying, startTracking, style])

  useEffect(() => {
    if (!isRunning) return

    const analyser = analyserRef.current
    const buffer = bufferRef.current
    const yin = detectYinRef.current
    const macleod = detectMacleodRef.current
    if (!analyser || !buffer || !yin || !macleod) return

    const tick = () => {
      analyser.getFloatTimeDomainData(buffer)
      const energy = rmsFloat32(buffer)
      let detected: number | null = null

      if (energy >= RMS_SILENCE) {
        let raw = yin(buffer)
        if (raw == null || raw < FREQ_MIN) {
          const m = macleod(buffer)
          if (
            m.freq > FREQ_MIN &&
            m.freq < FREQ_MAX &&
            Number.isFinite(m.probability) &&
            m.probability > 0.2
          ) {
            raw = m.freq
          }
        }

        if (raw != null && raw >= FREQ_MIN && raw <= FREQ_MAX) {
          const folded = foldToGuitarFundamental(raw)
          const smooth = smoothPitchEMA(smoothFreqRef.current, folded, 0.2)
          smoothFreqRef.current = smooth
          detected = smooth
        }
      } else {
        smoothFreqRef.current = null
      }

      detectedHzRef.current = detected
      const nowBeat = Tone.Transport.seconds * (bpm / 60)
      const next = GuitarHeroEngine.updateFrame({
        nowBeat,
        detectedFrequencyHz: detected,
      })
      snapshotRef.current = next
      const nowMs = performance.now()
      if (nowMs - lastPublishRef.current >= PUBLISH_INTERVAL_MS) {
        lastPublishRef.current = nowMs
        setDetectedHz(detectedHzRef.current)
        setSnapshot(next)
        setGuitarHeroSnapshot(next)
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [bpm, isRunning, setGuitarHeroSnapshot])

  useEffect(() => {
    return () => {
      stop()
    }
  }, [stop])

  return useMemo(
    () => ({
      isRunning,
      style,
      key,
      bpm,
      difficulty: snapshot.difficulty,
      score: snapshot.score,
      combo: snapshot.combo,
      multiplier: snapshot.multiplier,
      accuracy: snapshot.accuracy,
      feedback: snapshot.feedback,
      visibleNotes: snapshot.visibleNotes,
      hitLineY: snapshot.hitLineY,
      lookaheadBeats: snapshot.lookaheadBeats,
      laneCount: snapshot.laneCount,
      detectedHz,
      detectedNote: snapshot.detectedNoteLabel ?? '—',
      currentTargetLabel: snapshot.currentTargetLabel,
      upcomingTargetLabels: snapshot.upcomingTargetLabels,
      detectedCentsDelta: snapshot.detectedCentsDelta,
      micError,
      styles: STYLES,
      keyOptions: KEYS,
      setStyle,
      setKey,
      setBpm,
      start: async () => {
        try {
          await start()
        } catch {
          setMicError(
            'Microfone indisponível ou permissão negada. Verifique as definições do navegador.',
          )
          stop()
        }
      },
      stop,
    }),
    [bpm, detectedHz, isRunning, key, micError, snapshot, start, stop, style],
  )
}
