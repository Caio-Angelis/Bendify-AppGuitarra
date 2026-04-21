import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Session } from '@supabase/supabase-js'
import {
  shopTypeToEquippedSlot,
  type EquippedSlot,
} from '../data/shopItems'
import {
  fetchEquippedInventoryRows,
  fetchProfileEconomy,
  fetchUserInventoryWithTypes,
} from '../utils/supabase'
import type { GuitarHeroRunSnapshot } from '../types/guitarHero'

function todayKey(): string {
  return new Date().toDateString()
}

function xmur3(str: string) {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return h >>> 0
  }
}

function dayOfYearLocal(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1)
  const cur = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diff = Math.round(
    (cur.getTime() - start.getTime()) / (24 * 60 * 60 * 1000),
  )
  return Math.max(0, Math.min(364, diff))
}

export type EquippedItems = {
  guitar: string | null
  clothes: string | null
  character: string | null
}

/** Inventário local (alinhado a `user_inventory` + `shop_items.type`). */
export type InventoryEntry = {
  item_id: string
  quantity: number
  type: string
}

const defaultEquippedItems: EquippedItems = {
  guitar: null,
  clothes: null,
  character: null,
}

/** Tom de pele padrão do paper doll (Bendify). */
export const DEFAULT_BASE_SKIN_COLOR = '#E8B89A'

export type ChordEvent = {
  time: number
  chord: string
}

export type Track = {
  title: string
  style: string
  bpm: number
  key: string
  audio_path: string
  chords: ChordEvent[]
}

export type UserStats = {
  streak: number
  maxBpm: number
  /** Nível global do perfil (economia / loja; alinhado a `profiles.level` no Supabase). */
  level: number
  /** Créditos para a loja (alinhado a `profiles.credits` no Supabase). */
  credits: number
  /** Nível do minijogo Desafio de Ouvido (`/challenges/ear-training`). */
  earTrainingLevel: number
  /** Acertos consecutivos no Desafio de Ouvido (reseta ao errar). */
  earTrainingStreak: number
  /** Nível do minijogo Ninja do Braço (`/challenges/fretboard`). */
  fretboardLevel: number
  /** Acertos consecutivos no braço (reseta ao errar). */
  fretboardStreak: number
  /** Nível do minijogo Genius de Escalas (`/challenges/genius`). */
  geniusLevel: number
  /** Rodadas completas consecutivas no Genius (reseta ao errar). */
  geniusStreak: number
  /** Nível do minijogo Desafio de Precisão (`/challenges/pitch-strike`). */
  pitchStrikeLevel: number
  /** Acertos consecutivos no Desafio de Precisão (microfone). */
  pitchStrikeStreak: number
}

export type DailyQuestKind =
  | 'practice_seconds'
  | 'ear_training_correct'
  | 'metronome_seconds'

export type DailyQuestDefinition = {
  id: string
  title: string
  description: string
  kind: DailyQuestKind
  target: number
  rewardCredits: number
}

export type DailyQuestProgress = {
  questId: string
  progress: number
  completed: boolean
  claimed: boolean
}

export type StoredGuitarHeroSnapshot = GuitarHeroRunSnapshot

