import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Pause, Play, Square, X } from 'lucide-react'
import tracksData from '../data/tracks.json'
import { useAudioPlayer } from '../hooks/useAudioPlayer'
import { useStore, type Track } from '../store/useStore'

function formatTime(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

function parseChordList(text: string) {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export default function Practice() {
  const {
    positionSec,
    durationSec,
    isBufferReady,
    togglePlay,
    stop,
  } = useAudioPlayer()

  const trackEntries = useMemo(
    () => Object.entries(tracksData as Record<string, Track>) as [string, Track][],
    [],
  )

  const [selectedId, setSelectedId] = useState(
    () => trackEntries[0]?.[0] ?? '',
  )

  const currentTrack = useStore((s) => s.currentTrack)
  const isPlaying = useStore((s) => s.isPlaying)
  const activeChord = useStore((s) => s.activeChord)
  const setCurrentTrack = useStore((s) => s.setCurrentTrack)
  const startTracking = useStore((s) => s.startTracking)
  const stopTracking = useStore((s) => s.stopTracking)

  useEffect(() => {
    if (isPlaying) {
      startTracking('player')
    } else {
      stopTracking('player')
    }
    return () => {
      stopTracking('player')
    }
  }, [isPlaying, startTracking, stopTracking])

  const [mappingOpen, setMappingOpen] = useState(false)
  const [importChordsText, setImportChordsText] = useState('')
  const [tapSessionActive, setTapSessionActive] = useState(false)
  const [tapEvents, setTapEvents] = useState<{ time: number; chord: string }[]>(
    [],
  )
  const [mappingError, setMappingError] = useState<string | null>(null)
  const [copyHint, setCopyHint] = useState<string | null>(null)

  const importAudioRef = useRef<HTMLAudioElement | null>(null)
  const importBlobUrlRef = useRef<string | null>(null)
  const tapEventsRef = useRef<{ time: number; chord: string }[]>([])
  tapEventsRef.current = tapEvents

  const tapJsonOutput = useMemo(
    () =>
      JSON.stringify(
        tapEvents.map(({ time, chord }) => ({
          time: Math.round(time * 1000) / 1000,
          chord,
        })),
        null,
        2,
      ),
    [tapEvents],
  )

  const closeMappingModal = useCallback(() => {
    const a = importAudioRef.current
    if (a) {
      a.pause()
      a.src = ''
    }
    importAudioRef.current = null
    if (importBlobUrlRef.current) {
      URL.revokeObjectURL(importBlobUrlRef.current)
      importBlobUrlRef.current = null
    }
    setMappingOpen(false)
    setTapSessionActive(false)
    setTapEvents([])
    setMappingError(null)
    setImportChordsText('')
    setCopyHint(null)
  }, [])

  const onImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (importBlobUrlRef.current) {
      URL.revokeObjectURL(importBlobUrlRef.current)
      importBlobUrlRef.current = null
    }
    const prev = importAudioRef.current
    if (prev) {
      prev.pause()
      prev.src = ''
    }
    importAudioRef.current = null
    setTapSessionActive(false)
    setTapEvents([])
    setMappingError(null)

    if (!file || !file.name.toLowerCase().endsWith('.mp3')) {
      if (file) setMappingError('Use um ficheiro .mp3.')
      return
    }

    const url = URL.createObjectURL(file)
    importBlobUrlRef.current = url
    const audio = new Audio(url)
    importAudioRef.current = audio
  }

  const startTapSession = () => {
    setMappingError(null)
    setCopyHint(null)
    const chords = parseChordList(importChordsText)
    const audio = importAudioRef.current

    if (!importBlobUrlRef.current || !audio) {
      setMappingError('Carregue um ficheiro MP3 antes de iniciar.')
      return
    }
    if (chords.length === 0) {
      setMappingError('Digite os acordes separados por vírgula.')
      return
    }

    audio.currentTime = 0
    setTapEvents([])
    setTapSessionActive(true)
    void audio.play().catch(() => {
      setMappingError('Não foi possível reproduzir o áudio.')
      setTapSessionActive(false)
    })
  }

  const recordTap = useCallback(() => {
    setCopyHint(null)
    const chords = parseChordList(importChordsText)
    const audio = importAudioRef.current

    if (!importBlobUrlRef.current || !audio) {
      setMappingError('Carregue um ficheiro MP3 antes do tap.')
      return
    }
    if (chords.length === 0) {
      setMappingError('Digite os acordes separados por vírgula.')
      return
    }
    if (!tapSessionActive) {
      setMappingError('Inicie a reprodução com o botão antes de usar o tap.')
      return
    }
    if (tapEventsRef.current.length >= chords.length) {
      setMappingError('Todos os acordes já foram mapeados.')
      return
    }

    setMappingError(null)
    setTapEvents((prev) => {
      if (prev.length >= chords.length) {
        return prev
      }
      const t = audio.currentTime
      const chord = chords[prev.length]
      const next = [...prev, { time: t, chord }]
      if (next.length >= chords.length) {
        audio.pause()
        setTapSessionActive(false)
      }
      return next
    })
  }, [importChordsText, tapSessionActive])

  const chordCount = useMemo(
    () => parseChordList(importChordsText).length,
    [importChordsText],
  )

  useEffect(() => {
    if (!mappingOpen || !tapSessionActive) return

    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const t = e.target
      if (
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLInputElement
      ) {
        return
      }
      e.preventDefault()
      recordTap()
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mappingOpen, tapSessionActive, recordTap])

  const copyJson = async () => {
    setCopyHint(null)
    try {
      await navigator.clipboard.writeText(tapJsonOutput)
      setCopyHint('Copiado.')
    } catch {
      setMappingError('Não foi possível copiar. Selecione o texto manualmente.')
    }
  }

  useLayoutEffect(() => {
    const entry = trackEntries.find(([id]) => id === selectedId)
    if (entry) setCurrentTrack(entry[1])
  }, [selectedId, trackEntries, setCurrentTrack])

  const hasTrack = Boolean(currentTrack)
  const controlsEnabled = hasTrack && isBufferReady

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-mono text-2xl font-semibold tracking-tight md:text-3xl">
          Prática
        </h1>
        <button
          type="button"
          onClick={() => {
            setMappingOpen(true)
            setMappingError(null)
            setCopyHint(null)
          }}
          className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-[#F5F5F5] backdrop-blur-sm transition-all duration-200 ease-in-out hover:border-[#FFB300]/30 hover:bg-white/10"
        >
          Modo Mapeamento
        </button>
      </div>

      {mappingOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="presentation"
        >
          <div
            className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-white/10 bg-[#1A1A1A]/80 p-6 shadow-xl backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mapping-title"
          >
            <button
              type="button"
              onClick={closeMappingModal}
              className="absolute right-4 top-4 rounded-lg border border-white/10 bg-white/5 p-2 text-[#F5F5F5] backdrop-blur-sm transition hover:border-[#FFB300]/30 hover:bg-white/10"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>

            <h2
              id="mapping-title"
              className="mb-4 pr-10 font-mono text-lg font-semibold text-[#F5F5F5]"
            >
              Importador híbrido (tap tempo)
            </h2>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm text-[#F5F5F5]/80">
                  Ficheiro MP3
                </label>
                <input
                  type="file"
                  accept=".mp3,audio/mpeg"
                  onChange={onImportFileChange}
                  className="w-full rounded-lg border border-white/10 bg-[#121212]/60 px-3 py-2 text-sm text-[#F5F5F5] backdrop-blur-sm file:mr-3 file:rounded file:border-0 file:bg-white/10 file:px-3 file:py-1 file:text-[#F5F5F5]"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm text-[#F5F5F5]/80">
                  Acordes (separados por vírgula)
                </label>
                <textarea
                  value={importChordsText}
                  onChange={(e) => setImportChordsText(e.target.value)}
                  rows={3}
                  placeholder="A7, D7, A7, E7, D7, A7, E7, A7"
                  className="w-full resize-y rounded-lg border border-white/10 bg-[#121212]/60 px-3 py-2 font-sans text-sm text-[#F5F5F5] outline-none backdrop-blur-sm transition focus:border-[#FFB300]/50 focus:ring-1 focus:ring-[#FFB300]/30"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={startTapSession}
                  className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-[#F5F5F5] backdrop-blur-sm transition hover:border-[#FFB300]/30 hover:bg-white/10"
                >
                  Iniciar áudio e mapeamento
                </button>
              </div>

              {mappingError ? (
                <p className="text-sm font-medium text-[#D32F2F]">
                  {mappingError}
                </p>
              ) : null}
              {copyHint ? (
                <p className="text-sm text-[#F5F5F5]/70">{copyHint}</p>
              ) : null}

              <div>
                <p className="mb-2 text-xs text-[#F5F5F5]/55">
                  Toque no botão ou use a tecla Espaço (fora dos campos de texto)
                  após iniciar o áudio. Cada toque regista o instante atual para o
                  próximo acorde da lista.
                </p>
                <button
                  type="button"
                  onClick={recordTap}
                  className="w-full rounded-xl border border-white/10 bg-gradient-to-b from-[#1E1E1E] to-black py-8 text-center font-mono text-xl font-semibold text-[#FFB300] shadow-[0_0_20px_rgba(255,179,0,0.10)] transition-all duration-300 ease-in-out hover:-translate-y-0.5 hover:border-[#FFB300]/30 hover:shadow-lg hover:shadow-[#FFB300]/10"
                >
                  TAP
                </button>
                <p className="mt-2 text-center font-mono text-xs text-[#F5F5F5]/45">
                  {tapSessionActive && chordCount > 0
                    ? `Próximo: ${tapEvents.length + 1} de ${chordCount}`
                    : chordCount > 0 &&
                        tapEvents.length > 0 &&
                        tapEvents.length === chordCount
                      ? 'Mapeamento concluído'
                      : 'Sessão inativa'}
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm text-[#F5F5F5]/80">
                  Resultado JSON (chords)
                </label>
                <textarea
                  readOnly
                  value={tapJsonOutput}
                  rows={12}
                  className="w-full resize-y rounded-lg border border-white/10 bg-[#121212]/60 px-3 py-2 font-mono text-xs leading-relaxed text-[#F5F5F5] backdrop-blur-sm md:text-sm"
                />
                <button
                  type="button"
                  onClick={copyJson}
                  disabled={tapEvents.length === 0}
                  className="mt-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-[#F5F5F5] backdrop-blur-sm transition hover:border-[#FFB300]/30 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Copiar para área de transferência
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <label className="flex max-w-xl flex-col gap-1.5 text-sm text-[#F5F5F5]/80">
        <span className="font-medium text-[#F5F5F5]">Música</span>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-sans text-[#F5F5F5] outline-none backdrop-blur-sm transition duration-200 ease-in-out focus:border-[#FFB300]/50 focus:ring-1 focus:ring-[#FFB300]/30 bg-[#1A1A1A] text-white"
          aria-label="Selecionar música"
        >
          {trackEntries.map(([id, track]) => (
            <option key={id} value={id} className="bg-[#1A1A1A] text-white">
              {track.title}
            </option>
          ))}
        </select>
      </label>

      <section
        className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm md:p-8"
        aria-label="Controles do player"
      >
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:flex-wrap sm:justify-between sm:gap-8">
          <div className="flex items-center justify-center gap-3 sm:gap-4">
            <button
              type="button"
              onClick={() => {
                if (!isPlaying) void togglePlay()
              }}
              disabled={!controlsEnabled}
              className={[
                'flex h-14 w-14 items-center justify-center rounded-lg border border-white/10 bg-[#121212]/50 text-[#F5F5F5] backdrop-blur-sm transition-all duration-200 ease-in-out',
                'hover:border-[#FFB300]/30 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40',
                isPlaying
                  ? 'shadow-[0_0_20px_rgba(255,179,0,0.30)] ring-1 ring-[#FFB300]/40'
                  : '',
              ].join(' ')}
              aria-label="Play"
            >
              <Play className="h-7 w-7" fill="currentColor" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => {
                if (isPlaying) void togglePlay()
              }}
              disabled={!controlsEnabled}
              className="flex h-14 w-14 items-center justify-center rounded-lg border border-white/10 bg-[#121212]/50 text-[#F5F5F5] backdrop-blur-sm transition-all duration-200 ease-in-out hover:border-[#FFB300]/30 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Pause"
            >
              <Pause className="h-7 w-7" fill="currentColor" aria-hidden />
            </button>
            <button
              type="button"
              onClick={stop}
              disabled={!controlsEnabled}
              className="flex h-14 w-14 items-center justify-center rounded-lg border border-white/10 bg-[#121212]/50 text-[#F5F5F5] backdrop-blur-sm transition-all duration-200 ease-in-out hover:border-[#FFB300]/30 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Stop"
            >
              <Square className="h-6 w-6" fill="currentColor" aria-hidden />
            </button>
          </div>
          <p className="font-mono text-lg tabular-nums text-[#F5F5F5] sm:text-xl">
            {formatTime(positionSec)} / {formatTime(durationSec)}
          </p>
        </div>
      </section>

      <section aria-label="Esteira de cifras">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-[#F5F5F5]/55">
          Cifras
        </h2>
        {!currentTrack || currentTrack.chords.length === 0 ? (
          <p className="text-sm text-[#F5F5F5]/45">Nenhum acorde nesta faixa.</p>
        ) : (
          <div className="overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
            <div className="flex min-w-min gap-2">
              {currentTrack.chords.map((event, index) => {
                const isActive = event.chord === activeChord.trim()
                return (
                  <span
                    key={`${event.time}-${event.chord}-${index}`}
                    className={
                      isActive
                        ? 'shrink-0 rounded-lg bg-[#FFB300] px-4 py-2 font-mono text-sm font-semibold text-[#121212] shadow-[0_0_16px_rgba(255,179,0,0.55)] transition duration-200 ease-in-out'
                        : 'shrink-0 rounded-lg bg-[#121212]/80 px-4 py-2 font-mono text-sm font-medium text-[#F5F5F5]/55 transition duration-200 ease-in-out'
                    }
                  >
                    {event.chord}
                  </span>
                )
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
