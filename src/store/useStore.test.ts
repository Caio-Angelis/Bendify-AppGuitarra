import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

vi.mock('../utils/supabase', () => ({
  fetchEquippedInventoryRows: vi.fn(),
  fetchUserInventoryWithTypes: vi.fn(),
}))

import {
  fetchEquippedInventoryRows,
  fetchUserInventoryWithTypes,
} from '../utils/supabase'
import type { UserStats } from './useStore'
import { DEFAULT_BASE_SKIN_COLOR, useStore } from './useStore'

const freshUserStats = (): UserStats => ({
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
})

/** Espelha `Dashboard.tsx` — diferença em dias civis (UTC date parts). */
function calendarDaysBetweenLastWorkoutAndToday(
  lastWorkout: string,
  todayStr: string,
): number {
  const d1 = new Date(lastWorkout)
  const d2 = new Date(todayStr)
  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return 0
  const utc1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate())
  const utc2 = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate())
  return Math.round((utc2 - utc1) / 86400000)
}

/**
 * Regra do Escudo de Ofensiva (Dashboard): com gap > 1 dia e streak > 0,
 * ou consome 1 `consumable` no inventário ou zera o streak no servidor (aqui: setStreak(0)).
 */
function resolveStreakGapAction(params: {
  gapDays: number
  streak: number
  hasConsumable: boolean
}): 'none' | 'consume_shield' | 'reset_streak' {
  const { gapDays, streak, hasConsumable } = params
  if (gapDays <= 1) return 'none'
  if (streak <= 0) return 'none'
  return hasConsumable ? 'consume_shield' : 'reset_streak'
}

/** Espelha `EarTraining.tsx`: após acerto, streak +1 e level up se múltiplo de 5. */
function onEarTrainingCorrectGuess(prevStreak: number) {
  const newStreak = prevStreak + 1
  useStore.getState().updateEarTrainingStreak(newStreak)
  if (newStreak > 0 && newStreak % 5 === 0) {
    useStore.getState().levelUpEarTraining()
  }
}

function resetStore() {
  localStorage.clear()
  useStore.setState({
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
    userStats: freshUserStats(),
    purchasedShopItemIds: [],
    equippedItems: { guitar: null, clothes: null, character: null },
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
  })
  vi.mocked(fetchEquippedInventoryRows).mockReset()
  vi.mocked(fetchUserInventoryWithTypes).mockReset()
}

async function flushPersistWrite() {
  // Persist middleware writes to storage asynchronously (microtask-ish).
  await Promise.resolve()
}

describe('useStore — ear training', () => {
  beforeEach(() => {
    resetStore()
  })

  it('atualiza earTrainingStreak quando updateEarTrainingStreak é chamado', () => {
    useStore.getState().updateEarTrainingStreak(7)
    expect(useStore.getState().userStats.earTrainingStreak).toBe(7)
  })

  it('levelUpEarTraining incrementa earTrainingLevel em +1', () => {
    useStore.setState((s) => ({
      userStats: { ...s.userStats, earTrainingLevel: 3 },
    }))
    useStore.getState().levelUpEarTraining()
    expect(useStore.getState().userStats.earTrainingLevel).toBe(4)
  })

  it('sobe de nível automaticamente quando o streak após acerto chega a 5', () => {
    useStore.setState((s) => ({
      userStats: {
        ...s.userStats,
        earTrainingStreak: 4,
        earTrainingLevel: 1,
      },
    }))

    onEarTrainingCorrectGuess(4)

    const { earTrainingStreak, earTrainingLevel } =
      useStore.getState().userStats
    expect(earTrainingStreak).toBe(5)
    expect(earTrainingLevel).toBe(2)
  })
})

