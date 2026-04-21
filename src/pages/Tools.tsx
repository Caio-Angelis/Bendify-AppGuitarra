import { useCallback, useEffect, useRef, useState } from 'react'
import * as Tone from 'tone'
import Pitchfinder from 'pitchfinder'
import { useStore } from '../store/useStore'
import {
  applyToneOutputDevice,
  getPreferredMicId,
  getPreferredOutputId,
  setPreferredMicId,
  setPreferredOutputId,
  supportsAudioOutputSelection,
} from '../utils/audioDevicePreferences'
import {
  foldToGuitarFundamental,
  rmsFloat32,
  smoothPitchEMA,
} from '../utils/guitarPitch'

const BPM_MIN = 40
const BPM_MAX = 240
const IN_TUNE_CENTS = 8

const BEATS_PER_BAR_OPTIONS = Array.from({ length: 10 }, (_, i) => i + 1)
const MEASURE_CYCLE_OPTIONS = Array.from({ length: 13 }, (_, i) => i + 4)

const NOTE_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const

type TabId = 'metronome' | 'tuner' | 'audio'

function freqToNote(freq: number): { label: string; cents: number } {
  if (!Number.isFinite(freq) || freq <= 0) {
    return { label: '—', cents: 0 }
  }
  const midi = 69 + 12 * Math.log2(freq / 440)
  const rounded = Math.round(midi)
  const cents = (midi - rounded) * 100
  const name = NOTE_NAMES[((rounded % 12) + 12) % 12]
  const octave = Math.floor(rounded / 12) - 1
  return { label: `${name}${octave}`, cents }
}

function deviceLabel(d: MediaDeviceInfo) {
  if (d.label) return d.label
  return d.deviceId.slice(0, 8) + '…'
}

