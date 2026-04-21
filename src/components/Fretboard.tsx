import { memo, useMemo } from 'react'
import { MAX_OPEN_FRETS, STRING_LABELS, noteAtStringFret } from './fretboardUtils'

export type FretboardClickPayload = {
  stringIndex: number
  fret: number
  note: string
}

export type FretHighlight = { stringIndex: number; fret: number }

type FretboardProps = {
  onCellClick?: (payload: FretboardClickPayload) => void
  /** Casas a realçar (ex.: solução após erro). */
  highlights?: FretHighlight[]
  disabled?: boolean
  /** Se falso, as células não mostram a nota (ex.: modo desafio). O clique continua a devolver a nota no callback. */
  showCellNotes?: boolean
  /** Número máximo de casas (inclui 0). Default: `MAX_OPEN_FRETS` (12). */
  maxFrets?: number
  /**
   * Se definido, o braço entra no modo “diagrama premium”:
   * - notas fora da escala ficam quase invisíveis (revelam no hover)
   * - notas da escala viram círculos
   */
  activePitchClasses?: readonly string[]
  /** Nota tônica (root) para destacar levemente no diagrama. */
  rootPitchClass?: string
}

const INLAY_SINGLE = new Set([3, 5, 7, 9, 15, 17, 19, 21])
const INLAY_DOUBLE = 12

function Fretboard({
  onCellClick,
  highlights,
  disabled = false,
  showCellNotes = true,
  maxFrets = MAX_OPEN_FRETS,
  activePitchClasses,
  rootPitchClass,
}: FretboardProps) {
  const highlightSet = useMemo(() => {
    if (!highlights?.length) return null
    const set = new Set<string>()
    for (const h of highlights) set.add(`${h.stringIndex}:${h.fret}`)
    return set
  }, [highlights])

  const highlighted = (s: number, f: number) =>
    highlightSet?.has(`${s}:${f}`) ?? false

  const activeSet = useMemo(() => {
    if (!activePitchClasses?.length) return null
    return new Set(activePitchClasses)
  }, [activePitchClasses])

  return (
    <div
      className="w-full overflow-x-auto rounded-xl border border-white/10 bg-[#1A1A1A]/90 shadow-2xl backdrop-blur-md overflow-hidden relative"
      role="application"
      aria-label="Braço da guitarra, cordas e trastes"
    >
      <div className="inline-block min-w-full p-4">
        <div className="min-w-[min(100%,58rem)]">
          <div className="flex items-end gap-0">
            <div className="w-12 shrink-0" aria-hidden />
            <div
              className="grid flex-1"
              style={{
                gridTemplateColumns: `repeat(${maxFrets + 1}, minmax(2.25rem, 1fr))`,
              }}
            >
              {Array.from({ length: maxFrets + 1 }, (_, f) => (
                <div
                  key={`h-${f}`}
                  className={[
                    'flex h-7 items-end justify-center pb-1 font-mono text-[10px] text-white/40',
                    f === 0 ? 'border-r-2 border-white/20' : 'border-r border-white/5',
                  ].join(' ')}
                >
                  {f}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-2 space-y-1.5">
            {STRING_LABELS.map((label, s) => (
              <div key={`row-${s}`} className="flex items-stretch gap-0">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center text-xs font-bold text-[#FFB300]">
                  {label}
                </div>

                <div
                  className="relative grid flex-1"
                  style={{
                    gridTemplateColumns: `repeat(${maxFrets + 1}, minmax(2.25rem, 1fr))`,
                  }}
                >
                  {/* corda */}
                  <div
                    className="pointer-events-none absolute left-0 right-0 top-1/2 h-[2px] -translate-y-1/2 bg-white/10"
                    aria-hidden
                  />

                  {/* inlays (no fundo) */}
                  <div className="pointer-events-none absolute inset-0 grid"
                    style={{
                      gridTemplateColumns: `repeat(${maxFrets + 1}, minmax(2.25rem, 1fr))`,
                    }}
                    aria-hidden
                  >
                    {Array.from({ length: maxFrets + 1 }, (_, f) => (
                      <div
                        key={`inlay-${s}-${f}`}
                        className={[
                          'relative flex items-center justify-center',
                          f === 0 ? 'border-r-2 border-white/20' : 'border-r border-white/5',
                        ].join(' ')}
                      >
                        {s === 2 && (INLAY_SINGLE.has(f) || f === INLAY_DOUBLE) ? (
                          f === INLAY_DOUBLE ? (
                            <div className="flex flex-col items-center gap-1">
                              <div className="h-4 w-4 rounded-full bg-white/5" />
                              <div className="h-4 w-4 rounded-full bg-white/5" />
                            </div>
                          ) : (
                            <div className="h-4 w-4 rounded-full bg-white/5" />
                          )
                        ) : null}
                      </div>
                    ))}
                  </div>

                  {Array.from({ length: maxFrets + 1 }, (_, f) => {
                    const note = noteAtStringFret(s, f)
                    const isHi = highlighted(s, f)
                    const isActive = activeSet ? activeSet.has(note) : true
                    const isRoot = Boolean(rootPitchClass && note === rootPitchClass)

                    const showAsCircle = activeSet ? isActive : isHi
                    const showInvisibleText = activeSet ? !isActive : false

                    return (
                      <button
                        key={`c-${s}-${f}`}
                        type="button"
                        disabled={disabled}
                        onClick={() =>
                          onCellClick?.({
                            stringIndex: s,
                            fret: f,
                            note,
                          })
                        }
                        className={[
                          'group relative flex h-12 items-center justify-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB300]/60',
                          f === 0 ? 'border-r-2 border-white/20' : 'border-r border-white/5',
                          disabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer',
                          showAsCircle ? '' : 'hover:bg-white/5',
                          isHi ? 'ring-1 ring-[#FFB300]/35' : '',
                        ].join(' ')}
                        aria-label={`Corda ${label}, casa ${f}, nota ${note}`}
                      >
                        {showCellNotes ? (
                          showAsCircle ? (
                            <span
                              className={[
                                'flex h-8 w-8 items-center justify-center rounded-full text-sm font-extrabold shadow-[0_0_15px_rgba(255,179,0,0.5)]',
                                isRoot
                                  ? 'bg-white text-black ring-2 ring-[#FFB300]/60'
                                  : 'bg-[#FFB300] text-black',
                                'relative z-10',
                              ].join(' ')}
                            >
                              {note}
                            </span>
                          ) : (
                            <span
                              className={[
                                'relative z-10 font-mono text-[11px] transition-colors',
                                showInvisibleText
                                  ? 'text-white/0 group-hover:text-white/30'
                                  : 'text-white/65',
                              ].join(' ')}
                            >
                              {note}
                            </span>
                          )
                        ) : (
                          <span
                            className={[
                              'relative z-10 font-mono text-[10px] transition-colors',
                              isHi
                                ? 'text-[#FFB300]'
                                : showInvisibleText
                                  ? 'text-white/0 group-hover:text-white/30'
                                  : 'text-white/30',
                            ].join(' ')}
                            aria-hidden
                          >
                            {isHi ? note : '·'}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default memo(Fretboard)