describe('useStore — economia (créditos / nível)', () => {
  beforeEach(() => {
    resetStore()
  })

  it('addCredits soma ao saldo quando amount > 0', () => {
    useStore.getState().addCredits(50)
    expect(useStore.getState().userStats.credits).toBe(50)
    useStore.getState().addCredits(10)
    expect(useStore.getState().userStats.credits).toBe(60)
  })

  it('addCredits ignora zero, negativos e não finitos', () => {
    useStore.getState().addCredits(100)
    useStore.getState().addCredits(0)
    useStore.getState().addCredits(-10)
    useStore.getState().addCredits(NaN)
    useStore.getState().addCredits(Number.POSITIVE_INFINITY)
    expect(useStore.getState().userStats.credits).toBe(100)
  })

  it('spendCredits debita e devolve true quando há saldo', () => {
    useStore.getState().addCredits(100)
    const ok = useStore.getState().spendCredits(40)
    expect(ok).toBe(true)
    expect(useStore.getState().userStats.credits).toBe(60)
  })

  it('spendCredits com valor exato zera o saldo e devolve true', () => {
    useStore.getState().addCredits(25)
    expect(useStore.getState().spendCredits(25)).toBe(true)
    expect(useStore.getState().userStats.credits).toBe(0)
  })

  it('spendCredits devolve false sem alterar saldo quando insuficiente (incl. saldo 0)', () => {
    expect(useStore.getState().spendCredits(1)).toBe(false)
    useStore.getState().addCredits(10)
    const ok = useStore.getState().spendCredits(20)
    expect(ok).toBe(false)
    expect(useStore.getState().userStats.credits).toBe(10)
  })

  it('spendCredits devolve false para amount inválido e não altera saldo', () => {
    useStore.getState().addCredits(50)
    expect(useStore.getState().spendCredits(0)).toBe(false)
    expect(useStore.getState().spendCredits(-5)).toBe(false)
    expect(useStore.getState().spendCredits(NaN)).toBe(false)
    expect(useStore.getState().userStats.credits).toBe(50)
  })

  it('spendCredits não permite saldo negativo nem “gastar” com NaN/Infinity', () => {
    useStore.setState((s) => ({
      userStats: { ...s.userStats, credits: 1 },
    }))
    expect(useStore.getState().spendCredits(2)).toBe(false)
    expect(useStore.getState().userStats.credits).toBe(1)
    expect(useStore.getState().spendCredits(Number.POSITIVE_INFINITY)).toBe(
      false,
    )
    expect(useStore.getState().userStats.credits).toBe(1)
  })

  it('levelUp incrementa userStats.level em +1', () => {
    useStore.getState().levelUp()
    expect(useStore.getState().userStats.level).toBe(2)
  })
})

describe('useStore — Escudo de Ofensiva (gap de dias + inventário)', () => {
  beforeEach(() => {
    resetStore()
  })

  it('gap 0 (mesmo dia civil): não exige escudo nem reset', () => {
    expect(
      resolveStreakGapAction({
        gapDays: 0,
        streak: 10,
        hasConsumable: false,
      }),
    ).toBe('none')
  })

  it('gap 1 (dia civil seguinte): sequência considerada “salva” sem consumir', () => {
    expect(
      resolveStreakGapAction({
        gapDays: 1,
        streak: 10,
        hasConsumable: false,
      }),
    ).toBe('none')
  })

  it('gap ≥2 com streak > 0 e sem consumível: reset de streak (comportamento Dashboard)', () => {
    expect(
      resolveStreakGapAction({
        gapDays: 2,
        streak: 5,
        hasConsumable: false,
      }),
    ).toBe('reset_streak')
  })

  it('gap ≥2 com streak > 0 e com Escudo (tipo consumable): consome escudo em vez de reset', () => {
    expect(
      resolveStreakGapAction({
        gapDays: 3,
        streak: 7,
        hasConsumable: true,
      }),
    ).toBe('consume_shield')
  })

  it('gap grande mas streak 0: não faz nada (nada a proteger)', () => {
    expect(
      resolveStreakGapAction({
        gapDays: 10,
        streak: 0,
        hasConsumable: true,
      }),
    ).toBe('none')
  })

  it('calendarDaysBetweenLastWorkoutAndToday: datas inválidas → 0', () => {
    expect(
      calendarDaysBetweenLastWorkoutAndToday('invalid', 'Mon Jan 01 2024'),
    ).toBe(0)
  })

  it('calendarDaysBetweenLastWorkoutAndToday: diferença exata em dias civis', () => {
    const a = 'Mon Jan 15 2024'
    const b = 'Wed Jan 17 2024'
    expect(calendarDaysBetweenLastWorkoutAndToday(a, b)).toBe(2)
    expect(calendarDaysBetweenLastWorkoutAndToday(b, a)).toBe(-2)
  })

  it('consumeItemLocalmente remove 1 consumable (tipo case-insensitive) — fluxo pós-DB', () => {
    useStore.setState({
      inventory: [
        { item_id: 'shield-1', quantity: 2, type: 'consumable' },
      ],
    })
    useStore.getState().consumeItemLocally('consumable')
    expect(useStore.getState().inventory).toEqual([
      { item_id: 'shield-1', quantity: 1, type: 'consumable' },
    ])
    useStore.getState().consumeItemLocally('  CONSUMABLE ')
    expect(useStore.getState().inventory).toEqual([])
  })

  it('consumeItemLocally escolhe o primeiro item com type match e quantity > 0', () => {
    useStore.setState({
      inventory: [
        { item_id: 'a', quantity: 0, type: 'consumable' },
        { item_id: 'b', quantity: 1, type: 'consumable' },
      ],
    })
    useStore.getState().consumeItemLocally('consumable')
    expect(useStore.getState().inventory).toEqual([
      { item_id: 'a', quantity: 0, type: 'consumable' },
    ])
  })

  it('consumeItemLocally não altera quando não existe item compatível', () => {
    useStore.setState({
      inventory: [
        { item_id: 'x', quantity: 1, type: 'other' },
        { item_id: 'y', quantity: 0, type: 'consumable' },
      ],
    })
    useStore.getState().consumeItemLocally('consumable')
    expect(useStore.getState().inventory).toEqual([
      { item_id: 'x', quantity: 1, type: 'other' },
      { item_id: 'y', quantity: 0, type: 'consumable' },
    ])
  })

  it('simula reset de streak quando não há escudo (setStreak(0))', () => {
    useStore.setState({
      userStats: { ...freshUserStats(), streak: 8 },
    })
    useStore.getState().setStreak(0)
    expect(useStore.getState().userStats.streak).toBe(0)
  })
})