export default function Tools() {
  const globalBpm = useStore((s) => s.globalBpm)
  const setGlobalBpm = useStore((s) => s.setGlobalBpm)
  const startTracking = useStore((s) => s.startTracking)
  const stopTracking = useStore((s) => s.stopTracking)

  const [activeTab, setActiveTab] = useState<TabId>('metronome')

  const [micDeviceId, setMicDeviceId] = useState(getPreferredMicId)
  const [outputDeviceId, setOutputDeviceId] = useState(getPreferredOutputId)
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([])
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([])
  const [devicesLoaded, setDevicesLoaded] = useState(false)

  const [metronomeOn, setMetronomeOn] = useState(false)
  const [beatsPerBar, setBeatsPerBar] = useState(4)
  const [measureCycle, setMeasureCycle] = useState(4)
  const [currentBeat, setCurrentBeat] = useState(1)
  const [currentMeasure, setCurrentMeasure] = useState(1)
  const [pulseScale, setPulseScale] = useState(1)

  const beatsPerBarRef = useRef(beatsPerBar)
  const measureCycleRef = useRef(measureCycle)

  const metronomeSynthRef = useRef<Tone.Synth | null>(null)
  const metronomeRepeatIdRef = useRef<number | null>(null)
  /** Transport tick (0,1,2,…) so beat/measure stay in sync with audio without stale closures. */
  const metronomeTickRef = useRef(0)

  useEffect(() => {
    beatsPerBarRef.current = beatsPerBar
  }, [beatsPerBar])

  useEffect(() => {
    measureCycleRef.current = measureCycle
  }, [measureCycle])

  const handleMetronomeToggle = useCallback(async () => {
    if (!metronomeOn) {
      try {
        await Tone.start()
        Tone.Transport.stop()
        Tone.Transport.cancel()
      } catch (error) {
        console.error('Erro no Metrônomo:', error)
        return
      }
    }
    setMetronomeOn((v) => !v)
  }, [metronomeOn])

  const [tunerOn, setTunerOn] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)
  const [noteLabel, setNoteLabel] = useState('—')
  const [cents, setCents] = useState(0)
  const tunerRafRef = useRef(0)
  const tunerStreamRef = useRef<MediaStream | null>(null)
  const tunerCtxRef = useRef<AudioContext | null>(null)
  const detectYinRef = useRef<((buf: Float32Array) => number | null) | null>(
    null,
  )
  const detectMacleodRef = useRef<
    ((buf: Float32Array) => { freq: number; probability: number }) | null
  >(null)
  const tunerSmoothFreqRef = useRef<number | null>(null)
  const tunerUiThrottleRef = useRef({ t: 0, label: '', cents: 0 })

  const clampBpm = useCallback((n: number) => {
    return Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(n)))
  }, [])

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      setInputDevices(all.filter((d) => d.kind === 'audioinput'))
      setOutputDevices(all.filter((d) => d.kind === 'audiooutput'))
      setDevicesLoaded(true)
    } catch {
      setDevicesLoaded(false)
    }
  }, [])

  useEffect(() => {
    void refreshDevices()
    const md = navigator.mediaDevices
    if (!md?.addEventListener) return
    const onChange = () => void refreshDevices()
    md.addEventListener('devicechange', onChange)
    return () => md.removeEventListener('devicechange', onChange)
  }, [refreshDevices])

  useEffect(() => {
    if (metronomeOn) {
      startTracking('metronome')
    } else {
      stopTracking('metronome')
    }
    return () => {
      stopTracking('metronome')
    }
  }, [metronomeOn, startTracking, stopTracking])

  useEffect(() => {
    if (!metronomeOn) {
      Tone.Transport.stop()
      if (metronomeRepeatIdRef.current !== null) {
        Tone.Transport.clear(metronomeRepeatIdRef.current)
        metronomeRepeatIdRef.current = null
      }
      metronomeSynthRef.current?.dispose()
      metronomeSynthRef.current = null
      metronomeTickRef.current = 0
      setCurrentBeat(1)
      setCurrentMeasure(1)
      return
    }

    let cancelled = false

    void (async () => {
      try {
        await Tone.start()
        if (cancelled) return
        Tone.Transport.stop()
        Tone.Transport.cancel()

        const outPref = getPreferredOutputId()
        if (outPref && supportsAudioOutputSelection()) {
          try {
            await applyToneOutputDevice(outPref)
          } catch {
            /* ignore */
          }
        }
        if (cancelled) return

        Tone.Transport.bpm.value = useStore.getState().globalBpm

        metronomeTickRef.current = 0

        const synth = new Tone.Synth({
          oscillator: { type: 'sine' },
          envelope: {
            attack: 0.001,
            decay: 0.12,
            sustain: 0,
            release: 0.02,
          },
        }).toDestination()
        metronomeSynthRef.current = synth

        const repeatId = Tone.Transport.scheduleRepeat((time) => {
          const bpb = beatsPerBarRef.current
          const cycle = measureCycleRef.current
          const tick = metronomeTickRef.current
          const beat1 = (tick % bpb) + 1
          const measure1 = Math.floor(tick / bpb) % cycle + 1
          const isDownbeat = beat1 === 1
          const note = isDownbeat ? 'C5' : 'C4'
          const vel = isDownbeat ? 0.92 : 0.72

          synth.triggerAttackRelease(note, '32n', time, vel)

          Tone.Draw.schedule(() => {
            setCurrentBeat((prev) => (prev === beat1 ? prev : beat1))
            setCurrentMeasure((prev) =>
              prev === measure1 ? prev : measure1,
            )
          }, time)

          metronomeTickRef.current = tick + 1
        }, '4n', 0)
        metronomeRepeatIdRef.current = repeatId

        Tone.Transport.start()
      } catch (error) {
        console.error('Erro no Metrônomo:', error)
      }
    })()

    return () => {
      cancelled = true
      Tone.Transport.stop()
      if (metronomeRepeatIdRef.current !== null) {
        Tone.Transport.clear(metronomeRepeatIdRef.current)
        metronomeRepeatIdRef.current = null
      }
      metronomeSynthRef.current?.dispose()
      metronomeSynthRef.current = null
      metronomeTickRef.current = 0
      setCurrentBeat(1)
      setCurrentMeasure(1)
    }
  }, [metronomeOn])

  useEffect(() => {
    if (metronomeOn) {
      Tone.Transport.bpm.value = globalBpm
    }
  }, [globalBpm, metronomeOn])

  useEffect(() => {
    if (!metronomeOn) return
    setPulseScale(1.12)
    const t = window.setTimeout(() => setPulseScale(1), 120)
    return () => window.clearTimeout(t)
  }, [metronomeOn, currentBeat, currentMeasure])

  const stopTunerPipeline = useCallback(() => {
    cancelAnimationFrame(tunerRafRef.current)
    tunerRafRef.current = 0
    tunerStreamRef.current?.getTracks().forEach((tr) => tr.stop())
    tunerStreamRef.current = null
    void tunerCtxRef.current?.close()
    tunerCtxRef.current = null
    detectYinRef.current = null
    detectMacleodRef.current = null
    tunerSmoothFreqRef.current = null
    tunerUiThrottleRef.current = { t: 0, label: '', cents: 0 }
    setNoteLabel('—')
    setCents(0)
  }, [])

  useEffect(() => {
    if (!tunerOn) {
      stopTunerPipeline()
      return
    }

    let alive = true

    void (async () => {
      try {
        setMicError(null)
        const audioConstraints: MediaTrackConstraints = {
          echoCancellation: false,
          noiseSuppression: true,
          autoGainControl: true,
        }
        if (micDeviceId) {
          audioConstraints.deviceId = { exact: micDeviceId }
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
        })
        if (!alive) {
          stream.getTracks().forEach((tr) => tr.stop())
          return
        }
        tunerStreamRef.current = stream

        const ctx = new AudioContext()
        if (outputDeviceId && supportsAudioOutputSelection()) {
          try {
            const raw = ctx as AudioContext & {
              setSinkId?: (id: string) => Promise<void>
            }
            if (typeof raw.setSinkId === 'function') {
              await raw.setSinkId(outputDeviceId)
            }
          } catch {
            /* ignore */
          }
        }

        tunerCtxRef.current = ctx
        const source = ctx.createMediaStreamSource(stream)

        const hp = ctx.createBiquadFilter()
        hp.type = 'highpass'
        hp.frequency.value = 70
        hp.Q.value = 0.707

        const preGain = ctx.createGain()
        preGain.gain.value = 3.5

        const analyser = ctx.createAnalyser()
        const fft = 8192
        analyser.fftSize = fft
        analyser.smoothingTimeConstant = 0.25

        source.connect(hp)
        hp.connect(preGain)
        preGain.connect(analyser)

        const sr = ctx.sampleRate
        const yin = Pitchfinder.YIN({
          sampleRate: sr,
          threshold: 0.085,
          probabilityThreshold: 0.04,
        })
        const macleod = Pitchfinder.Macleod({
          bufferSize: fft,
          sampleRate: sr,
          cutoff: 0.9,
        })
        detectYinRef.current = yin
        detectMacleodRef.current = macleod

        const buffer = new Float32Array(fft)
        tunerSmoothFreqRef.current = null

        const tick = () => {
          if (!alive || !detectYinRef.current || !detectMacleodRef.current) {
            return
          }
          analyser.getFloatTimeDomainData(buffer)
          const energy = rmsFloat32(buffer)
          if (energy < 0.0011) {
            tunerSmoothFreqRef.current = null
            const th = tunerUiThrottleRef.current
            const now = performance.now()
            if (now - th.t > 120 || th.label !== '—') {
              tunerUiThrottleRef.current = { t: now, label: '—', cents: 0 }
              setNoteLabel('—')
              setCents(0)
            }
            tunerRafRef.current = requestAnimationFrame(tick)
            return
          }

          let raw = detectYinRef.current(buffer)
          if (raw == null || raw < 45) {
            const m = detectMacleodRef.current(buffer)
            if (
              m.freq > 45 &&
              m.freq < 1400 &&
              Number.isFinite(m.probability) &&
              m.probability > 0.2
            ) {
              raw = m.freq
            }
          }

          if (raw == null || raw < 45 || raw > 1400) {
            tunerRafRef.current = requestAnimationFrame(tick)
            return
          }

          const folded = foldToGuitarFundamental(raw)
          const smoothed = smoothPitchEMA(tunerSmoothFreqRef.current, folded, 0.2)
          tunerSmoothFreqRef.current = smoothed

          const { label, cents: c } = freqToNote(smoothed)
          const now = performance.now()
          const th = tunerUiThrottleRef.current
          if (
            now - th.t > 45 ||
            label !== th.label ||
            Math.abs(c - th.cents) > 3
          ) {
            tunerUiThrottleRef.current = { t: now, label, cents: c }
            setNoteLabel(label)
            setCents(c)
          }

          tunerRafRef.current = requestAnimationFrame(tick)
        }

        tunerRafRef.current = requestAnimationFrame(tick)
      } catch {
        if (alive) {
          setMicError(
            'Microfone indisponível ou permissão negada. Autorize o acesso nas definições do navegador.',
          )
          setTunerOn(false)
        }
      }
    })()

    return () => {
      alive = false
      stopTunerPipeline()
    }
  }, [tunerOn, stopTunerPipeline, micDeviceId, outputDeviceId])

  useEffect(() => {
    if (tunerOn) {
      startTracking('tuner')
    } else {
      stopTracking('tuner')
    }
    return () => {
      stopTracking('tuner')
    }
  }, [tunerOn, startTracking, stopTracking])

  useEffect(() => {
    return () => {
      Tone.Transport.stop()
      if (metronomeRepeatIdRef.current !== null) {
        Tone.Transport.clear(metronomeRepeatIdRef.current)
        metronomeRepeatIdRef.current = null
      }
      metronomeSynthRef.current?.dispose()
      cancelAnimationFrame(tunerRafRef.current)
      tunerStreamRef.current?.getTracks().forEach((tr) => tr.stop())
      void tunerCtxRef.current?.close()
      setCurrentBeat(1)
      setCurrentMeasure(1)
    }
  }, [])

  const inTune = Math.abs(cents) <= IN_TUNE_CENTS && noteLabel !== '—'

  const tabs: { id: TabId; label: string }[] = [
    { id: 'metronome', label: 'Metrônomo' },
    { id: 'tuner', label: 'Afinador' },
    { id: 'audio', label: 'Áudio' },
  ]

  return (
    <div className="space-y-6">
      <h1 className="font-mono text-2xl font-semibold tracking-tight md:text-3xl">
        Ferramentas
      </h1>

      <div
        className="flex flex-wrap gap-1 border-b border-white/10"
        role="tablist"
        aria-label="Secções das ferramentas"
      >
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            onClick={() => setActiveTab(id)}
            className={[
              'rounded-t-lg px-4 py-2.5 text-sm font-medium transition-all duration-200 ease-in-out',
              activeTab === id
                ? 'bg-[#FFB300]/10 text-[#FFB300] border-b-2 border-[#FFB300]'
                : 'text-gray-400 hover:text-white hover:bg-white/5',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'metronome' ? (
        <section
          className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm md:p-8"
          role="tabpanel"
          aria-label="Metrônomo"
        >
          <h2 className="mb-4 font-mono text-lg font-semibold tracking-tight text-[#F5F5F5]/95">
            Metrônomo avançado
          </h2>
          <p className="mb-4 font-mono text-3xl tabular-nums text-[#FFB300]">
            {globalBpm}{' '}
            <span className="text-lg text-[#F5F5F5]/60">BPM</span>
          </p>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setGlobalBpm(clampBpm(globalBpm - 1))}
              className="rounded-lg border border-white/10 bg-[#121212]/50 px-4 py-2 font-mono text-lg text-[#F5F5F5] backdrop-blur-sm transition-all hover:border-[#FFB300]/30 hover:bg-white/5"
              aria-label="Diminuir BPM"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => setGlobalBpm(clampBpm(globalBpm + 1))}
              className="rounded-lg border border-white/10 bg-[#121212]/50 px-4 py-2 font-mono text-lg text-[#F5F5F5] backdrop-blur-sm transition-all hover:border-[#FFB300]/30 hover:bg-white/5"
              aria-label="Aumentar BPM"
            >
              +
            </button>
            <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-[#F5F5F5]/55">
              Ajuste fino
              <input
                type="range"
                min={BPM_MIN}
                max={BPM_MAX}
                value={globalBpm}
                onChange={(e) =>
                  setGlobalBpm(clampBpm(Number(e.target.value)))
                }
                className="w-full accent-[#FFB300]"
              />
            </label>
          </div>
          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-[#F5F5F5]/85">
              Tempos por compasso
              <select
                value={beatsPerBar}
                onChange={(e) => setBeatsPerBar(Number(e.target.value))}
                className="rounded-lg border border-white/10 bg-[#121212]/50 px-3 py-2.5 text-[#F5F5F5] outline-none backdrop-blur-sm transition focus:border-[#FFB300]/50 focus:ring-1 focus:ring-[#FFB300]/30 bg-[#1A1A1A] text-white"
              >
                {BEATS_PER_BAR_OPTIONS.map((n) => (
                  <option key={n} value={n} className="bg-[#1A1A1A] text-white">
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-[#F5F5F5]/85">
              Ciclo de compassos
              <select
                value={measureCycle}
                onChange={(e) => setMeasureCycle(Number(e.target.value))}
                className="rounded-lg border border-white/10 bg-[#121212]/50 px-3 py-2.5 text-[#F5F5F5] outline-none backdrop-blur-sm transition focus:border-[#FFB300]/50 focus:ring-1 focus:ring-[#FFB300]/30 bg-[#1A1A1A] text-white"
              >
                {MEASURE_CYCLE_OPTIONS.map((n) => (
                  <option key={n} value={n} className="bg-[#1A1A1A] text-white">
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mb-6 flex justify-center">
            <div
              className="rounded-full transition-all duration-100 ease-out"
              style={{
                width: '9rem',
                height: '9rem',
                transform: `scale(${pulseScale})`,
                ...(!metronomeOn
                  ? {
                      backgroundColor: '#333333',
                      boxShadow: 'none',
                    }
                  : currentBeat === 1
                    ? {
                        backgroundColor: '#FFB300',
                        boxShadow: '0 0 36px rgba(255,179,0,0.85)',
                      }
                    : {
                        backgroundColor: '#D32F2F',
                        boxShadow: '0 0 42px rgba(211,47,47,0.85)',
                      }),
              }}
              aria-hidden
            />
          </div>
          <p className="mb-3 text-center text-xs text-[#F5F5F5]/45">
            Tempo 1 — âmbar · outros — vermelho
          </p>
          <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:gap-6">
            <button
              type="button"
              onClick={() => void handleMetronomeToggle()}
              className="min-h-[3rem] flex-1 rounded-lg border border-white/10 bg-[#121212]/50 px-4 py-3 text-base font-medium text-[#F5F5F5] backdrop-blur-sm transition-all hover:border-[#FFB300]/30 hover:bg-white/5 sm:max-w-md"
            >
              {metronomeOn ? 'Parar metrônomo' : 'Iniciar metrônomo'}
            </button>
            {metronomeOn ? (
              <div
                className="flex flex-1 flex-col items-center justify-center gap-1 sm:items-start"
                aria-live="polite"
                aria-atomic="true"
              >
                <p
                  className="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1 sm:justify-start"
                  title={`Compasso ${currentMeasure} | Tempo ${currentBeat}`}
                >
                  <span className="text-xs font-medium uppercase tracking-wide text-[#F5F5F5]/50">
                    Compasso
                  </span>
                  <span className="font-mono text-5xl font-bold leading-none tabular-nums text-[#FFB300] md:text-6xl">
                    {currentMeasure}
                  </span>
                  <span
                    className="font-mono text-2xl text-[#F5F5F5]/35 md:text-3xl"
                    aria-hidden
                  >
                    |
                  </span>
                  <span className="text-xs font-medium uppercase tracking-wide text-[#F5F5F5]/50">
                    Tempo
                  </span>
                  <span className="font-mono text-2xl font-semibold tabular-nums text-[#F5F5F5]/90 md:text-3xl">
                    {currentBeat}
                  </span>
                </p>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {activeTab === 'tuner' ? (
        <section
          className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm md:p-8"
          role="tabpanel"
          aria-label="Afinador"
        >
          {micError ? (
            <p className="mb-4 text-sm font-medium text-[#D32F2F]">
              {micError}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setMicError(null)
              setTunerOn((v) => !v)
            }}
            className="mb-6 w-full rounded-lg border border-white/10 bg-[#121212]/50 py-3 font-medium text-[#F5F5F5] backdrop-blur-sm transition-all hover:border-[#FFB300]/30 hover:bg-white/5"
          >
            {tunerOn ? 'Desativar afinador' : 'Ativar afinador'}
          </button>
          <p className="mb-6 text-xs leading-relaxed text-[#F5F5F5]/50">
            Dica: toque notas sustentadas, com a guitarra próxima do microfone
            escolhido na aba Áudio. Evite ruído de fundo; o ganho do microfone é
            reforçado no processamento.
          </p>
          <div
            className={
              inTune
                ? 'rounded-xl px-2 py-6 text-center shadow-[0_0_48px_rgba(255,179,0,0.95)] ring-2 ring-[#FFB300]/80'
                : 'rounded-xl px-2 py-6 text-center'
            }
          >
            <p
              className={`font-mono text-7xl font-bold leading-none tracking-tight text-[#F5F5F5] md:text-8xl ${
                inTune ? 'text-[#FFB300]' : ''
              }`}
            >
              {noteLabel}
            </p>
            <p className="mt-4 font-mono text-sm text-[#F5F5F5]/55">
              {noteLabel !== '—'
                ? `${cents >= 0 ? '+' : ''}${cents.toFixed(0)} centésimos`
                : '—'}
            </p>
          </div>
        </section>
      ) : null}

      {activeTab === 'audio' ? (
        <section
          className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm md:p-8"
          role="tabpanel"
          aria-label="Dispositivos de áudio"
        >
          <p className="mb-6 text-sm text-[#F5F5F5]/65">
            Escolha o microfone e a saída (auriculares ou colunas) utilizados
            nesta sessão. As preferências ficam guardadas no navegador.
          </p>
          <div className="space-y-6">
            <div>
              <label className="mb-2 block text-sm font-medium text-[#F5F5F5]">
                Microfone
              </label>
              <select
                value={micDeviceId}
                onChange={(e) => {
                  const v = e.target.value
                  setMicDeviceId(v)
                  setPreferredMicId(v)
                }}
                className="w-full max-w-xl rounded-lg border border-white/10 bg-[#121212]/50 px-3 py-2.5 text-[#F5F5F5] outline-none backdrop-blur-sm transition focus:border-[#FFB300]/50 focus:ring-1 focus:ring-[#FFB300]/30 bg-[#1A1A1A] text-white"
              >
                <option value="" className="bg-[#1A1A1A] text-white">
                  Padrão do sistema
                </option>
                {inputDevices.map((d) => (
                  <option
                    key={d.deviceId}
                    value={d.deviceId}
                    className="bg-[#1A1A1A] text-white"
                  >
                    {deviceLabel(d)}
                  </option>
                ))}
              </select>
              {!devicesLoaded ? (
                <p className="mt-2 text-xs text-[#F5F5F5]/45">
                  A carregar lista de dispositivos…
                </p>
              ) : inputDevices.length > 0 &&
                inputDevices.every((d) => !d.label) ? (
                <p className="mt-2 text-xs text-[#D32F2F]">
                  Ative o microfone noutra aba (ex.: Afinador) uma vez para o
                  navegador mostrar os nomes dos dispositivos.
                </p>
              ) : null}
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-[#F5F5F5]">
                Saída (fone / colunas)
              </label>
              <select
                value={outputDeviceId}
                onChange={(e) => {
                  const v = e.target.value
                  setOutputDeviceId(v)
                  setPreferredOutputId(v)
                  void (async () => {
                    try {
                      await Tone.start()
                      await applyToneOutputDevice(v)
                    } catch {
                      /* ignore */
                    }
                  })()
                }}
                disabled={!supportsAudioOutputSelection()}
                className="w-full max-w-xl rounded-lg border border-white/10 bg-[#121212]/50 px-3 py-2.5 text-[#F5F5F5] outline-none backdrop-blur-sm transition focus:border-[#FFB300]/50 focus:ring-1 focus:ring-[#FFB300]/30 disabled:cursor-not-allowed disabled:opacity-50 bg-[#1A1A1A] text-white"
              >
                <option value="" className="bg-[#1A1A1A] text-white">
                  Padrão do sistema
                </option>
                {outputDevices.map((d) => (
                  <option
                    key={d.deviceId}
                    value={d.deviceId}
                    className="bg-[#1A1A1A] text-white"
                  >
                    {deviceLabel(d)}
                  </option>
                ))}
              </select>
              {!supportsAudioOutputSelection() ? (
                <p className="mt-2 text-xs text-[#D32F2F]">
                  A escolha de saída não é suportada neste navegador. Utilize as
                  definições de som do sistema.
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => void refreshDevices()}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-[#F5F5F5] backdrop-blur-sm transition hover:border-[#FFB300]/30 hover:bg-white/10"
            >
              Atualizar lista de dispositivos
            </button>
          </div>
        </section>
      ) : null}
    </div>
  )
}
