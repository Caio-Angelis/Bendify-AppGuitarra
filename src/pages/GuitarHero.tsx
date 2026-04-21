import { memo, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Guitar, Gauge, TimerReset } from 'lucide-react'
import { useGuitarHero } from '../hooks/useGuitarHero'
import type { RenderableNote } from '../types/guitarHero'

export default function GuitarHero() {
  const {
    isRunning,
    style,
    key,
    bpm,
    difficulty,
    score,
    combo,
    multiplier,
    accuracy,
    feedback,
    visibleNotes,
    hitLineY,
    lookaheadBeats,
    laneCount,
    detectedHz,
    detectedNote,
    currentTargetLabel,
    upcomingTargetLabels,
    detectedCentsDelta,
    micError,
    styles,
    keyOptions,
    setStyle,
    setKey,
    setBpm,
    start,
    stop,
  } = useGuitarHero()

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#FFB300]/90">
              Novo Modo
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#F5F5F5] md:text-3xl">
              Guitar Hero Inteligente
            </h1>
            <p className="mt-1 text-sm text-[#F5F5F5]/60">
              Fases infinitas com adaptação dinâmica de dificuldade.
            </p>
          </div>
          <div className="rounded-xl border border-[#FFB300]/40 bg-[#FFB300]/10 px-4 py-2 text-right">
            <p className="text-[0.65rem] uppercase tracking-[0.2em] text-[#FFB300]/90">
              Dificuldade
            </p>
            <p className="font-mono text-2xl font-bold text-[#FFB300]">{difficulty}</p>
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-12">
        <aside className="space-y-4 lg:col-span-4">
          <section className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#F5F5F5]/50">
              Controles
            </p>
            <div className="mt-4 space-y-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[#F5F5F5]/75">Estilo</span>
                <select
                  value={style}
                  onChange={(e) => setStyle(e.target.value as typeof style)}
                  disabled={isRunning}
                  className="rounded-lg border border-white/10 bg-[#121212]/60 px-3 py-2 text-[#F5F5F5] outline-none"
                >
                  {styles.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[#F5F5F5]/75">Tom</span>
                <select
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  disabled={isRunning}
                  className="rounded-lg border border-white/10 bg-[#121212]/60 px-3 py-2 text-[#F5F5F5] outline-none"
                >
                  {keyOptions.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[#F5F5F5]/75">BPM</span>
                <input
                  type="range"
                  min={70}
                  max={170}
                  value={bpm}
                  disabled={isRunning}
                  onChange={(e) => setBpm(Number(e.target.value))}
                  className="accent-[#FFB300]"
                />
                <span className="font-mono text-xs text-[#F5F5F5]/70">{bpm} BPM</span>
              </label>
            </div>

            <button
              type="button"
              onClick={() => void (isRunning ? Promise.resolve(stop()) : start())}
              className={[
                'mt-5 w-full rounded-xl px-4 py-3 text-sm font-semibold transition',
                isRunning
                  ? 'border border-white/10 bg-white/5 text-[#F5F5F5]'
                  : 'bg-[#FFB300] text-black hover:brightness-105',
              ].join(' ')}
            >
              {isRunning ? 'Parar sessão' : 'Iniciar sessão'}
            </button>
          </section>

          {micError ? (
            <p className="rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {micError}
            </p>
          ) : null}
        </aside>

        <section className="space-y-4 lg:col-span-8">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <HudCard title="Score" value={String(score)} icon={<Gauge className="h-4 w-4" />} />
            <HudCard title="Combo" value={`${combo}x`} icon={<TimerReset className="h-4 w-4" />} />
            <HudCard
              title="Precisão"
              value={`${Math.round(accuracy * 100)}%`}
              icon={<Guitar className="h-4 w-4" />}
            />
            <HudCard title="Multiplicador" value={`x${multiplier}`} icon={<Gauge className="h-4 w-4" />} />
            <HudCard
              title="Pitch"
              value={detectedHz ? `${detectedHz.toFixed(1)} Hz` : '—'}
              icon={<Guitar className="h-4 w-4" />}
            />
          </div>

          <NoteHighway
            notes={visibleNotes}
            feedback={feedback}
            hitLineY={hitLineY}
            lookaheadBeats={lookaheadBeats}
            laneCount={laneCount}
            detectedNote={detectedNote}
            currentTargetLabel={currentTargetLabel}
            upcomingTargetLabels={upcomingTargetLabels}
            detectedCentsDelta={detectedCentsDelta}
            isRunning={isRunning}
          />
        </section>
      </div>
    </div>
  )
}

function NoteHighway({
  notes,
  feedback,
  hitLineY,
  lookaheadBeats,
  laneCount,
  detectedNote,
  currentTargetLabel,
  upcomingTargetLabels,
  detectedCentsDelta,
  isRunning,
}: {
  notes: RenderableNote[]
  feedback: string
  hitLineY: number
  lookaheadBeats: number
  laneCount: number
  detectedNote: string
  currentTargetLabel: string
  upcomingTargetLabels: string[]
  detectedCentsDelta: number | null
  isRunning: boolean
}) {
  const [floatingFeedback, setFloatingFeedback] = useState<string>('Ready')
  const lanes = useMemo(() => Array.from({ length: laneCount }, (_, i) => i), [laneCount])

  useEffect(() => {
    if (!isRunning) {
      setFloatingFeedback('Ready')
      return
    }
    setFloatingFeedback(feedback)
    const timer = window.setTimeout(() => setFloatingFeedback(''), 480)
    return () => window.clearTimeout(timer)
  }, [feedback, isRunning])

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-[#181818] to-black p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#F5F5F5]/50">
          Note Highway
        </p>
        <p className="text-xs text-[#F5F5F5]/60">
          Detectado:{' '}
          <span className="font-mono text-[#F5F5F5]/85">
            {detectedNote}
          </span>
        </p>
      </div>

      <div className="relative h-[30rem] overflow-hidden rounded-xl border border-white/10 bg-[#090909]">
        {lanes.map((lane) => (
          <div
            key={`lane-${lane}`}
            className="absolute bottom-0 top-0 border-r border-white/10"
            style={{
              left: `${(lane / laneCount) * 100}%`,
              width: `${100 / laneCount}%`,
            }}
          />
        ))}

        <div
          className="pointer-events-none absolute left-0 right-0 z-20 h-1.5 bg-[#FFB300] shadow-[0_0_16px_2px_rgba(255,179,0,0.85)]"
          style={{ top: `${hitLineY * 100}%` }}
        />

        <div
          className="pointer-events-none absolute left-1/2 z-30 w-[82%] -translate-x-1/2 rounded-lg border border-[#FFB300]/40 bg-black/65 px-3 py-2 text-center text-xs"
          style={{ top: `${Math.max(5, hitLineY * 100 - 9)}%` }}
        >
          <p className="text-[#F5F5F5]/70">
            Toque agora:{' '}
            <span className="font-mono text-[#FFB300]">{currentTargetLabel}</span>
          </p>
          <p className="mt-1 text-[#F5F5F5]/60">
            Próximas:{' '}
            <span className="font-mono text-[#F5F5F5]/85">
              {upcomingTargetLabels.length > 0 ? upcomingTargetLabels.join(', ') : '—'}
            </span>
          </p>
        </div>

        {notes.map((note) => {
          const laneWidth = 100 / laneCount
          const x = note.lane * laneWidth + laneWidth / 2
          const translateY = Math.max(-64, Math.min(560, note.yNormalized * hitLineY * 480))
          const noteHeight = Math.max(1.6, (note.durationBeats / lookaheadBeats) * hitLineY * 100)

          return (
            <HighwayNote
              key={note.id}
              note={note}
              xPercent={x}
              translateY={translateY}
              widthPercent={Math.max(12, laneWidth - 4)}
              heightPercent={noteHeight}
            />
          )
        })}

        <div className="pointer-events-none absolute bottom-5 left-1/2 z-30 -translate-x-1/2">
          <span className="rounded-full border border-white/15 bg-black/55 px-4 py-1 text-xs uppercase tracking-[0.16em] text-[#F5F5F5]/85">
            {floatingFeedback || '...'}
          </span>
        </div>
      </div>

      <p className="mt-3 rounded-lg border border-white/10 bg-black/45 px-3 py-2 text-xs text-[#F5F5F5]/70">
        {floatingFeedback.startsWith('Esperado:')
          ? floatingFeedback
          : `Esperado: ${currentTargetLabel}, Detectado: ${detectedNote}, Delta: ${
              detectedCentsDelta == null
                ? '—'
                : `${detectedCentsDelta > 0 ? '+' : ''}${Math.round(detectedCentsDelta)}c`
            }`}
      </p>

      <p className="mt-4 text-xs leading-relaxed text-[#F5F5F5]/45">
        Ajuste automático: a dificuldade sobe quando você mantém performance alta por segmentos
        consecutivos e desce quando o desempenho cai.
      </p>
    </div>
  )
}

const HighwayNote = memo(function HighwayNote({
  note,
  xPercent,
  translateY,
  widthPercent,
  heightPercent,
}: {
  note: RenderableNote
  xPercent: number
  translateY: number
  widthPercent: number
  heightPercent: number
}) {
  return (
    <div
      className={[
        'absolute top-0 z-10 rounded-md border will-change-transform',
        note.isHit
          ? 'border-emerald-300/80 bg-emerald-400/65'
          : note.isMissed
            ? 'border-rose-400/70 bg-rose-500/45 opacity-70'
            : 'border-[#FFB300]/90 bg-[#FFB300]/70 opacity-95',
      ].join(' ')}
      style={{
        left: `${xPercent}%`,
        width: `${widthPercent}%`,
        height: `${heightPercent}%`,
        transform: `translate3d(-50%, ${translateY}px, 0)`,
      }}
    >
      <div className="flex h-full items-center justify-center px-1 text-[0.68rem] font-bold text-black/90">
        {note.targetLabel}
      </div>
    </div>
  )
})

function HudCard({
  title,
  value,
  icon,
}: {
  title: string
  value: string
  icon: ReactNode
}) {
  return (
    <article className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
      <div className="flex items-center justify-between text-[#F5F5F5]/60">
        <p className="text-xs font-semibold uppercase tracking-[0.15em]">{title}</p>
        {icon}
      </div>
      <p className="mt-2 font-mono text-2xl font-black text-[#F5F5F5]">{value}</p>
    </article>
  )
}