describe('useStore — Scale Runner (tentativas diárias)', () => {
  beforeEach(() => {
    resetStore()
  })

  it('useAttempt consome 1 tentativa e fixa lastAttemptDate no dia civil', () => {
    const before = new Date().toDateString()
    const ok = useStore.getState().useAttempt()
    expect(ok).toBe(true)
    expect(useStore.getState().dailyAttempts).toBe(2)
    expect(useStore.getState().lastAttemptDate).toBe(before)
  })

  it('useAttempt devolve false e não altera quando não há tentativas no mesmo dia', () => {
    useStore.setState({
      dailyAttempts: 0,
      lastAttemptDate: new Date().toDateString(),
    })
    const ok = useStore.getState().useAttempt()
    expect(ok).toBe(false)
    expect(useStore.getState().dailyAttempts).toBe(0)
  })

  it('useAttempt repõe 3 tentativas quando lastAttemptDate é de outro dia', () => {
    useStore.setState({
      dailyAttempts: 0,
      lastAttemptDate: 'Sun Jan 01 1990',
    })
    const ok = useStore.getState().useAttempt()
    expect(ok).toBe(true)
    expect(useStore.getState().dailyAttempts).toBe(2)
    expect(useStore.getState().lastAttemptDate).toBe(new Date().toDateString())
  })

  it('useAttempt após mudança de dia ignora dailyAttempts=0 do dia anterior', () => {
    useStore.setState({
      dailyAttempts: 0,
      lastAttemptDate: 'Wed Apr 01 2020',
    })
    expect(useStore.getState().useAttempt()).toBe(true)
    expect(useStore.getState().dailyAttempts).toBe(2)
  })

  it('useAttempt com lastAttemptDate vazio trata como “novo dia” e repõe 3', () => {
    useStore.setState({ dailyAttempts: 0, lastAttemptDate: '' })
    expect(useStore.getState().useAttempt()).toBe(true)
    expect(useStore.getState().dailyAttempts).toBe(2)
    expect(useStore.getState().lastAttemptDate).toBe(new Date().toDateString())
  })
})

