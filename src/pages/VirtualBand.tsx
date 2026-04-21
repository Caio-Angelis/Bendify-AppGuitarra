import { useEffect, useMemo, useRef } from 'react'
import { useVirtualBand } from '../hooks/useVirtualBand'
import AvatarViewer, { type GuitarPlayerAnimRef } from '../components/AvatarViewer'
import { useStore } from '../store/useStore'
import { VirtualBandEngine } from '../services/VirtualBandEngine'

const NOTE_KEYS_MAJOR = [
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

const KEY_OPTIONS = [
  ...NOTE_KEYS_MAJOR,
  ...NOTE_KEYS_MAJOR.map((k) => `${k}m` as const),
] as readonly string[]

export default function VirtualBand() {
  const { genre, key, availableGenres, isPlaying, current, setGenre, setKey, play, stop } =
    useVirtualBand()

  const equippedItems = useStore((s) => s.equippedItems)

  const avatarRef = useRef<GuitarPlayerAnimRef>(null)

  useEffect(() => {
    const prev = VirtualBandEngine.onStrum
    const handler = () => {
      avatarRef.current?.triggerStrum()
    }
    VirtualBandEngine.onStrum = isPlaying ? handler : undefined
    return () => {
      if (VirtualBandEngine.onStrum === handler) {
        VirtualBandEngine.onStrum = prev
      }
    }
  }, [isPlaying])

  const nowPlayingLabel = useMemo(() => {
    if (!current) return '—'
    return current.chordSymbol
  }, [current])

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-mono text-2xl font-semibold tracking-tight md:text-3xl">
            Banda Virtual Infinita
          </h1>
          <p className="mt-1 text-sm text-[#F5F5F5]/60">
            Gerador de base + avatar sincronizado em tempo real.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-xl border border-white/10 bg-[#121212]/50 px-3 py-2 backdrop-blur-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#F5F5F5]/45">
              Tocando agora
            </p>
            <p className="mt-0.5 font-mono text-xl font-semibold text-[#FFB300]">
              {nowPlayingLabel}
            </p>
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-12">
        <aside className="lg:col-span-4">
          <section className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#F5F5F5]/55">
              Controles
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <label className="flex flex-col gap-1.5 text-sm font-medium text-[#F5F5F5]/85">
                Gênero
                <select
                  value={genre}
                  onChange={(e) => setGenre(e.target.value as typeof genre)}
                  className="rounded-lg border border-white/10 bg-[#121212]/50 px-3 py-2.5 text-[#F5F5F5] outline-none backdrop-blur-sm transition focus:border-[#FFB300]/50 focus:ring-1 focus:ring-[#FFB300]/30 bg-[#1A1A1A] text-white"
                  disabled={isPlaying}
                >
                  {availableGenres.map((g) => (
                    <option key={g} value={g} className="bg-[#1A1A1A] text-white">
                      {g}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5 text-sm font-medium text-[#F5F5F5]/85">
                Tom
                <select
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  className="rounded-lg border border-white/10 bg-[#121212]/50 px-3 py-2.5 text-[#F5F5F5] outline-none backdrop-blur-sm transition focus:border-[#FFB300]/50 focus:ring-1 focus:ring-[#FFB300]/30 bg-[#1A1A1A] text-white"
                  disabled={isPlaying}
                >
                  {KEY_OPTIONS.map((k) => (
                    <option key={k} value={k} className="bg-[#1A1A1A] text-white">
                      {k}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button
              type="button"
              onClick={() => void (isPlaying ? Promise.resolve(stop()) : play())}
              className={[
                'mt-5 w-full rounded-xl px-5 py-3 text-base font-bold transition-all duration-300',
                isPlaying
                  ? 'border border-white/10 bg-white/5 text-[#F5F5F5] backdrop-blur-sm hover:border-[#FFB300]/30 hover:bg-white/10'
                  : 'bg-[#FFB300] text-black hover:brightness-105',
              ].join(' ')}
            >
              {isPlaying ? 'Stop Jam' : 'Start Jam'}
            </button>

            <div className="mt-5 rounded-xl border border-white/10 bg-[#121212]/50 px-4 py-3 backdrop-blur-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-[#F5F5F5]/55">
                Progressão
              </p>
              {current ? (
                <p className="mt-1 text-sm text-[#F5F5F5]/70">
                  <span className="font-mono text-[#FFB300]">{current.progressionId}</span>
                  <span className="mx-2 text-[#F5F5F5]/30">·</span>
                  Passo{' '}
                  <span className="font-mono text-[#F5F5F5]">
                    {current.stepIndex + 1}/{current.stepCount}
                  </span>
                </p>
              ) : (
                <p className="mt-1 text-sm text-[#F5F5F5]/55">—</p>
              )}
            </div>
          </section>
        </aside>

        <section className="lg:col-span-8">
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-[#1E1E1E] to-black shadow-[inset_0_-50px_50px_-50px_rgba(255,179,0,0.15)] backdrop-blur-sm">
            <div
              className="pointer-events-none absolute inset-0 opacity-80"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 50% 18%, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 22%, transparent 58%)',
              }}
              aria-hidden
            />

            <div className="relative flex min-h-[520px] w-full items-center justify-center p-4 sm:min-h-[620px]">
              <AvatarViewer
                ref={avatarRef}
                equippedItems={equippedItems}
                size={460}
                backdrop={false}
                motion={{ enabled: false }}
                className="mx-auto w-full max-w-[min(100%,520px)]"
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

