import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Trash2 } from 'lucide-react'
import {
  PEDAL_CATALOG,
  type PedalInstance,
  type PedalType,
} from '../../types/pedalboard'

type PedalNodeProps = {
  pedal: PedalInstance
  onRemove: (id: string) => void
  onToggle: (id: string) => void
  onKnobChange: (id: string, key: string, value: number) => void
}

const TYPE_HALO: Record<
  PedalType,
  string
> = {
  distortion:
    'shadow-[0_0_22px_rgba(234,88,12,0.18)] ring-1 ring-orange-500/25',
  chorus: 'shadow-[0_0_22px_rgba(59,130,246,0.18)] ring-1 ring-sky-500/25',
  delay:
    'shadow-[0_0_22px_rgba(16,185,129,0.18)] ring-1 ring-emerald-500/25',
  reverb:
    'shadow-[0_0_22px_rgba(139,92,246,0.16)] ring-1 ring-violet-500/25',
}

export default function PedalNode({
  pedal,
  onRemove,
  onToggle,
  onKnobChange,
}: PedalNodeProps) {
  const def = PEDAL_CATALOG[pedal.type]
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: pedal.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const halo = TYPE_HALO[pedal.type]

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`relative flex w-[158px] shrink-0 flex-col overflow-hidden rounded-lg border border-white/10 bg-gradient-to-b from-[#2a2a2a] to-[#1a1a1a] shadow-2xl shadow-black/70 transition-[box-shadow,opacity,transform] ${
        isDragging
          ? 'z-20 opacity-[0.98] ring-2 ring-[#FFB300]/55 shadow-[0_12px_40px_rgba(0,0,0,0.75)]'
          : ''
      } ${pedal.on && !isDragging ? halo : ''} ${
        pedal.on ? '' : 'opacity-[0.82]'
      }`}
    >
      <div
        className={`h-[7px] w-full shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] ${def.accentClass}`}
        aria-hidden
      />

      <div
        className="flex cursor-grab touch-none select-none items-center justify-between gap-1.5 border-b border-black/40 px-2 py-2 shadow-[inset_0_-1px_0_rgba(255,255,255,0.04)] active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <h3 className="truncate text-[10px] font-bold uppercase tracking-widest text-zinc-300">
          {def.label}
        </h3>
        <button
          type="button"
          onClick={() => onRemove(pedal.id)}
          className="rounded-md p-1 text-zinc-500 transition hover:bg-black/30 hover:text-zinc-200"
          aria-label={`Remover ${def.label}`}
        >
          <Trash2 className="h-3 w-3" strokeWidth={2} />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3.5 px-2.5 pb-3 pt-3">
        {def.knobs.map((k) => (
          <label
            key={k.key}
            className="flex flex-col gap-1"
          >
            <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              {k.label}
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.005}
              value={pedal.values[k.key] ?? 0}
              disabled={!pedal.on}
              onChange={(e) => {
                const v = Number(e.target.value)
                onKnobChange(pedal.id, k.key, v)
              }}
              className="pedal-knob-range"
            />
          </label>
        ))}

        <div className="mt-auto flex flex-col items-center gap-2.5 pt-1">
          <div
            className={`h-2.5 w-2.5 rounded-full shadow-[inset_0_1px_2px_rgba(0,0,0,0.7)] transition-all duration-200 ${
              pedal.on
                ? 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.8)]'
                : 'bg-red-950'
            }`}
            aria-hidden
            title={pedal.on ? 'Ativo' : 'Bypass'}
          />
          <button
            type="button"
            onClick={() => onToggle(pedal.id)}
            className="mx-auto mb-4 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-gray-400 to-gray-600 shadow-[inset_0_-2px_5px_rgba(0,0,0,0.5),0_5px_10px_rgba(0,0,0,0.5)] transition-transform active:scale-95"
            aria-pressed={pedal.on}
            aria-label={pedal.on ? 'Desligar pedal' : 'Ligar pedal'}
          >
            <span
              className="h-2 w-6 rounded-full bg-black/25 shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)]"
              aria-hidden
            />
          </button>
        </div>
      </div>
    </article>
  )
}