type Store = {
  session: Session | null
  /** Após o primeiro `getSession` do Supabase (evita redirect prematuro para /login). */
  authHydrated: boolean
  currentTrack: Track | null
  isPlaying: boolean
  globalBpm: number
  activeChord: string
  dailyPracticeTime: number
  /** Fontes ativas que pedem contagem global de prática (não persistido). */
  activeTrackers: string[]
  /** Dia civil a que `dailyPracticeTime` se refere (para repor ao mudar o dia). */
  practiceSessionDate: string
  lastWorkoutDate: string
  userStats: UserStats
  /** IDs de itens da loja comprados (local até sync com `user_inventory`). */
  purchasedShopItemIds: string[]
  /** Itens cosméticos equipados por categoria (persistido; espelha `user_inventory.equipped` + `shop_items.type`). */
  equippedItems: EquippedItems
  /** Inventário com quantidades (consumíveis e outros com `quantity` no servidor). */
  inventory: InventoryEntry[]
  /** Cor de pele base do avatar (HEX), persistida com o inventário. */
  baseSkinColor: string
  /** Tentativas restantes do Scale Runner no dia civil (máx. 3). */
  dailyAttempts: number
  /** Dia civil (`Date.toDateString()`) em que `dailyAttempts` foi reposto/consumido. */
  lastAttemptDate: string
  /** Toast global (não persistido), ex.: conquista desbloqueada. */
  globalToast: string | null
  /** Volume linear 0–1 aplicado ao `Tone.getDestination()` (áudio Tone.js). */
  masterVolume: number
  /** Dia civil (`Date.toDateString()`) em que as missões foram sorteadas. */
  dailyQuestsDate: string
  /** Estado das 3 missões sorteadas para o dia. */
  dailyQuests: DailyQuestProgress[]
  /** Segundos acumulados hoje com o metrônomo ligado (via tracker). */
  dailyMetronomeSeconds: number
  /** Acertos no desafio de ouvido acumulados hoje. */
  dailyEarTrainingCorrect: number
  /** Banco de missões disponíveis (estático). */
  dailyQuestBank: DailyQuestDefinition[]
  /** Snapshot volátil do modo Guitar Hero Inteligente (HUD em tempo real). */
  guitarHeroSnapshot: StoredGuitarHeroSnapshot | null
  /** Maior score local obtido no modo Guitar Hero Inteligente. */
  guitarHeroBestScore: number
  setMasterVolume: (value: number) => void
  setSession: (session: Session | null) => void
  /** Limpa sessão auth e progresso local persistido (evita vazar dados entre contas). */
  clearUserSession: () => void
  setAuthHydrated: (value: boolean) => void
  setCurrentTrack: (track: Track | null) => void
  setIsPlaying: (playing: boolean) => void
  setGlobalBpm: (bpm: number) => void
  setActiveChord: (chord: string) => void
  addPracticeTime: (seconds: number) => void
  startTracking: (source: string) => void
  stopTracking: (source: string) => void
  resetPracticeTime: () => void
  setLastWorkoutDate: (date: string) => void
  setUserStats: (stats: UserStats | ((prev: UserStats) => UserStats)) => void
  setStreak: (streak: number) => void
  updateEarTrainingStreak: (streak: number) => void
  levelUpEarTraining: () => void
  updateFretboardStreak: (streak: number) => void
  levelUpFretboard: () => void
  updateGeniusStreak: (streak: number) => void
  levelUpGenius: () => void
  updatePitchStrikeStreak: (streak: number) => void
  levelUpPitchStrike: () => void
  addCredits: (amount: number) => void
  spendCredits: (amount: number) => boolean
  levelUp: () => void
  markShopItemPurchased: (id: string) => void
  setEquippedItem: (type: EquippedSlot, itemId: string | null) => void
  setBaseSkinColor: (color: string) => void
  /** Lê `user_inventory` com `equipped = true` e preenche `equippedItems`. */
  syncEquippedItemsFromDb: () => Promise<void>
  /** Sincroniza `inventory` a partir de `user_inventory` + tipos em `shop_items`. */
  syncInventoryFromDb: () => Promise<void>
  /** Sincroniza nível/créditos a partir do `profiles` (fonte de verdade). */
  syncProfileEconomyFromDb: () => Promise<void>
  /** Reduz em 1 a quantidade do primeiro item com `type` e quantidade > 0. */
  consumeItemLocally: (type: string) => void
  /** Incrementa ou cria entrada no inventário local (ex.: após compra de consumível). */
  addInventoryQuantityLocally: (
    itemId: string,
    type: string,
    delta: number,
  ) => void
  /** Consome 1 tentativa diária do Scale Runner; repõe 3 se mudou o dia civil. Devolve false se não houver tentativas. */
  useAttempt: () => boolean
  showGlobalToast: (message: string, durationMs?: number) => void
  clearGlobalToast: () => void
  /** Garante que existem 3 missões para o dia civil atual (idempotente). */
  ensureDailyQuests: () => void
  /** Incrementa contadores do dia e atualiza progresso de missões relacionadas. */
  recordDailyEarTrainingCorrect: (delta?: number) => void
  /** Tenta resgatar a recompensa de uma missão (apenas uma vez). */
  claimDailyQuest: (questId: string) => boolean
  setGuitarHeroSnapshot: (snapshot: StoredGuitarHeroSnapshot | null) => void
  commitGuitarHeroRun: (snapshot: StoredGuitarHeroSnapshot) => void
}

