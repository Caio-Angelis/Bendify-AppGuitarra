import { create } from 'zustand'
import {
  defaultKnobsForType,
  type PedalInstance,
  type PedalType,
  PEDAL_CATALOG,
} from '../types/pedalboard'
import { supabase } from '../utils/supabase'

type PedalboardState = {
  pedals: PedalInstance[]
  /** 5 slots (1..5). `null` significa slot vazio no DB. */
  presets: (PedalInstance[] | null)[]
  addPedal: (type: PedalType) => void
  removePedal: (id: string) => void
  setPedalOrder: (orderedIds: string[]) => void
  togglePedal: (id: string) => void
  updateKnob: (id: string, key: string, value: number) => void
  resetBoard: () => void
  /** Substitui o array atual de pedais (usado ao carregar preset). */
  setPedals: (next: PedalInstance[]) => void

  fetchPresetsFromDB: () => Promise<void>
  savePresetToDB: (slotIndex: number) => Promise<void>
  loadPresetFromDB: (slotIndex: number) => Promise<void>
  clearPresetSlotInDB: (slotIndex: number) => Promise<void>
}

function newPedalId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `pedal-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

const PRESET_SLOTS = 5 as const

function emptySlots<T>(value: T): T[] {
  return Array.from({ length: PRESET_SLOTS }, () => value)
}

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw new Error(error.message)
  const id = data.user?.id
  if (!id) throw new Error('Sessão inválida: utilizador não autenticado')
  return id
}

function decodePedalInstances(raw: unknown): PedalInstance[] {
  if (!Array.isArray(raw)) return []
  const out: PedalInstance[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const obj = item as Record<string, unknown>
    const id = obj.id
    const type = obj.type
    const on = obj.on
    const values = obj.values
    if (typeof id !== 'string') continue
    if (typeof type !== 'string') continue
    if (!(type in PEDAL_CATALOG)) continue
    if (typeof on !== 'boolean') continue
    if (!values || typeof values !== 'object') continue

    const vOut: Record<string, number> = {}
    for (const [k, v] of Object.entries(values as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v)) vOut[k] = v
    }

    out.push({
      id,
      type: type as PedalType,
      on,
      values: { ...defaultKnobsForType(type as PedalType), ...vOut },
    })
  }
  return out
}

export const usePedalboardStore = create<PedalboardState>()((set) => ({
  pedals: [],
  presets: emptySlots<PedalInstance[] | null>(null),

  addPedal: (type) =>
    set((s) => ({
      pedals: [
        ...s.pedals,
        {
          id: newPedalId(),
          type,
          on: true,
          values: { ...defaultKnobsForType(type) },
        },
      ],
    })),

  removePedal: (id) =>
    set((s) => ({
      pedals: s.pedals.filter((p) => p.id !== id),
    })),

  setPedalOrder: (orderedIds) =>
    set((s) => {
      const map = new Map(s.pedals.map((p) => [p.id, p] as const))
      const next: PedalInstance[] = []
      for (const id of orderedIds) {
        const p = map.get(id)
        if (p) next.push(p)
      }
      if (next.length !== s.pedals.length) return s
      return { pedals: next }
    }),

  togglePedal: (id) =>
    set((s) => ({
      pedals: s.pedals.map((p) =>
        p.id === id ? { ...p, on: !p.on } : p,
      ),
    })),

  updateKnob: (id, key, value) =>
    set((s) => ({
      pedals: s.pedals.map((p) => {
        if (p.id !== id) return p
        return {
          ...p,
          values: { ...p.values, [key]: value },
        }
      }),
    })),

  resetBoard: () => set({ pedals: [] }),

  setPedals: (next) => set({ pedals: next }),

  fetchPresetsFromDB: async () => {
    const userId = await requireUserId()
    const { data, error } = await supabase
      .from('pedalboard_presets')
      .select('slot_index, data')
      .eq('user_id', userId)
      .order('slot_index', { ascending: true })

    if (error) {
      throw new Error(error.message)
    }

    const next = emptySlots<PedalInstance[] | null>(null)
    for (const row of data ?? []) {
      const idx = row.slot_index
      if (typeof idx !== 'number' || idx < 1 || idx > PRESET_SLOTS) continue
      next[idx - 1] = decodePedalInstances(row.data as unknown)
    }
    set({ presets: next })
  },

  savePresetToDB: async (slotIndex) => {
    if (!Number.isFinite(slotIndex) || slotIndex < 1 || slotIndex > PRESET_SLOTS) {
      throw new Error('Slot inválido')
    }
    const userId = await requireUserId()
    const pedals = usePedalboardStore.getState().pedals

    const { error } = await supabase.from('pedalboard_presets').upsert(
      {
        user_id: userId,
        slot_index: slotIndex,
        // deixa `name` null para o trigger preencher "Preset N"
        name: null,
        data: pedals,
      },
      { onConflict: 'user_id,slot_index' },
    )

    if (error) {
      throw new Error(error.message)
    }

    set((s) => {
      const next = [...s.presets]
      next[slotIndex - 1] = pedals
      return { presets: next }
    })
  },

  loadPresetFromDB: async (slotIndex) => {
    if (!Number.isFinite(slotIndex) || slotIndex < 1 || slotIndex > PRESET_SLOTS) {
      throw new Error('Slot inválido')
    }
    const userId = await requireUserId()

    const { data, error } = await supabase
      .from('pedalboard_presets')
      .select('data')
      .eq('user_id', userId)
      .eq('slot_index', slotIndex)
      .maybeSingle()

    if (error) {
      throw new Error(error.message)
    }

    const decoded = decodePedalInstances((data as { data?: unknown } | null)?.data)
    set({ pedals: decoded })

    set((s) => {
      const next = [...s.presets]
      next[slotIndex - 1] = data ? decoded : null
      return { presets: next }
    })
  },

  clearPresetSlotInDB: async (slotIndex) => {
    if (!Number.isFinite(slotIndex) || slotIndex < 1 || slotIndex > PRESET_SLOTS) {
      throw new Error('Slot inválido')
    }
    const userId = await requireUserId()

    const { error } = await supabase
      .from('pedalboard_presets')
      .delete()
      .eq('user_id', userId)
      .eq('slot_index', slotIndex)

    if (error) {
      throw new Error(error.message)
    }

    set((s) => {
      const next = [...s.presets]
      next[slotIndex - 1] = null
      return { presets: next }
    })
  },
}))
