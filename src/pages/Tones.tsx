import { useMemo, useState } from 'react'
import {
  AudioWaveform,
  Plus,
  Search,
  Sparkles,
  Timer,
  Zap,
} from 'lucide-react'
import tonesData from '../data/tones.json'
import { PedalboardStrip } from '../components/Pedalboard'
import { PresetManager } from '../components/PresetManager'
import { usePedalboard } from '../hooks/usePedalboard'
import { usePedalboardStore } from '../store/pedalboardStore'
import { PEDAL_CATALOG, type PedalType } from '../types/pedalboard'

type ToneChainEntry = {
  slot: string
  device: string
}

type ToneRecord = {
  band: string
  genre: string
  tonex_model: string
  amplitube5_chain: ToneChainEntry[]
  notes: string
}

type ToneWithId = ToneRecord & { id: string }

const PEDAL_TYPES = Object.keys(PEDAL_CATALOG) as PedalType[]

const PEDAL_TYPE_ICON: Record<PedalType, typeof Zap> = {
  distortion: Zap,
  chorus: AudioWaveform,
  delay: Timer,
  reverb: Sparkles,
}

export default function Tones() {
  const [query, setQuery] = useState('')

  const pedals = usePedalboardStore((s) => s.pedals)
  const addPedal = usePedalboardStore((s) => s.addPedal)
  const resetBoard = usePedalboardStore((s) => s.resetBoard)

  const { updateEffectParam, getInput } = usePedalboard()

  const allTones = useMemo((): ToneWithId[] => {
    return Object.entries(tonesData as Record<string, ToneRecord>).map(
      ([id, tone]) => ({ id, ...tone }),
    )
  }, [])

  const filteredTones = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allTones
    return allTones.filter((tone) => {
      const haystack = [
        tone.id,
        tone.band,
        tone.genre,
        tone.tonex_model,
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [allTones, query])

  return (
    <div className="space-y-10">
      <h1 className="font-mono text-2xl font-semibold tracking-tight md:text-3xl">
        Timbres
      </h1>

      <section className="space-y-5">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-white">
            Pedalboard modular
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-gray-400">
            Monte o seu rig como num estúdio: ordene os pedais ao seu gosto, afine o
            som nos knobs e ligue ou desligue cada efeito no footswitch.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
              Biblioteca de efeitos
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {PEDAL_TYPES.map((t) => {
                const Icon = PEDAL_TYPE_ICON[t]
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => addPedal(t)}
                    className="group inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-zinc-900/90 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-all hover:border-white/15 hover:bg-zinc-800/95 hover:text-zinc-200 active:scale-[0.98]"
                  >
                    <Plus
                      className="h-3 w-3 shrink-0 text-zinc-500 transition group-hover:text-[#FFB300]"
                      strokeWidth={2.5}
                    />
                    <Icon
                      className="h-3 w-3 shrink-0 opacity-70"
                      strokeWidth={2}
                    />
                    {PEDAL_CATALOG[t].label}
                  </button>
                )
              })}
            </div>
          </div>
          <button
            type="button"
            onClick={() => resetBoard()}
            className="shrink-0 rounded-md border border-white/[0.07] px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500 transition hover:border-red-500/25 hover:text-red-300/90"
          >
            Limpar mesa
          </button>
        </div>

        <PresetManager />

        <div
          className="relative min-h-[360px] overflow-x-auto rounded-xl border border-white/5 bg-zinc-950 p-6 shadow-[inset_0_20px_50px_rgba(0,0,0,0.9)] custom-scrollbar"
        >
          <div
            className="pointer-events-none absolute inset-0 rounded-xl opacity-[0.35]"
            style={{
              background:
                'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(255,255,255,0.06) 0%, transparent 55%)',
            }}
            aria-hidden
          />
          <div className="relative">
            <PedalboardStrip
              pedals={pedals}
              updateEffectParam={updateEffectParam}
              getInput={getInput}
            />
          </div>
        </div>
      </section>

      <section className="mt-20 space-y-5 border-t border-white/10 pt-10">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-white">
            Biblioteca de timbres
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Referências TONEX e cadeias Amplitube 5
          </p>
        </div>

        <div className="relative max-w-xl">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500"
            strokeWidth={2}
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome, banda ou estilo…"
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-sm text-zinc-100 outline-none backdrop-blur-sm transition placeholder:text-zinc-600 focus:border-[#FFB300]/40 focus:ring-1 focus:ring-[#FFB300]/25"
            aria-label="Buscar timbres"
          />
        </div>

        {filteredTones.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Nenhum timbre encontrado para esta busca.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredTones.map((tone) => (
              <li key={tone.id}>
                <article className="flex h-full flex-col rounded-xl border border-white/10 bg-white/5 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-white/15 hover:shadow-lg hover:shadow-black/40">
                  <header className="mb-4 border-b border-white/10 pb-3">
                    <p className="text-base font-bold tracking-tight text-white">
                      {tone.band}
                    </p>
                    <p className="mt-1 text-xs font-medium uppercase tracking-wide text-[#FFB300]/90">
                      {tone.genre}
                    </p>
                    <p className="mt-2 font-mono text-[10px] text-zinc-500">
                      {tone.id}
                    </p>
                  </header>

                  <div className="space-y-4 text-sm">
                    <div>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                        TONEX
                      </p>
                      <p className="font-mono text-xs leading-relaxed text-zinc-300">
                        {tone.tonex_model}
                      </p>
                    </div>
                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                        Amplitube 5 — cadeia
                      </p>
                      <ol className="list-decimal space-y-1.5 pl-4 font-mono text-xs leading-relaxed text-gray-400">
                        {tone.amplitube5_chain.map((step, index) => (
                          <li key={`${tone.id}-${index}-${step.slot}`}>
                            <span className="text-zinc-500">{step.slot}</span>
                            {' — '}
                            {step.device}
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