const defaultUserStats: UserStats = {
  streak: 0,
  maxBpm: 0,
  level: 1,
  credits: 0,
  earTrainingLevel: 1,
  earTrainingStreak: 0,
  fretboardLevel: 1,
  fretboardStreak: 0,
  geniusLevel: 1,
  geniusStreak: 0,
  pitchStrikeLevel: 1,
  pitchStrikeStreak: 0,
}

function pad3(n: number): string {
  return String(n).padStart(3, '0')
}

function generateDailyQuestBank365(): DailyQuestDefinition[] {
  const bank: DailyQuestDefinition[] = []

  // 365 de prática (segundos)
  for (let i = 0; i < 365; i++) {
    const day = i + 1
    const minutes = 8 + ((i * 7) % 23) // 8..30
    const target = minutes * 60
    const reward = 12 + Math.round(minutes * 2.2) // 30-ish a 80-ish
    bank.push({
      id: `practice_${pad3(day)}`,
      title: `Pratique por ${minutes} min`,
      description:
        'Conta qualquer atividade com rastreamento ativo (desafios, metrônomo, afinador).',
      kind: 'practice_seconds',
      target,
      rewardCredits: reward,
    })
  }

  // 365 de ouvido (acertos)
  for (let i = 0; i < 365; i++) {
    const day = i + 1
    const hits = 6 + ((i * 5) % 30) // 6..35
    const reward = 18 + hits * 2
    bank.push({
      id: `ear_${pad3(day)}`,
      title: `Acerte ${hits} notas no Desafio de Ouvido`,
      description: 'Cada acerto conta (não precisa ser em sequência).',
      kind: 'ear_training_correct',
      target: hits,
      rewardCredits: reward,
    })
  }

  // 365 de metrônomo (segundos)
  for (let i = 0; i < 365; i++) {
    const day = i + 1
    const seconds = 45 + ((i * 11) % 256) // 45..300
    const reward = 16 + Math.round(seconds / 6.5)
    bank.push({
      id: `met_${pad3(day)}`,
      title: `Use o Metrônomo por ${Math.ceil(seconds / 60)} min`,
      description:
        'Ligue o metrônomo nas ferramentas e mantenha ligado até completar.',
      kind: 'metronome_seconds',
      target: seconds,
      rewardCredits: reward,
    })
  }

  return bank
}

const DAILY_QUEST_BANK: DailyQuestDefinition[] = generateDailyQuestBank365()

