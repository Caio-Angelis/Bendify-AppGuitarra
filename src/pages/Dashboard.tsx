import { Calendar, CheckCircle2, Clock, Coins, Guitar, Trophy, User } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import AvatarViewer from '../components/AvatarViewer'
import { useStore } from '../store/useStore'
import { getShopCatalogItemById } from '../data/shopItems'
import {
  consumeUserItemOnDb,
  fetchPracticeLogs,
  logDailyPractice,
  supabase,
  toLocalDateIso,
  upsertDailyStreak,
} from '../utils/supabase'

const MIN_PRACTICE_SECONDS = 300
/** Meta em minutos por dia registado em `practice_logs` (alinhada aos 5 min mínimos para concluir). */
const MINUTES_PER_LOGGED_DAY = 5

function usernameFromSession(sessionEmail: string | undefined): string {
  const normalizedEmail = (sessionEmail ?? '').trim().toLowerCase()
  return normalizedEmail || 'email indisponível'
}

function formatRemainingParts(totalSeconds: number) {
  const s = Math.max(0, Math.ceil(totalSeconds))
  const min = Math.floor(s / 60)
  const seg = s % 60
  return { min, seg }
}

function dateFromIsoLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Objeto estável: layout inline recria o Pixi a cada render. */
const DASHBOARD_AVATAR_LAYOUT = {
  /** O default global é 40px — empurra o braço/guitarra para fora do canvas estreito. */
  offsetX: 20,
  // Sobe levemente o personagem para alinhar com o “holofote” e o backdrop circular.
  offsetY: 9,
  /** Ligeiramente abaixo do default 2.0 para caber guitarra + corpo na viewport. */
  scaleMult: 1.72,
  fitPad: 0.82,
} as const

