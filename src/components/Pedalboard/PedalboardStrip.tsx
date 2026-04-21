import { useCallback } from 'react'
import * as Tone from 'tone'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { Mic, MicOff } from 'lucide-react'
import { usePedalboardStore } from '../../store/pedalboardStore'
import type { PedalInstance } from '../../types/pedalboard'
import { useInstrumentInput } from '../../hooks/usePedalboard'
import PedalNode from './PedalNode'

type PedalboardStripProps = {
  pedals: PedalInstance[]
  updateEffectParam: (effectId: string, paramName: string, value: number) => void
  getInput: () => Tone.Gain
}

export default function PedalboardStrip({
  pedals,
  updateEffectParam,
  getInput,
}: PedalboardStripProps) {
  const removePedal = usePedalboardStore((s) => s.removePedal)
  const togglePedal = usePedalboardStore((s) => s.togglePedal)
  const updateKnob = usePedalboardStore((s) => s.updateKnob)
  const setPedalOrder = usePedalboardStore((s) => s.setPedalOrder)

  const instrument = useInstrumentInput(getInput)

  const handleKnobChange = useCallback(
    (id: string, key: string, value: number) => {
      updateKnob(id, key, value)
      updateEffectParam(id, key, value)
    },
    [updateEffectParam, updateKnob],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const ids = pedals.map((p) => p.id)

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = ids.indexOf(String(active.id))
    const newIndex = ids.indexOf(String(over.id))
    if (oldIndex === -1 || newIndex === -1) return
    setPedalOrder(arrayMove(ids, oldIndex, newIndex))
  }

  return (
    <div className="relative flex min-h-[300px] flex-col">
      <div className="pointer-events-none absolute right-1 top-1 z-20 flex flex-col items-end gap-1.5">
        <span className="pointer-events-none text-[9px] font-semibold uppercase tracking-[0.22em] text-zinc-600">
          Instrumento
        </span>
        <button
          type="button"
          onClick={() => {
            void instrument.toggle().catch(() => {
              // erro já é refletido em UI pelo hook
            })
          }}
          className={`pointer-events-auto relative flex h-[52px] w-[52px] items-center justify-center rounded-full text-sm font-black transition-all hover:scale-[1.04] active:scale-95 ${
            instrument.isOpen
              ? 'bg-[#E11D48] text-zinc-50 shadow-[0_0_18px_rgba(225,29,72,0.35)] ring-2 ring-[#E11D48]/70'
              : 'bg-[#FFB300] text-zinc-900 shadow-[0_0_15px_rgba(255,179,0,0.4)] hover:shadow-[0_0_22px_rgba(255,179,0,0.55)]'
          }`}
          title={instrument.isOpen ? 'Desligar instrumento' : 'Ligar instrumento'}
          aria-pressed={instrument.isOpen}
        >
          {instrument.isOpen ? (
            <Mic className="h-6 w-6" strokeWidth={2.75} />
          ) : (
            <MicOff className="h-6 w-6" strokeWidth={2.75} />
          )}

          {instrument.isOpen ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -inset-1 rounded-full ring-2 ring-emerald-400/70 animate-pulse"
            />
          ) : null}
        </button>

        {instrument.error ? (
          <span className="pointer-events-none max-w-[180px] text-right text-[10px] font-semibold text-rose-400">
            {instrument.error}
          </span>
        ) : null}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={ids}
          strategy={horizontalListSortingStrategy}
        >
          <div className="flex min-h-[300px] w-full flex-1 items-center gap-4 overflow-x-auto overflow-y-visible pb-2 pr-[4.5rem] pt-2 custom-scrollbar">
            {pedals.length === 0 ? (
              <p className="w-full text-center text-sm font-medium text-zinc-600">
                Adicione efeitos na biblioteca acima para montar a cadeia.
              </p>
            ) : (
              pedals.map((p) => (
                <PedalNode
                  key={p.id}
                  pedal={p}
                  onRemove={removePedal}
                  onToggle={togglePedal}
                  onKnobChange={handleKnobChange}
                />
              ))
            )}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}