function initDailyQuestsForToday(params: {
  today: string
  userId: string
  bank: DailyQuestDefinition[]
}): {
  dailyQuestsDate: string
  dailyQuests: DailyQuestProgress[]
  dailyMetronomeSeconds: number
  dailyEarTrainingCorrect: number
} {
  const { today, userId, bank } = params
  const practice = bank.filter((q) => q.kind === 'practice_seconds')
  const ear = bank.filter((q) => q.kind === 'ear_training_correct')
  const met = bank.filter((q) => q.kind === 'metronome_seconds')

  // 3 objetivos no mesmo dia não podem ser semelhantes:
  // sempre 1 de cada tipo. Para "não repetir por 365 dias", indexamos por dia do ano,
  // com um offset determinístico por usuário para variar entre contas.
  const idxBase = dayOfYearLocal(new Date(today))
  const offset = xmur3(userId)() % 365
  const idx = (idxBase + offset) % 365

  const p = practice[idx] ?? practice[0]
  const e = ear[idx] ?? ear[0]
  const m = met[idx] ?? met[0]

  const picks = [p, e, m].filter(Boolean) as DailyQuestDefinition[]
  return {
    dailyQuestsDate: today,
    dailyQuests: picks.map((q) => ({
      questId: q.id,
      progress: 0,
      completed: false,
      claimed: false,
    })),
    dailyMetronomeSeconds: 0,
    dailyEarTrainingCorrect: 0,
  }
}

function clampProgress(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.floor(n))
}

function computeQuestProgress(
  def: DailyQuestDefinition,
  s: Pick<
    Store,
    | 'dailyPracticeTime'
    | 'practiceSessionDate'
    | 'dailyMetronomeSeconds'
    | 'dailyEarTrainingCorrect'
    | 'dailyQuestsDate'
  >,
): number {
  const today = todayKey()
  const sameDay = s.dailyQuestsDate === today
  const practiceBase =
    s.practiceSessionDate === today ? s.dailyPracticeTime : 0
  const metBase = sameDay ? s.dailyMetronomeSeconds : 0
  const earBase = sameDay ? s.dailyEarTrainingCorrect : 0

  if (def.kind === 'practice_seconds') return clampProgress(practiceBase)
  if (def.kind === 'metronome_seconds') return clampProgress(metBase)
  return clampProgress(earBase)
}