/** Média conservada: assume `totalDays` dias distintos × meta de 5 min. */
function formatTotalPracticeTime(totalDays: number): string {
  const totalMinutes = totalDays * MINUTES_PER_LOGGED_DAY
  if (totalMinutes <= 0) return '0m'
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function maxConsecutiveCalendarDays(sortedUniqueIso: string[]): number {
  if (sortedUniqueIso.length === 0) return 0
  let best = 1
  let run = 1
  for (let i = 1; i < sortedUniqueIso.length; i++) {
    const prev = dateFromIsoLocal(sortedUniqueIso[i - 1])
    const cur = dateFromIsoLocal(sortedUniqueIso[i])
    const diffDays = Math.round(
      (cur.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000),
    )
    if (diffDays === 1) {
      run += 1
      best = Math.max(best, run)
    } else {
      run = 1
    }
  }
  return best
}

/** Diferença em dias civis entre `lastWorkout` e `todayStr` (`Date.toDateString()`). */
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

export default function Dashboard() {
  const session = useStore((s) => s.session)
  const userStats = useStore((s) => s.userStats)
  const setUserStats = useStore((s) => s.setUserStats)
  const dailyPracticeTime = useStore((s) => s.dailyPracticeTime)
  const practiceSessionDate = useStore((s) => s.practiceSessionDate)
  const lastWorkoutDate = useStore((s) => s.lastWorkoutDate)
  const setLastWorkoutDate = useStore((s) => s.setLastWorkoutDate)
  const resetPracticeTime = useStore((s) => s.resetPracticeTime)
  const clearUserSession = useStore((s) => s.clearUserSession)
  const inventory = useStore((s) => s.inventory)
  const consumeItemLocally = useStore((s) => s.consumeItemLocally)
  const showGlobalToast = useStore((s) => s.showGlobalToast)
  const setStreak = useStore((s) => s.setStreak)
  const equippedItems = useStore((s) => s.equippedItems)
  const ensureDailyQuests = useStore((s) => s.ensureDailyQuests)
  const dailyQuests = useStore((s) => s.dailyQuests)
  const dailyQuestBank = useStore((s) => s.dailyQuestBank)
  const claimDailyQuest = useStore((s) => s.claimDailyQuest)

  const streakGapHandledKey = useRef<string | null>(null)
  const streakGapProcessing = useRef(false)

  const [syncing, setSyncing] = useState(false)
  const [practiceLogDates, setPracticeLogDates] = useState<string[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsError, setLogsError] = useState<string | null>(null)

  const today = new Date().toDateString()

  const effectivePracticeSeconds =
    practiceSessionDate === today ? dailyPracticeTime : 0

  const userId = session?.user?.id
  const userEmail = session?.user?.email ?? ''
  const rankingUsername = userId
    ? usernameFromSession(session?.user?.email)
    : ''

  const workoutState =
    lastWorkoutDate === today
      ? ('completed' as const)
      : effectivePracticeSeconds < MIN_PRACTICE_SECONDS
        ? ('blocked' as const)
        : ('ready' as const)

  const remainingSeconds = MIN_PRACTICE_SECONDS - effectivePracticeSeconds
  const { min: remMin, seg: remSeg } = formatRemainingParts(remainingSeconds)
  const progressPercent = Math.min(
    100,
    (effectivePracticeSeconds / MIN_PRACTICE_SECONDS) * 100,
  )

  const canSubmit =
    workoutState === 'ready' &&
    Boolean(userId && rankingUsername) &&
    !syncing

  useEffect(() => {
    ensureDailyQuests()
  }, [ensureDailyQuests])

  useEffect(() => {
    if (!userId) {
      setPracticeLogDates([])
      setLogsError(null)
      setLogsLoading(false)
      return
    }
    let cancelled = false
    setLogsLoading(true)
    setLogsError(null)
    void fetchPracticeLogs(userId).then(({ data, error }) => {
      if (cancelled) return
      setLogsLoading(false)
      if (error) {
        setLogsError(error.message)
        setPracticeLogDates([])
        return
      }
      setPracticeLogDates(data ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [userId, lastWorkoutDate])

  useEffect(() => {
    if (!userId || !rankingUsername || !lastWorkoutDate.trim()) return

    const gap = calendarDaysBetweenLastWorkoutAndToday(lastWorkoutDate, today)
    if (gap <= 1) {
      streakGapHandledKey.current = null
      return
    }
    if (userStats.streak <= 0) return

    const key = `${lastWorkoutDate}|${today}|gap|${userStats.streak}`
    if (streakGapHandledKey.current === key) return
    if (streakGapProcessing.current) return

    const consumable = inventory.find(
      (i) => i.type.trim().toLowerCase() === 'consumable' && i.quantity > 0,
    )

    streakGapProcessing.current = true
    let cancelled = false

    void (async () => {
      try {
        if (consumable) {
          const { error } = await consumeUserItemOnDb(
            consumable.type,
            userId,
          )
          if (cancelled) return
          if (error) {
            console.warn('consume_user_item:', error.message)
            return
          }
          streakGapHandledKey.current = key
          consumeItemLocally('consumable')
          showGlobalToast(
            'Escudo de Ofensiva utilizado! Sua sequência foi protegida.',
          )
        } else {
          const { error } = await upsertDailyStreak(userId, rankingUsername, 0)
          if (cancelled) return
          if (error) {
            console.warn('upsertDailyStreak (reset):', error.message)
            return
          }
          setStreak(0)
          streakGapHandledKey.current = key
        }
      } finally {
        streakGapProcessing.current = false
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    userId,
    rankingUsername,
    lastWorkoutDate,
    today,
    userStats.streak,
    inventory,
    consumeItemLocally,
    showGlobalToast,
    setStreak,
  ])

  const uniqueSortedLogDates = useMemo(() => {
    const uniq = [...new Set(practiceLogDates.filter(Boolean))]
    uniq.sort()
    return uniq
  }, [practiceLogDates])

  const totalDays = uniqueSortedLogDates.length
  const totalTimeLabel = formatTotalPracticeTime(totalDays)
  const maxStreak = maxConsecutiveCalendarDays(uniqueSortedLogDates)

  const guitar = useMemo(
    () =>
      equippedItems.guitar ? getShopCatalogItemById(equippedItems.guitar) : null,
    [equippedItems.guitar],
  )
  const character = useMemo(
    () =>
      equippedItems.character
        ? getShopCatalogItemById(equippedItems.character)
        : null,
    [equippedItems.character],
  )

  const questById = useMemo(() => {
    return new Map(dailyQuestBank.map((q) => [q.id, q] as const))
  }, [dailyQuestBank])

  const questsForUi = useMemo(() => {
    return dailyQuests
      .map((q) => {
        const def = questById.get(q.questId)
        if (!def) return null
        const target = Math.max(1, def.target)
        const progress = Math.max(0, q.progress)
        const ratio = Math.min(1, progress / target)
        return {
          ...q,
          def,
          ratio,
          progressLabel:
            def.kind === 'practice_seconds' || def.kind === 'metronome_seconds'
              ? `${Math.floor(progress / 60)}m / ${Math.ceil(target / 60)}m`
              : `${progress} / ${target}`,
        }
      })
      .filter((q): q is NonNullable<typeof q> => q !== null)
  }, [dailyQuests, questById])

  async function handleCompleteWorkout() {
    if (!userId || !rankingUsername || workoutState !== 'ready') return
    setSyncing(true)
    const newStreak = userStats.streak + 1
    const { error } = await upsertDailyStreak(userId, rankingUsername, newStreak)
    if (error) {
      setSyncing(false)
      return
    }
    const todayIso = toLocalDateIso()
    const logResult = await logDailyPractice(userId, todayIso)
    if (logResult.error) {
      console.warn('logDailyPractice:', logResult.error.message)
    }
    setSyncing(false)
    setUserStats((prev) => ({ ...prev, streak: newStreak }))
    setLastWorkoutDate(today)
    resetPracticeTime()
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    clearUserSession()
  }

  const buttonClass =
    workoutState === 'completed'
      ? 'w-full cursor-not-allowed rounded-xl bg-[#1B5E20] py-3 text-center text-base font-bold text-[#F5F5F5]'
      : workoutState === 'blocked'
        ? 'w-full cursor-not-allowed rounded-xl bg-[#333333] py-3 text-center text-base font-bold text-[#F5F5F5]'
        : 'w-full rounded-xl bg-[#FFB300] py-3 text-center text-base font-bold text-black transition enabled:hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50'

  const buttonLabel =
    workoutState === 'completed'
      ? 'Treino de hoje concluído!'
      : workoutState === 'blocked'
        ? `Treine mais ${remMin} min e ${remSeg} seg para liberar`
        : 'Concluir Treino de Hoje'

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="font-mono text-2xl font-semibold tracking-tight text-[#F5F5F5] md:text-3xl">
          Dashboard
        </h1>
        <div className="flex flex-col items-end gap-1.5">
          {userEmail ? (
            <p className="max-w-[min(100%,16rem)] truncate text-right text-sm text-[#F5F5F5]/85">
              {userEmail}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-[#F5F5F5] backdrop-blur-sm transition hover:bg-white/10"
          >
            Sair
          </button>
        </div>
      </div>

      {userId ? (
        <section
          className="w-full min-w-0 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm"
          aria-labelledby="daily-quests-heading"
        >
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h2
                id="daily-quests-heading"
                className="text-xs font-medium uppercase tracking-wide text-[#F5F5F5]/70"
              >
                Missões diárias
              </h2>
              <p className="mt-1 text-[11px] text-[#F5F5F5]/45">
                Complete e resgate para ganhar créditos. Atualiza diariamente.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-[#121212]/50 px-3 py-1.5 backdrop-blur-sm">
              <Coins className="h-4 w-4 text-[#FFB300]/80" aria-hidden />
              <span className="font-mono text-sm font-semibold tabular-nums text-[#F5F5F5]">
                {userStats.credits}
              </span>
              <span className="text-xs text-[#F5F5F5]/55">créditos</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {questsForUi.map((q) => {
              const canClaim = q.completed && !q.claimed
              return (
                <div
                  key={q.questId}
                  className={[
                    'relative overflow-hidden rounded-xl border bg-[#121212]/50 p-4 backdrop-blur-sm',
                    q.completed
                      ? 'border-[#FFB300]/45 shadow-[0_0_32px_rgba(255,179,0,0.10)]'
                      : 'border-white/10',
                  ].join(' ')}
                >
                  <div
                    className="pointer-events-none absolute inset-0 opacity-[0.10]"
                    style={{
                      backgroundImage:
                        'radial-gradient(circle at 20% 20%, rgba(255,179,0,0.35) 0%, transparent 55%)',
                    }}
                    aria-hidden
                  />

                  <div className="relative flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#F5F5F5]">
                        {q.def.title}
                      </p>
                      <p className="mt-1 text-[11px] leading-snug text-[#F5F5F5]/55">
                        {q.def.description}
                      </p>
                    </div>
                    <div className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-1 backdrop-blur-sm">
                      <span className="font-mono text-xs font-semibold text-[#FFB300]">
                        +{q.def.rewardCredits}
                      </span>
                    </div>
                  </div>

                  <div className="relative mt-4">
                    <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-[#F5F5F5]/55">
                      <span className="truncate">{q.progressLabel}</span>
                      {q.completed ? (
                        <span className="inline-flex items-center gap-1 text-[#FFB300]/90">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                          Concluída
                        </span>
                      ) : null}
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/5 ring-1 ring-white/10 backdrop-blur-sm">
                      <div
                        className="h-full rounded-full bg-[#FFB300] transition-[width] duration-300 ease-out"
                        style={{ width: `${Math.round(q.ratio * 100)}%` }}
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={!canClaim}
                    onClick={() => {
                      const ok = claimDailyQuest(q.questId)
                      if (ok) {
                        showGlobalToast(
                          `Recompensa resgatada: +${q.def.rewardCredits} créditos.`,
                        )
                      }
                    }}
                    className={[
                      'relative mt-4 w-full rounded-lg py-2.5 text-sm font-semibold transition',
                      canClaim
                        ? 'bg-[#FFB300] text-black hover:brightness-105'
                        : q.claimed
                          ? 'cursor-not-allowed bg-white/5 text-[#F5F5F5]/55 ring-1 ring-white/10 backdrop-blur-sm'
                          : 'cursor-not-allowed bg-white/5 text-[#F5F5F5]/35 ring-1 ring-white/10 backdrop-blur-sm',
                    ].join(' ')}
                  >
                    {q.claimed ? 'Resgatado' : canClaim ? 'Resgatar' : 'Bloqueado'}
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      ) : null}

      {userId ? (
        <section
          className="w-full min-w-0 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm"
          aria-labelledby="wardrobe-heading"
        >
          <h2
            id="wardrobe-heading"
            className="mb-3 text-xs font-medium uppercase tracking-wide text-[#F5F5F5]/70"
          >
            Vestiário Bendify
          </h2>
          <div className="flex flex-col items-stretch justify-center gap-4 sm:flex-row sm:items-center sm:justify-center">
            <div className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-[#1E1E1E] to-black shadow-[inset_0_-50px_50px_-50px_rgba(255,179,0,0.15)] backdrop-blur-sm">
              <div
                className="pointer-events-none absolute left-1/2 top-1/2 h-[140%] w-[140%] -translate-x-1/2 -translate-y-1/2 opacity-80"
                style={{
                  backgroundImage:
                    'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 22%, transparent 58%)',
                }}
                aria-hidden
              />
              <div className="relative flex h-[320px] w-full items-center justify-center overflow-hidden p-3">
                <AvatarViewer
                  equippedItems={equippedItems}
                  size={380}
                  layout={DASHBOARD_AVATAR_LAYOUT}
                  outerHeightPx={320}
                  className="mx-auto w-full max-w-[min(100%,420px)] shrink-0"
                />
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {userId ? (
        <section
          className="w-full min-w-0 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm"
          aria-label="Seu visual"
        >
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-[#F5F5F5]/70">
            Seu visual
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex min-w-0 items-center gap-3 rounded-xl border border-white/10 bg-[#121212]/50 p-3 backdrop-blur-sm">
              {guitar?.imageUrl ? (
                <img
                  src={guitar.imageUrl}
                  alt=""
                  className="h-12 w-12 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#121212]/50 text-[#FFB300] ring-1 ring-white/10 backdrop-blur-sm">
                  <Guitar className="h-6 w-6" strokeWidth={2} aria-hidden />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[10px] text-[#F5F5F5]/45">Guitarra</p>
                <p className="truncate text-sm font-medium text-[#F5F5F5]">
                  {guitar?.name ?? 'Nenhuma guitarra'}
                </p>
              </div>
            </div>

            <div className="flex min-w-0 items-center gap-3 rounded-xl border border-white/10 bg-[#121212]/50 p-3 backdrop-blur-sm">
              {character?.imageUrl ? (
                <img
                  src={character.imageUrl}
                  alt=""
                  className="h-12 w-12 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#121212]/50 text-[#FFB300] ring-1 ring-white/10 backdrop-blur-sm">
                  <User className="h-6 w-6" strokeWidth={2} aria-hidden />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[10px] text-[#F5F5F5]/45">Personagem</p>
                <p className="truncate text-sm font-medium text-[#F5F5F5]">
                  {character?.name ?? 'Personagem padrão'}
                </p>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {userId ? (
        <div className="flex flex-col gap-3">
          {logsError ? (
            <p className="text-xs text-[#D32F2F]" role="alert">
              Estatísticas indisponíveis: {logsError}
            </p>
          ) : null}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex h-24 flex-col justify-between rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-[#F5F5F5]/55">
                  Tempo total
                </p>
                <Clock
                  className="h-4 w-4 shrink-0 text-[#FFB300]/80"
                  strokeWidth={2}
                  aria-hidden
                />
              </div>
              <p className="font-mono text-2xl font-semibold tabular-nums text-[#FFB300]">
                {logsLoading ? '…' : totalTimeLabel}
              </p>
              <p className="text-[11px] text-[#F5F5F5]/45">
                ~{MINUTES_PER_LOGGED_DAY} min por dia treinado
              </p>
            </div>

            <div className="flex h-24 flex-col justify-between rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-[#F5F5F5]/55">
                  Dias treinados
                </p>
                <Calendar
                  className="h-4 w-4 shrink-0 text-[#FFB300]/80"
                  strokeWidth={2}
                  aria-hidden
                />
              </div>
              <p className="font-mono text-2xl font-semibold tabular-nums text-[#F5F5F5]">
                {logsLoading ? '…' : totalDays}
              </p>
              <span className="text-[11px] text-transparent">.</span>
            </div>

            <div className="flex h-24 flex-col justify-between rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-[#F5F5F5]/55">
                  Maior ofensiva
                </p>
                <Trophy
                  className="h-4 w-4 shrink-0 text-[#FFB300]/80"
                  strokeWidth={2}
                  aria-hidden
                />
              </div>
              <p className="font-mono text-2xl font-semibold tabular-nums text-[#FFB300]">
                {logsLoading ? '…' : maxStreak}
                {!logsLoading ? (
                  <span className="ml-1 text-base font-normal text-[#F5F5F5]/70">
                    {maxStreak === 1 ? 'dia' : 'dias'}
                  </span>
                ) : null}
              </p>
              <span className="text-[11px] text-transparent">.</span>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {workoutState === 'blocked' && (
          <div
            className="h-1 w-full overflow-hidden rounded-full bg-white/5 backdrop-blur-sm"
            role="progressbar"
            aria-valuenow={Math.round(progressPercent)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-[#FFB300] transition-[width] duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => void handleCompleteWorkout()}
          className={buttonClass}
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  )
}
