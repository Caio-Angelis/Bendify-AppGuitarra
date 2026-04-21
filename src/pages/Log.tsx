import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import {
  fetchPracticeLogs,
  toLocalDateIso,
} from '../utils/supabase'

const DAYS_IN_HEATMAP = 365
const MONTHS_PT = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
] as const

type Cell = { kind: 'pad' } | { kind: 'day'; iso: string }

function buildHeatmapCells(): { flat: Cell[]; numCols: number } {
  const end = new Date()
  end.setHours(12, 0, 0, 0)
  const start = new Date(end)
  start.setDate(start.getDate() - (DAYS_IN_HEATMAP - 1))

  const paddingBefore = start.getDay()
  const flat: Cell[] = []
  for (let i = 0; i < paddingBefore; i++) {
    flat.push({ kind: 'pad' })
  }
  for (let i = 0; i < DAYS_IN_HEATMAP; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    flat.push({ kind: 'day', iso: toLocalDateIso(d) })
  }
  while (flat.length % 7 !== 0) {
    flat.push({ kind: 'pad' })
  }
  const numCols = flat.length / 7
  return { flat, numCols }
}

function columnStartMonthIndex(flat: Cell[], col: number): number | null {
  for (let r = 0; r < 7; r++) {
    const idx = col * 7 + r
    const cell = flat[idx]
    if (cell?.kind === 'day') {
      const [y, mo, day] = cell.iso.split('-').map(Number)
      const dt = new Date(y, mo - 1, day)
      if (dt.getDate() === 1) {
        return dt.getMonth()
      }
    }
  }
  return null
}

export default function Log() {
  const session = useStore((s) => s.session)
  const userId = session?.user?.id

  const { flat, numCols } = useMemo(() => buildHeatmapCells(), [])

  const [logDates, setLogDates] = useState<string[]>([])
  const [averageMinutes, setAverageMinutes] = useState<number | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!userId) {
      setLogDates([])
      setAverageMinutes(null)
      setLoadError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    void fetchPracticeLogs(userId).then(({ data, averageMinutes: avg, error }) => {
      if (cancelled) return
      setLoading(false)
      if (error) {
        setLoadError(error.message)
        setLogDates([])
        setAverageMinutes(null)
        return
      }
      setLogDates(data ?? [])
      setAverageMinutes(avg)
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  const practiceSet = useMemo(() => new Set(logDates), [logDates])

  const totalTrainedInWindow = useMemo(() => {
    let n = 0
    for (let i = 0; i < flat.length; i++) {
      const cell = flat[i]
      if (cell.kind === 'day' && practiceSet.has(cell.iso)) {
        n += 1
      }
    }
    return n
  }, [flat, practiceSet])

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <h1 className="font-mono text-2xl font-semibold tracking-tight md:text-3xl">
        Diário
      </h1>

      {!userId ? (
        <p className="text-sm text-[#F5F5F5]/75">
          Inicie sessão para ver o heatmap de consistência sincronizado com a sua
          conta.
        </p>
      ) : null}

      {loadError ? (
        <p className="text-xs text-[#D32F2F]" role="alert">
          Não foi possível carregar o histórico: {loadError}
        </p>
      ) : null}

      <div className="overflow-x-auto pb-1">
        <div
          className="inline-grid gap-1"
          style={{
            gridTemplateColumns: `repeat(${numCols}, minmax(0, 0.75rem))`,
          }}
        >
          {Array.from({ length: numCols }, (_, c) => {
            const mi = columnStartMonthIndex(flat, c)
            return (
              <div
                key={`m-${c}`}
                className="h-4 font-mono text-[10px] leading-none text-[#F5F5F5]/55"
              >
                {mi !== null ? MONTHS_PT[mi] : ''}
              </div>
            )
          })}
        </div>

        <div
          className="mt-1 grid grid-flow-col grid-rows-7 gap-1"
          style={{ gridAutoColumns: '0.75rem' }}
          aria-label="Heatmap de treinos nos últimos 365 dias"
        >
          {flat.map((cell, i) => {
            if (cell.kind === 'pad') {
              return (
                <div
                  key={i}
                  className="h-3 w-3 shrink-0 rounded-sm bg-[#222222]"
                  aria-hidden
                />
              )
            }
            const filled = practiceSet.has(cell.iso)
            return (
              <div
                key={i}
                title={`${cell.iso}: ${filled ? 'Treino registado' : 'Sem treino'}`}
                className={`h-3 w-3 shrink-0 rounded-sm ${
                  filled ? 'bg-[#FFB300]' : 'bg-[#222222]'
                }`}
              />
            )
          })}
        </div>
      </div>

      {userId ? (
        <dl className="flex flex-col gap-2 font-mono text-sm text-[#F5F5F5]/90">
          <div className="flex flex-wrap gap-x-2 gap-y-1">
            <dt className="text-[#F5F5F5]/65">Total de dias treinados</dt>
            <dd className="tabular-nums text-[#FFB300]">
              {loading ? '…' : totalTrainedInWindow}
              {!loading ? (
                <span className="ml-1 text-xs font-normal text-[#F5F5F5]/50">
                  (últimos {DAYS_IN_HEATMAP} dias)
                </span>
              ) : null}
            </dd>
          </div>
          {averageMinutes != null ? (
            <div className="flex flex-wrap gap-x-2 gap-y-1">
              <dt className="text-[#F5F5F5]/65">Média de minutos</dt>
              <dd className="tabular-nums text-[#FFB300]">
                {averageMinutes.toFixed(1)}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </div>
  )
}