function isCompleted(def: DailyQuestDefinition, progress: number): boolean {
  return progress >= def.target
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      session: null,
      authHydrated: false,
      currentTrack: null,
      isPlaying: false,
      globalBpm: 120,
      activeChord: '',
      dailyPracticeTime: 0,
      activeTrackers: [],
      practiceSessionDate: '',
      lastWorkoutDate: '',
      userStats: defaultUserStats,
      purchasedShopItemIds: [],
      equippedItems: { ...defaultEquippedItems },
      inventory: [],
      baseSkinColor: DEFAULT_BASE_SKIN_COLOR,
      dailyAttempts: 3,
      lastAttemptDate: '',
      globalToast: null,
      masterVolume: 1,
      dailyQuestsDate: '',
      dailyQuests: [],
      dailyMetronomeSeconds: 0,
      dailyEarTrainingCorrect: 0,
      dailyQuestBank: DAILY_QUEST_BANK,
      guitarHeroSnapshot: null,
      guitarHeroBestScore: 0,
      setMasterVolume: (value) => {
        const v = Number(value)
        if (!Number.isFinite(v)) return
        set({ masterVolume: Math.min(1, Math.max(0, v)) })
      },
      setSession: (session) => set({ session }),
      clearUserSession: () =>
        set({
          session: null,
          activeTrackers: [],
          dailyPracticeTime: 0,
          practiceSessionDate: '',
          lastWorkoutDate: '',
          userStats: { ...defaultUserStats },
          purchasedShopItemIds: [],
          equippedItems: { ...defaultEquippedItems },
          inventory: [],
          baseSkinColor: DEFAULT_BASE_SKIN_COLOR,
          dailyAttempts: 3,
          lastAttemptDate: '',
          globalToast: null,
          dailyQuestsDate: '',
          dailyQuests: [],
          dailyMetronomeSeconds: 0,
          dailyEarTrainingCorrect: 0,
          guitarHeroSnapshot: null,
          guitarHeroBestScore: 0,
        }),
      setAuthHydrated: (authHydrated) => set({ authHydrated }),
      setCurrentTrack: (currentTrack) => set({ currentTrack }),
      setIsPlaying: (isPlaying) => set({ isPlaying }),
      setGlobalBpm: (globalBpm) => set({ globalBpm }),
      setActiveChord: (activeChord) => set({ activeChord }),
      addPracticeTime: (seconds) =>
        set((s) => {
          const today = todayKey()
          const base =
            s.practiceSessionDate === today ? s.dailyPracticeTime : 0
          const sec = Number(seconds)
          if (!Number.isFinite(sec) || sec <= 0) return {}

          const effectiveUserId = s.session?.user?.id ?? 'anon'
          const needsNewQuests = s.dailyQuestsDate !== today
          const ensured = needsNewQuests
            ? initDailyQuestsForToday({
                today,
                userId: effectiveUserId,
                bank: s.dailyQuestBank,
              })
            : null

          const nextDailyQuestsDate = ensured?.dailyQuestsDate ?? s.dailyQuestsDate
          const nextDailyQuests = ensured?.dailyQuests ?? s.dailyQuests
          const nextMetSecondsBase = ensured?.dailyMetronomeSeconds ?? s.dailyMetronomeSeconds
          const nextEarBase = ensured?.dailyEarTrainingCorrect ?? s.dailyEarTrainingCorrect

          const metDelta = s.activeTrackers.includes('metronome') ? sec : 0
          const nextMetSeconds = nextMetSecondsBase + metDelta

          const computedState = {
            dailyPracticeTime: base + sec,
            practiceSessionDate: today,
            dailyQuestsDate: nextDailyQuestsDate,
            dailyMetronomeSeconds: nextMetSeconds,
            dailyEarTrainingCorrect: nextEarBase,
          } as const

          const bankById = new Map(
            (s.dailyQuestBank ?? []).map((q) => [q.id, q] as const),
          )
          const updatedQuests = nextDailyQuests.map((q) => {
            const def = bankById.get(q.questId)
            if (!def) return q
            const progress = computeQuestProgress(def, computedState as never)
            const completed = isCompleted(def, progress)
            return {
              ...q,
              progress,
              completed,
            }
          })

          return {
            ...computedState,
            dailyQuests: updatedQuests,
          }
        }),
      startTracking: (source) =>
        set((s) => ({
          activeTrackers: s.activeTrackers.includes(source)
            ? s.activeTrackers
            : [...s.activeTrackers, source],
        })),
      stopTracking: (source) =>
        set((s) => ({
          activeTrackers: s.activeTrackers.filter((id) => id !== source),
        })),
      resetPracticeTime: () =>
        set({ dailyPracticeTime: 0, practiceSessionDate: '' }),
      setLastWorkoutDate: (lastWorkoutDate) => set({ lastWorkoutDate }),
      setUserStats: (updater) =>
        set((s) => ({
          userStats:
            typeof updater === 'function' ? updater(s.userStats) : updater,
        })),
      setStreak: (streak) =>
        set((s) => ({
          userStats: { ...s.userStats, streak },
        })),
      updateEarTrainingStreak: (streak) =>
        set((s) => ({
          userStats: { ...s.userStats, earTrainingStreak: streak },
        })),
      levelUpEarTraining: () =>
        set((s) => ({
          userStats: {
            ...s.userStats,
            earTrainingLevel: s.userStats.earTrainingLevel + 1,
          },
        })),
      updateFretboardStreak: (streak) =>
        set((s) => ({
          userStats: { ...s.userStats, fretboardStreak: streak },
        })),
      levelUpFretboard: () =>
        set((s) => ({
          userStats: {
            ...s.userStats,
            fretboardLevel: s.userStats.fretboardLevel + 1,
          },
        })),
      updateGeniusStreak: (streak) =>
        set((s) => ({
          userStats: { ...s.userStats, geniusStreak: streak },
        })),
      levelUpGenius: () =>
        set((s) => ({
          userStats: {
            ...s.userStats,
            geniusLevel: s.userStats.geniusLevel + 1,
          },
        })),
      updatePitchStrikeStreak: (streak) =>
        set((s) => ({
          userStats: { ...s.userStats, pitchStrikeStreak: streak },
        })),
      levelUpPitchStrike: () =>
        set((s) => ({
          userStats: {
            ...s.userStats,
            pitchStrikeLevel: s.userStats.pitchStrikeLevel + 1,
          },
        })),
      addCredits: (amount) =>
        set((s) => {
          if (!Number.isFinite(amount) || amount <= 0) return {}
          return {
            userStats: {
              ...s.userStats,
              credits: s.userStats.credits + amount,
            },
          }
        }),
      spendCredits: (amount) => {
        const s = get()
        if (!Number.isFinite(amount) || amount <= 0) return false
        if (s.userStats.credits < amount) return false
        set({
          userStats: {
            ...s.userStats,
            credits: s.userStats.credits - amount,
          },
        })
        return true
      },
      levelUp: () =>
        set((s) => ({
          userStats: { ...s.userStats, level: s.userStats.level + 1 },
        })),
      markShopItemPurchased: (id) =>
        set((s) =>
          s.purchasedShopItemIds.includes(id)
            ? {}
            : { purchasedShopItemIds: [...s.purchasedShopItemIds, id] },
        ),
      setEquippedItem: (type, itemId) =>
        set((s) => ({
          equippedItems: { ...s.equippedItems, [type]: itemId },
        })),
      setBaseSkinColor: (color) => {
        const c = color.trim()
        if (!c) return
        set({ baseSkinColor: c })
      },
      syncEquippedItemsFromDb: async () => {
        const userId = get().session?.user?.id
        if (!userId) {
          set({ equippedItems: { ...defaultEquippedItems } })
          return
        }
        const { data, error } = await fetchEquippedInventoryRows(userId)
        if (error || !data) {
          console.warn('syncEquippedItemsFromDb', error?.message)
          return
        }
        const next: EquippedItems = { ...defaultEquippedItems }
        for (const row of data) {
          const slot = shopTypeToEquippedSlot(row.type)
          if (slot) next[slot] = row.item_id
        }
        set({ equippedItems: next })
      },
      syncInventoryFromDb: async () => {
        const userId = get().session?.user?.id
        if (!userId) {
          set({ inventory: [], purchasedShopItemIds: [] })
          return
        }
        const { data, error } = await fetchUserInventoryWithTypes(userId)
        if (error || !data) {
          console.warn('syncInventoryFromDb', error?.message)
          return
        }
        set({
          inventory: data,
          purchasedShopItemIds: Array.from(new Set(data.map((row) => row.item_id))),
        })
      },
      syncProfileEconomyFromDb: async () => {
        const userId = get().session?.user?.id
        if (!userId) {
          set((s) => ({
            userStats: {
              ...s.userStats,
              level: defaultUserStats.level,
              credits: defaultUserStats.credits,
            },
          }))
          return
        }
        const { data, error } = await fetchProfileEconomy(userId)
        if (error || !data) {
          console.warn('syncProfileEconomyFromDb', error?.message)
          return
        }
        const level =
          typeof data.level === 'number' && Number.isFinite(data.level)
            ? Math.max(1, Math.floor(data.level))
            : defaultUserStats.level
        const credits =
          typeof data.credits === 'number' && Number.isFinite(data.credits)
            ? Math.max(0, Math.floor(data.credits))
            : defaultUserStats.credits

        set((s) => ({
          userStats: {
            ...s.userStats,
            level,
            credits,
          },
        }))
      },
      consumeItemLocally: (type) => {
        const t = type.trim().toLowerCase()
        set((s) => {
          const idx = s.inventory.findIndex(
            (i) => i.type.trim().toLowerCase() === t && i.quantity > 0,
          )
          if (idx === -1) return {}
          const next = [...s.inventory]
          const row = next[idx]
          const q = row.quantity - 1
          if (q <= 0) next.splice(idx, 1)
          else next[idx] = { ...row, quantity: q }
          return { inventory: next }
        })
      },
      addInventoryQuantityLocally: (itemId, type, delta) => {
        if (!Number.isFinite(delta) || delta === 0) return
        set((s) => {
          const idx = s.inventory.findIndex((i) => i.item_id === itemId)
          if (idx === -1) {
            if (delta < 0) return {}
            return {
              inventory: [
                ...s.inventory,
                { item_id: itemId, type, quantity: delta },
              ],
            }
          }
          const next = [...s.inventory]
          const row = next[idx]
          const q = row.quantity + delta
          if (q <= 0) next.splice(idx, 1)
          else next[idx] = { ...row, quantity: q }
          return { inventory: next }
        })
      },
      useAttempt: () => {
        const s = get()
        const today = new Date().toDateString()
        let attempts = s.dailyAttempts
        if (s.lastAttemptDate !== today) {
          attempts = 3
        }
        if (attempts <= 0) return false
        set({
          dailyAttempts: attempts - 1,
          lastAttemptDate: today,
        })
        return true
      },
      showGlobalToast: (message, durationMs = 4200) => {
        const text = message.trim()
        if (!text) return
        set({ globalToast: text })
        window.setTimeout(() => {
          const cur = useStore.getState().globalToast
          if (cur === text) set({ globalToast: null })
        }, durationMs)
      },
      clearGlobalToast: () => set({ globalToast: null }),
      ensureDailyQuests: () =>
        set((s) => {
          const today = todayKey()
          const userId = s.session?.user?.id ?? 'anon'
          if (s.dailyQuestsDate === today && s.dailyQuests.length === 3) {
            return {}
          }
          return initDailyQuestsForToday({
            today,
            userId,
            bank: s.dailyQuestBank,
          })
        }),
      recordDailyEarTrainingCorrect: (delta = 1) =>
        set((s) => {
          const today = todayKey()
          const d = Number(delta)
          if (!Number.isFinite(d) || d <= 0) return {}

          const userId = s.session?.user?.id ?? 'anon'
          const needsNewQuests = s.dailyQuestsDate !== today
          const ensured = needsNewQuests
            ? initDailyQuestsForToday({
                today,
                userId,
                bank: s.dailyQuestBank,
              })
            : null

          const nextDailyQuestsDate = ensured?.dailyQuestsDate ?? s.dailyQuestsDate
          const nextDailyQuests = ensured?.dailyQuests ?? s.dailyQuests
          const nextMetSeconds = ensured?.dailyMetronomeSeconds ?? s.dailyMetronomeSeconds
          const nextEar = (ensured?.dailyEarTrainingCorrect ?? s.dailyEarTrainingCorrect) + d

          const computedState = {
            dailyPracticeTime:
              s.practiceSessionDate === today ? s.dailyPracticeTime : 0,
            practiceSessionDate: s.practiceSessionDate,
            dailyQuestsDate: nextDailyQuestsDate,
            dailyMetronomeSeconds: nextMetSeconds,
            dailyEarTrainingCorrect: nextEar,
          } as const

          const bankById = new Map(
            (s.dailyQuestBank ?? []).map((q) => [q.id, q] as const),
          )
          const updatedQuests = nextDailyQuests.map((q) => {
            const def = bankById.get(q.questId)
            if (!def) return q
            const progress = computeQuestProgress(def, computedState as never)
            const completed = isCompleted(def, progress)
            return {
              ...q,
              progress,
              completed,
            }
          })

          return {
            dailyQuestsDate: nextDailyQuestsDate,
            dailyQuests: updatedQuests,
            dailyMetronomeSeconds: nextMetSeconds,
            dailyEarTrainingCorrect: nextEar,
          }
        }),
      claimDailyQuest: (questId) => {
        const id = questId.trim()
        if (!id) return false

        const s = get()
        const def = (s.dailyQuestBank ?? []).find((q) => q.id === id)
        if (!def) return false

        let didClaim = false
        set((cur) => {
          const idx = cur.dailyQuests.findIndex((q) => q.questId === id)
          if (idx === -1) return {}
          const q = cur.dailyQuests[idx]
          if (!q.completed || q.claimed) return {}
          const next = [...cur.dailyQuests]
          next[idx] = { ...q, claimed: true }
          didClaim = true
          return { dailyQuests: next }
        })

        if (!didClaim) return false
        get().addCredits(def.rewardCredits)
        return true
      },
      setGuitarHeroSnapshot: (snapshot) => set({ guitarHeroSnapshot: snapshot }),
      commitGuitarHeroRun: (snapshot) =>
        set((s) => ({
          guitarHeroSnapshot: snapshot,
          guitarHeroBestScore: Math.max(s.guitarHeroBestScore, snapshot.score),
        })),
    }),
    {
      name: 'guitar-app-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        userStats: state.userStats,
        dailyPracticeTime: state.dailyPracticeTime,
        practiceSessionDate: state.practiceSessionDate,
        lastWorkoutDate: state.lastWorkoutDate,
        purchasedShopItemIds: state.purchasedShopItemIds,
        equippedItems: state.equippedItems,
        inventory: state.inventory,
        baseSkinColor: state.baseSkinColor,
        dailyAttempts: state.dailyAttempts,
        lastAttemptDate: state.lastAttemptDate,
        masterVolume: state.masterVolume,
        dailyQuestsDate: state.dailyQuestsDate,
        dailyQuests: state.dailyQuests,
        dailyMetronomeSeconds: state.dailyMetronomeSeconds,
        dailyEarTrainingCorrect: state.dailyEarTrainingCorrect,
        guitarHeroBestScore: state.guitarHeroBestScore,
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<Store> | undefined
        if (!p) return current
        return {
          ...current,
          ...p,
          userStats: { ...defaultUserStats, ...(p.userStats ?? {}) },
          purchasedShopItemIds: Array.isArray(p.purchasedShopItemIds)
            ? p.purchasedShopItemIds
            : current.purchasedShopItemIds,
          equippedItems: p.equippedItems
            ? { ...defaultEquippedItems, ...p.equippedItems }
            : current.equippedItems,
          inventory: Array.isArray(p.inventory)
            ? p.inventory
            : current.inventory,
          baseSkinColor:
            typeof p.baseSkinColor === 'string' && p.baseSkinColor.trim()
              ? p.baseSkinColor.trim()
              : current.baseSkinColor,
          dailyAttempts:
            typeof p.dailyAttempts === 'number'
              ? p.dailyAttempts
              : current.dailyAttempts,
          lastAttemptDate:
            typeof p.lastAttemptDate === 'string'
              ? p.lastAttemptDate
              : current.lastAttemptDate,
          masterVolume:
            typeof p.masterVolume === 'number' &&
            p.masterVolume >= 0 &&
            p.masterVolume <= 1
              ? p.masterVolume
              : current.masterVolume,
          dailyQuestsDate:
            typeof p.dailyQuestsDate === 'string'
              ? p.dailyQuestsDate
              : current.dailyQuestsDate,
          dailyQuests: Array.isArray(p.dailyQuests)
            ? p.dailyQuests
            : current.dailyQuests,
          dailyMetronomeSeconds:
            typeof p.dailyMetronomeSeconds === 'number'
              ? p.dailyMetronomeSeconds
              : current.dailyMetronomeSeconds,
          dailyEarTrainingCorrect:
            typeof p.dailyEarTrainingCorrect === 'number'
              ? p.dailyEarTrainingCorrect
              : current.dailyEarTrainingCorrect,
          guitarHeroBestScore:
            typeof p.guitarHeroBestScore === 'number' &&
            Number.isFinite(p.guitarHeroBestScore)
              ? Math.max(0, Math.floor(p.guitarHeroBestScore))
              : current.guitarHeroBestScore,
          guitarHeroSnapshot: current.guitarHeroSnapshot,
        }
      },
    },
  ),
)
