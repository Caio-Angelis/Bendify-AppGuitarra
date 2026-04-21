import { useEffect, useMemo, useState } from 'react'
import {
  MessageSquare,
  ShoppingBag,
  Trophy,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import {
  ACHIEVEMENTS,
  type AchievementDef,
  type AchievementIconName,
} from '../data/achievements'
import { useStore } from '../store/useStore'
import {
  fetchUserAchievements,
  type UserAchievementRow,
} from '../utils/supabase'

const ICON_BY_NAME: Record<AchievementIconName, LucideIcon> = {
  Zap,
  ShoppingBag,
  MessageSquare,
}

function formatUnlockedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export default function Achievements() {
  const userId = useStore((s) => s.session?.user?.id)
  const [rows, setRows] = useState<UserAchievementRow[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) {
      setRows([])
      return
    }
    let cancelled = false
    setLoadError(null)
    void fetchUserAchievements(userId).then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        setLoadError(error.message)
        setRows(null)
        return
      }
      setRows(data ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  const unlockedMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of rows ?? []) {
      if (r.unlocked_at) m.set(r.achievement_id, r.unlocked_at)
    }
    return m
  }, [rows])

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-8 flex flex-col gap-2 border-b border-[#333333] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-[#FFB300]">
            <Trophy className="h-6 w-6" strokeWidth={2} aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-[0.2em]">
              Gamificação
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#F5F5F5] md:text-3xl">
            Conquistas
          </h1>
          <p className="mt-1 max-w-xl text-sm text-[#F5F5F5]/65">
            Desbloqueie troféus jogando e ganhe créditos extra na primeira vez.
          </p>
        </div>
      </header>

      {loadError ? (
        <p className="mb-6 rounded-lg border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          Não foi possível carregar as conquistas: {loadError}
        </p>
      ) : null}

      <ul className="grid gap-4 sm:grid-cols-2">
        {ACHIEVEMENTS.map((a: AchievementDef) => {
          const unlockedAt = unlockedMap.get(a.id)
          const locked = !unlockedAt
          const Icon = ICON_BY_NAME[a.icon] ?? Zap
          return (
            <li
              key={a.id}
              className={[
                'flex gap-4 rounded-2xl border px-4 py-4 transition-all duration-300',
                locked
                  ? 'border-white/10 bg-white/5 opacity-50 grayscale backdrop-blur-sm'
                  : 'border-white/10 bg-white/5 shadow-[0_0_24px_rgba(255,179,0,0.12)] backdrop-blur-sm hover:-translate-y-1 hover:shadow-lg hover:shadow-[#FFB300]/10 hover:border-[#FFB300]/30',
              ].join(' ')}
            >
              <div
                className={[
                  'flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-2 bg-[#121212]/40 backdrop-blur-sm',
                  locked
                    ? 'border-[#444] text-[#888]'
                    : 'border-[#FFB300] text-[#FFB300]',
                ].join(' ')}
                aria-hidden
              >
                <Icon className="h-7 w-7" strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1">
                <h2
                  className={[
                    'font-semibold tracking-tight',
                    locked ? 'text-[#F5F5F5]/70' : 'text-[#FFB300]',
                  ].join(' ')}
                >
                  {a.name}
                </h2>
                <p className="mt-1 text-sm text-[#F5F5F5]/55">{a.description}</p>
                <p className="mt-2 text-xs text-[#F5F5F5]/45">
                  Recompensa:{' '}
                  <span className="tabular-nums text-[#FFB300]/90">
                    +{a.reward} créditos
                  </span>
                  {unlockedAt ? (
                    <>
                      {' '}
                      · Desbloqueado em{' '}
                      <time
                        dateTime={unlockedAt}
                        className="text-[#FFB300]/95"
                      >
                        {formatUnlockedAt(unlockedAt)}
                      </time>
                    </>
                  ) : (
                    <span className="text-[#F5F5F5]/35"> · Bloqueado</span>
                  )}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