describe('useStore — inventário local', () => {
  beforeEach(() => {
    resetStore()
  })

  it('addInventoryQuantityLocally cria linha quando item é novo e delta > 0', () => {
    useStore.getState().addInventoryQuantityLocally('x', 'consumable', 3)
    expect(useStore.getState().inventory).toEqual([
      { item_id: 'x', type: 'consumable', quantity: 3 },
    ])
  })

  it('addInventoryQuantityLocally ignora delta 0 e não finitos', () => {
    useStore.getState().addInventoryQuantityLocally('x', 't', 5)
    useStore.getState().addInventoryQuantityLocally('x', 't', 0)
    useStore.getState().addInventoryQuantityLocally('x', 't', NaN)
    expect(useStore.getState().inventory[0].quantity).toBe(5)
  })

  it('addInventoryQuantityLocally com delta negativo remove linha se quantity ≤ 0', () => {
    useStore.getState().addInventoryQuantityLocally('x', 'consumable', 1)
    useStore.getState().addInventoryQuantityLocally('x', 'consumable', -1)
    expect(useStore.getState().inventory).toEqual([])
  })

  it('addInventoryQuantityLocally não cria linha nova com delta negativo se item não existe', () => {
    useStore.getState().addInventoryQuantityLocally('missing', 'consumable', -1)
    expect(useStore.getState().inventory).toEqual([])
  })

  it('addInventoryQuantityLocally atualiza quantity em item existente e remove se ficar ≤ 0', () => {
    useStore.getState().addInventoryQuantityLocally('x', 'consumable', 2)
    useStore.getState().addInventoryQuantityLocally('x', 'consumable', 5)
    expect(useStore.getState().inventory).toEqual([
      { item_id: 'x', type: 'consumable', quantity: 7 },
    ])
    useStore.getState().addInventoryQuantityLocally('x', 'consumable', -10)
    expect(useStore.getState().inventory).toEqual([])
  })
})

