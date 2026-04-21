import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import {
  fetchAcceptedFriendUserIds,
  fetchDailyRankingForUserIds,
  fetchDailyRankingTop50,
  type DailyRankingEntry,
} from '../utils/supabase'

type RankingScope = 'global' | 'friends'

export default function Ranking() {
  const session = useStore((s) => s.session)
  const userId = session?.user?.id ?? ''

  const [scope, setScope] = useState<RankingScope>('global')
  const [rows, setRows] = useState<DailyRankingEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setFetchError(null)

      if (scope === 'global') {
        const { data, error } = await fetchDailyRankingTop50()
        if (cancelled) return
        if (error) {
          setFetchError(error.message)
          setRows([])
        } else {
          setRows(data ?? [])
        }
        setLoading(false)
        return
      }

      if (!userId) {
        if (!cancelled) {
          setFetchError('Inicie sessão para ver o ranking de amigos.')
          setRows([])
          setLoading(false)
        }
        return
      }

      const { data: friendIds, error: friendsErr } =
        await fetchAcceptedFriendUserIds(userId)
      if (cancelled) return
      if (friendsErr) {
        setFetchError(friendsErr.message)
        setRows([])
        setLoading(false)
        return
      }

      const ids = Array.from(new Set([userId, ...(friendIds ?? [])]))
      const { data, error } = await fetchDailyRankingForUserIds(ids)
      if (cancelled) return
      if (error) {
        setFetchError(error.message)
        setRows([])
      } else {
        setRows(data ?? [])
      }
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [scope, userId])

  const title =
    scope === 'global' ? 'Ranking global' : 'Ranking entre amigos'

  const tabBtn = (id: RankingScope, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setScope(id)}
      className={[
        'rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200',
        scope === id
          ? 'bg-[#FFB300]/15 text-[#FFB300] ring-1 ring-[#FFB300]/50'
          : 'text-gray-400 hover:bg-white/5 hover:text-white',
      ].join(' ')}
    >
      {label}
    </button>
  )

  return (
    <div className="flex w-full flex-col items-center">
      <div className="mb-6 flex w-full max-w-lg flex-col gap-4 self-start">
        <h1 className="font-mono text-2xl font-semibold tracking-tight text-[#F5F5F5] md:text-3xl">
          {title}
        </h1>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Âmbito do ranking">
          {tabBtn('global', 'Global')}
          {tabBtn('friends', 'Amigos')}
        </div>
      </div>

      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
        {loading && (
          <p className="font-mono text-sm text-[#F5F5F5]/80">
            Carregando ranking...
          </p>
        )}

        {!loading && fetchError && (
          <p className="mb-4 text-xs text-[#D32F2F]" role="alert">
            {fetchError}
          </p>
        )}

        {!loading && !fetchError && rows.length === 0 && (
          <p className="font-mono text-sm text-[#F5F5F5]/70">
            {scope === 'friends'
              ? 'Ainda não há entradas no ranking para este grupo.'
              : 'Ainda não há entradas no ranking.'}
          </p>
        )}

        {!loading && rows.length > 0 && (
          <ul className="flex flex-col gap-3">
            {rows.map((row, index) => {
              const position = index + 1
              const isTopThree = position <= 3
              return (
                <li
                  key={`${row.user_id}-${index}`}
                  className="flex items-center justify-between gap-4 border-b border-white/10 pb-3 last:border-0 last:pb-0"
                >
                  <span
                    className={
                      isTopThree
                        ? 'min-w-[2rem] font-mono tabular-nums text-[#FFB300] drop-shadow-[0_0_10px_rgba(255,179,0,0.55)]'
                        : 'min-w-[2rem] font-mono tabular-nums text-[#F5F5F5]'
                    }
                  >
                    {position}.
                  </span>
                  <span
                    className={
                      isTopThree
                        ? 'flex-1 truncate font-medium text-[#FFB300] drop-shadow-[0_0_10px_rgba(255,179,0,0.45)]'
                        : 'flex-1 truncate text-[#F5F5F5]'
                    }
                  >
                    {row.username ?? row.user_id.slice(0, 8)}
                  </span>
                  <span
                    className={
                      isTopThree
                        ? 'font-mono tabular-nums text-[#FFB300] drop-shadow-[0_0_8px_rgba(255,179,0,0.5)]'
                        : 'font-mono tabular-nums text-[#F5F5F5]'
                    }
                  >
                    {row.streak_count}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