describe('useStore — sync Supabase (mocks)', () => {
  beforeEach(() => {
    resetStore()
  })

  it('syncEquippedItemsFromDb sem sessão repõe equipamento default', async () => {
    useStore.setState({
      equippedItems: { guitar: 'g1', clothes: null, character: null },
    })
    await useStore.getState().syncEquippedItemsFromDb()
    expect(useStore.getState().equippedItems).toEqual({
      guitar: null,
      clothes: null,
      character: null,
    })
    expect(fetchEquippedInventoryRows).not.toHaveBeenCalled()
  })

  it('syncEquippedItemsFromDb com dados mapeia tipos para slots', async () => {
    useStore.setState({
      session: { user: { id: 'u1' } } as never,
    })
    vi.mocked(fetchEquippedInventoryRows).mockResolvedValue({
      data: [
        { item_id: 'git', type: 'instrumento' },
        { item_id: 'shirt', type: 'vestuário' },
      ],
      error: null,
    })
    await useStore.getState().syncEquippedItemsFromDb()
    expect(useStore.getState().equippedItems).toEqual({
      guitar: 'git',
      clothes: 'shirt',
      character: null,
    })
  })

  it('syncEquippedItemsFromDb em erro não altera estado', async () => {
    useStore.setState({
      session: { user: { id: 'u1' } } as never,
      equippedItems: { guitar: 'keep', clothes: null, character: null },
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(fetchEquippedInventoryRows).mockResolvedValue({
      data: null,
      error: new Error('network'),
    })
    await useStore.getState().syncEquippedItemsFromDb()
    expect(useStore.getState().equippedItems.guitar).toBe('keep')
    warn.mockRestore()
  })

  it('syncInventoryFromDb sem utilizador limpa inventário', async () => {
    useStore.setState({
      inventory: [{ item_id: 'a', quantity: 1, type: 'consumable' }],
    })
    await useStore.getState().syncInventoryFromDb()
    expect(useStore.getState().inventory).toEqual([])
  })

  it('syncInventoryFromDb substitui inventário com dados do mock', async () => {
    useStore.setState({
      session: { user: { id: 'u1' } } as never,
    })
    const rows = [{ item_id: 's', quantity: 2, type: 'consumable' }]
    vi.mocked(fetchUserInventoryWithTypes).mockResolvedValue({
      data: rows,
      error: null,
    })
    await useStore.getState().syncInventoryFromDb()
    expect(useStore.getState().inventory).toEqual(rows)
  })
})

describe('useStore — sessão e restauro', () => {
  beforeEach(() => {
    resetStore()
  })

  it('clearUserSession repõe estado sensível e créditos', () => {
    useStore.setState({
      session: { user: { id: 'x' } } as never,
      userStats: { ...freshUserStats(), credits: 999, streak: 12 },
      purchasedShopItemIds: ['a'],
      lastWorkoutDate: 'Mon Jan 01 2024',
    })
    useStore.getState().clearUserSession()
    expect(useStore.getState().session).toBeNull()
    expect(useStore.getState().userStats.credits).toBe(0)
    expect(useStore.getState().purchasedShopItemIds).toEqual([])
  })

  it('clearUserSession zera streak global, streaks de minijogos e inventário', () => {
    useStore.setState({
      session: { user: { id: 'x' } } as never,
      userStats: {
        ...freshUserStats(),
        streak: 30,
        earTrainingStreak: 9,
        fretboardStreak: 4,
        geniusStreak: 2,
        pitchStrikeStreak: 11,
      },
      inventory: [{ item_id: 's', quantity: 1, type: 'consumable' }],
      lastWorkoutDate: 'Tue Jan 02 2024',
    })
    useStore.getState().clearUserSession()
    const u = useStore.getState().userStats
    expect(u.streak).toBe(0)
    expect(u.earTrainingStreak).toBe(0)
    expect(u.fretboardStreak).toBe(0)
    expect(u.geniusStreak).toBe(0)
    expect(u.pitchStrikeStreak).toBe(0)
    expect(useStore.getState().inventory).toEqual([])
    expect(useStore.getState().lastWorkoutDate).toBe('')
  })

  it('setStreak aceita valores positivos (sem clamp no store)', () => {
    useStore.getState().setStreak(100)
    expect(useStore.getState().userStats.streak).toBe(100)
  })

  it('setUserStats com função preserva campos não alterados (evita “apagar” progresso)', () => {
    useStore.setState({
      userStats: { ...freshUserStats(), credits: 80, streak: 5 },
    })
    useStore.getState().setUserStats((prev) => ({ ...prev, streak: 6 }))
    const u = useStore.getState().userStats
    expect(u.credits).toBe(80)
    expect(u.streak).toBe(6)
  })

  it('setUserStats com objeto substitui o objeto inteiro (obrigatório spread de prev se não for o caso)', () => {
    useStore.setState({
      userStats: { ...freshUserStats(), credits: 50 },
    })
    useStore.getState().setUserStats({ ...freshUserStats(), streak: 1 })
    expect(useStore.getState().userStats.credits).toBe(0)
    expect(useStore.getState().userStats.streak).toBe(1)
  })

  it('setSession guarda sessão; clearUserSession volta a null', () => {
    const fake = { user: { id: 'u1' } } as never
    useStore.getState().setSession(fake)
    expect(useStore.getState().session).toBe(fake)
    useStore.getState().clearUserSession()
    expect(useStore.getState().session).toBeNull()
  })

  it('setLastWorkoutDate persiste string (usado para gap de dias / ofensiva)', () => {
    useStore.getState().setLastWorkoutDate('Wed Apr 16 2026')
    expect(useStore.getState().lastWorkoutDate).toBe('Wed Apr 16 2026')
  })

  it('resetPracticeTime zera tempo e data de sessão de prática', () => {
    useStore.setState({
      dailyPracticeTime: 120,
      practiceSessionDate: new Date().toDateString(),
    })
    useStore.getState().resetPracticeTime()
    expect(useStore.getState().dailyPracticeTime).toBe(0)
    expect(useStore.getState().practiceSessionDate).toBe('')
  })

  it('setBaseSkinColor ignora string só com espaços', () => {
    useStore.getState().setBaseSkinColor('   ')
    expect(useStore.getState().baseSkinColor).toBe(DEFAULT_BASE_SKIN_COLOR)
  })

  it('setBaseSkinColor aceita HEX após trim', () => {
    useStore.getState().setBaseSkinColor('  #ff00aa ')
    expect(useStore.getState().baseSkinColor).toBe('#ff00aa')
  })

  it('setMasterVolume ignora não finito e limita a [0,1]', () => {
    useStore.getState().setMasterVolume(Number.NaN)
    expect(useStore.getState().masterVolume).toBe(1)
    useStore.getState().setMasterVolume(2)
    expect(useStore.getState().masterVolume).toBe(1)
    useStore.getState().setMasterVolume(-1)
    expect(useStore.getState().masterVolume).toBe(0)
  })
})

describe('useStore — prática e trackers', () => {
  beforeEach(() => {
    resetStore()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('addPracticeTime acumula no mesmo dia civil', () => {
    const today = new Date().toDateString()
    useStore.getState().addPracticeTime(10)
    useStore.getState().addPracticeTime(20)
    expect(useStore.getState().dailyPracticeTime).toBe(30)
    expect(useStore.getState().practiceSessionDate).toBe(today)
  })

  it('addPracticeTime repõe base a 0 quando muda o dia civil', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-10T12:00:00'))
    useStore.getState().addPracticeTime(100)
    expect(useStore.getState().dailyPracticeTime).toBe(100)
    vi.setSystemTime(new Date('2026-06-11T12:00:00'))
    useStore.getState().addPracticeTime(5)
    expect(useStore.getState().dailyPracticeTime).toBe(5)
    expect(useStore.getState().practiceSessionDate).toBe(
      new Date('2026-06-11T12:00:00').toDateString(),
    )
  })

  it('startTracking não duplica fonte', () => {
    useStore.getState().startTracking('a')
    useStore.getState().startTracking('a')
    expect(useStore.getState().activeTrackers).toEqual(['a'])
  })

  it('stopTracking remove apenas a fonte pedida', () => {
    useStore.setState({ activeTrackers: ['a', 'b'] })
    useStore.getState().stopTracking('a')
    expect(useStore.getState().activeTrackers).toEqual(['b'])
  })

  it('showGlobalToast com mensagem vazia não define toast', () => {
    useStore.getState().showGlobalToast('   ')
    expect(useStore.getState().globalToast).toBeNull()
  })

  it('showGlobalToast limpa após durationMs (timers falsos)', () => {
    vi.useFakeTimers()
    useStore.getState().showGlobalToast('ok', 1000)
    expect(useStore.getState().globalToast).toBe('ok')
    vi.advanceTimersByTime(1000)
    expect(useStore.getState().globalToast).toBeNull()
  })

  it('showGlobalToast não limpa toast “novo” pelo timeout do toast anterior', () => {
    vi.useFakeTimers()
    useStore.getState().showGlobalToast('primeiro', 1000)
    expect(useStore.getState().globalToast).toBe('primeiro')
    vi.advanceTimersByTime(500)

    useStore.getState().showGlobalToast('segundo', 1000)
    expect(useStore.getState().globalToast).toBe('segundo')

    // O timeout do primeiro dispara agora, mas não deve limpar o segundo.
    vi.advanceTimersByTime(500)
    expect(useStore.getState().globalToast).toBe('segundo')

    // Agora o segundo expira.
    vi.advanceTimersByTime(500)
    expect(useStore.getState().globalToast).toBeNull()
  })

  it('clearGlobalToast força null', () => {
    useStore.setState({ globalToast: 'x' })
    useStore.getState().clearGlobalToast()
    expect(useStore.getState().globalToast).toBeNull()
  })
})

describe('useStore — persist (partialize + merge)', () => {
  beforeEach(() => {
    resetStore()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('partialize não persiste session/authHydrated nem campos não listados', async () => {
    useStore.setState({
      session: { user: { id: 'u1' } } as never,
      authHydrated: true,
      currentTrack: { title: 't', style: 's', bpm: 1, key: 'C', audio_path: 'x', chords: [] },
      isPlaying: true,
      globalBpm: 200,
      activeChord: 'Am',
    } as never)
    useStore.getState().addCredits(10)
    await flushPersistWrite()

    const raw = localStorage.getItem('guitar-app-storage')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!)
    const state = parsed?.state ?? {}
    expect(state.session).toBeUndefined()
    expect(state.authHydrated).toBeUndefined()
    expect(state.currentTrack).toBeUndefined()
    expect(state.isPlaying).toBeUndefined()
    expect(state.globalBpm).toBeUndefined()
    expect(state.activeChord).toBeUndefined()
    expect(state.userStats?.credits).toBe(10)
  })

  it('merge preenche campos novos em userStats quando persisted está incompleto', async () => {
    // Simula storage antigo: só tinha streak/credits e nenhum dos campos de minijogos.
    localStorage.setItem(
      'guitar-app-storage',
      JSON.stringify({
        version: 0,
        state: {
          userStats: { streak: 9, credits: 123 },
        },
      }),
    )

    await useStore.persist.rehydrate()

    const st = useStore.getState().userStats
    expect(st.streak).toBe(9)
    expect(st.credits).toBe(123)
    // Defaults presentes (garante compatibilidade).
    expect(st.earTrainingLevel).toBe(1)
    expect(st.earTrainingStreak).toBe(0)
    expect(st.fretboardLevel).toBe(1)
    expect(st.fretboardStreak).toBe(0)
    expect(st.geniusLevel).toBe(1)
    expect(st.geniusStreak).toBe(0)
    expect(st.pitchStrikeLevel).toBe(1)
    expect(st.pitchStrikeStreak).toBe(0)
    // Mantém maxBpm default (não estava no persisted).
    expect(st.maxBpm).toBe(0)
  })

  it('merge normaliza baseSkinColor (trim) e masterVolume (range)', async () => {
    localStorage.setItem(
      'guitar-app-storage',
      JSON.stringify({
        version: 0,
        state: {
          baseSkinColor: '  #abc123  ',
          masterVolume: 2,
        },
      }),
    )

    await useStore.persist.rehydrate()
    expect(useStore.getState().baseSkinColor).toBe('#abc123')
    // masterVolume fora do range deve cair no current default (1).
    expect(useStore.getState().masterVolume).toBe(1)
  })

  it('merge protege purchasedShopItemIds/inventory contra tipos inválidos', async () => {
    localStorage.setItem(
      'guitar-app-storage',
      JSON.stringify({
        version: 0,
        state: {
          purchasedShopItemIds: 'not-array',
          inventory: 'not-array',
        },
      }),
    )

    await useStore.persist.rehydrate()
    expect(Array.isArray(useStore.getState().purchasedShopItemIds)).toBe(true)
    expect(Array.isArray(useStore.getState().inventory)).toBe(true)
  })
})

describe('useStore — missões diárias (Daily Quests)', () => {
  beforeEach(() => {
    resetStore()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('ensureDailyQuests cria 3 missões para o dia civil (idempotente)', () => {
    useStore.getState().ensureDailyQuests()
    const a = useStore.getState().dailyQuests
    expect(a).toHaveLength(3)
    useStore.getState().ensureDailyQuests()
    const b = useStore.getState().dailyQuests
    expect(b).toHaveLength(3)
    // Mantém os mesmos IDs no mesmo dia.
    expect(b.map((q) => q.questId)).toEqual(a.map((q) => q.questId))
  })

  it('as 3 missões do dia são de tipos diferentes (não semelhantes)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T12:00:00'))
    useStore.setState({ session: { user: { id: 'u1' } } as never })
    useStore.getState().ensureDailyQuests()
    const bank = useStore.getState().dailyQuestBank
    const defs = useStore
      .getState()
      .dailyQuests.map((q) => bank.find((b) => b.id === q.questId)!)
    const kinds = defs.map((d) => d.kind)
    expect(new Set(kinds).size).toBe(3)
  })

  it('progresso de prática atualiza via addPracticeTime e completa quando atinge o alvo', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T12:00:00'))
    useStore.setState({ session: { user: { id: 'u1' } } as never })
    useStore.getState().ensureDailyQuests()
    // Força uma missão de prática no slot 0 para o teste.
    const bank = useStore.getState().dailyQuestBank
    const practice = bank.find((q) => q.kind === 'practice_seconds')!
    useStore.setState({
      dailyQuestsDate: new Date().toDateString(),
      dailyQuests: [
        { questId: practice.id, progress: 0, completed: false, claimed: false },
        ...useStore.getState().dailyQuests.slice(1),
      ],
    })

    useStore.getState().addPracticeTime(practice.target - 1)
    const q1 = useStore.getState().dailyQuests[0]
    expect(q1.completed).toBe(false)
    useStore.getState().addPracticeTime(1)
    const q2 = useStore.getState().dailyQuests[0]
    expect(q2.completed).toBe(true)
  })

  it('metronome_seconds acumula apenas quando tracker metronome está ativo', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T12:00:00'))
    useStore.setState({ session: { user: { id: 'u1' } } as never })
    useStore.getState().ensureDailyQuests()
    const bank = useStore.getState().dailyQuestBank
    const met = bank.find((q) => q.kind === 'metronome_seconds')!
    useStore.setState({
      dailyQuestsDate: new Date().toDateString(),
      dailyQuests: [
        { questId: met.id, progress: 0, completed: false, claimed: false },
        ...useStore.getState().dailyQuests.slice(1),
      ],
    })

    useStore.getState().addPracticeTime(10)
    expect(useStore.getState().dailyMetronomeSeconds).toBe(0)

    useStore.setState({ activeTrackers: ['metronome'] })
    useStore.getState().addPracticeTime(10)
    expect(useStore.getState().dailyMetronomeSeconds).toBe(10)
  })

  it('resgatar missão completa adiciona créditos uma vez e marca claimed', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T12:00:00'))
    useStore.setState({ session: { user: { id: 'u1' } } as never })
    const bank = useStore.getState().dailyQuestBank
    const def = bank[0]!
    useStore.setState({
      dailyQuestsDate: new Date().toDateString(),
      dailyQuests: [
        {
          questId: def.id,
          progress: def.target,
          completed: true,
          claimed: false,
        },
      ],
    } as never)

    const before = useStore.getState().userStats.credits
    expect(useStore.getState().claimDailyQuest(def.id)).toBe(true)
    expect(useStore.getState().userStats.credits).toBe(before + def.rewardCredits)
    expect(useStore.getState().dailyQuests[0]!.claimed).toBe(true)
    // Segunda tentativa não deve creditar novamente.
    expect(useStore.getState().claimDailyQuest(def.id)).toBe(false)
    expect(useStore.getState().userStats.credits).toBe(before + def.rewardCredits)
  })
})

describe('useStore — loja e equipamento', () => {
  beforeEach(() => {
    resetStore()
  })

  it('markShopItemPurchased não duplica id', () => {
    useStore.getState().markShopItemPurchased('x')
    useStore.getState().markShopItemPurchased('x')
    expect(useStore.getState().purchasedShopItemIds).toEqual(['x'])
  })

  it('setEquippedItem atualiza apenas o slot pedido', () => {
    useStore.getState().setEquippedItem('guitar', 'g1')
    expect(useStore.getState().equippedItems.guitar).toBe('g1')
    expect(useStore.getState().equippedItems.clothes).toBeNull()
  })
})

describe('useStore — recordDailyEarTrainingCorrect', () => {
  beforeEach(() => {
    resetStore()
  })

  it('ignora delta 0, negativo e não finito', () => {
    useStore.setState({ dailyEarTrainingCorrect: 5 })
    useStore.getState().recordDailyEarTrainingCorrect(0)
    expect(useStore.getState().dailyEarTrainingCorrect).toBe(5)
    useStore.getState().recordDailyEarTrainingCorrect(-1)
    expect(useStore.getState().dailyEarTrainingCorrect).toBe(5)
    useStore.getState().recordDailyEarTrainingCorrect(Number.NaN)
    expect(useStore.getState().dailyEarTrainingCorrect).toBe(5)
  })

  it('incrementa contador diário com delta explícito', () => {
    useStore.getState().recordDailyEarTrainingCorrect(3)
    expect(useStore.getState().dailyEarTrainingCorrect).toBe(3)
    useStore.getState().recordDailyEarTrainingCorrect(2)
    expect(useStore.getState().dailyEarTrainingCorrect).toBe(5)
  })
})

describe('useStore — minijogos (streak / level)', () => {
  beforeEach(() => {
    resetStore()
  })

  it('fretboard e genius: update + levelUp', () => {
    useStore.getState().updateFretboardStreak(3)
    expect(useStore.getState().userStats.fretboardStreak).toBe(3)
    useStore.getState().levelUpFretboard()
    expect(useStore.getState().userStats.fretboardLevel).toBe(2)

    useStore.getState().updateGeniusStreak(1)
    useStore.getState().levelUpGenius()
    expect(useStore.getState().userStats.geniusLevel).toBe(2)
  })

  it('pitch strike: update + levelUp', () => {
    useStore.getState().updatePitchStrikeStreak(10)
    useStore.getState().levelUpPitchStrike()
    expect(useStore.getState().userStats.pitchStrikeLevel).toBe(2)
  })
})
