import { useEffect, useMemo, useState } from 'react'
import { Loader2, Plus, X } from 'lucide-react'
import { useStore } from '../store/useStore'
import { usePedalboardStore } from '../store/pedalboardStore'
import { usePedalboard } from '../hooks/usePedalboard'

type BusyAction = 'fetch' | 'save' | 'load' | 'clear'

function slotLabel(slotIndex: number): string {
  return `Preset ${slotIndex}`
}

export function PresetManager() {
  const showGlobalToast = useStore((s) => s.showGlobalToast)

  const presets = usePedalboardStore((s) => s.presets)
  const fetchPresetsFromDB = usePedalboardStore((s) => s.fetchPresetsFromDB)
  const savePresetToDB = usePedalboardStore((s) => s.savePresetToDB)
  const loadPresetFromDB = usePedalboardStore((s) => s.loadPresetFromDB)
  const clearPresetSlotInDB = usePedalboardStore((s) => s.clearPresetSlotInDB)

  const { clearChain, rebuildNow } = usePedalboard()

  const [busy, setBusy] = useState<Record<number, BusyAction | null>>({})

  const anyBusy = useMemo(
    () => Object.values(busy).some((v) => v != null),
    [busy],
  )

  useEffect(() => {
    let cancelled = false
    setBusy((s) => ({ ...s, 0: 'fetch' }))
    void fetchPresetsFromDB()
      .catch(() => {
        // silencioso: se não houver sessão, não bloqueia a UI.
      })
      .finally(() => {
        if (cancelled) return
        setBusy((s) => ({ ...s, 0: null }))
      })
    return () => {
      cancelled = true
    }
  }, [fetchPresetsFromDB])

  async function run(slotIndex: number, action: BusyAction, fn: () => Promise<void>) {
    if (busy[slotIndex]) return
    setBusy((s) => ({ ...s, [slotIndex]: action }))
    try {
      await fn()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Operação falhou'
      showGlobalToast(msg)
    } finally {
      setBusy((s) => ({ ...s, [slotIndex]: null }))
    }
  }

  return (
    <section
      className="w-full rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm"
      aria-label="Presets do pedalboard"
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-[#F5F5F5]/70">
            Presets
          </p>
          <p className="mt-1 text-[11px] text-[#F5F5F5]/45">
            5 slots sincronizados no servidor. Salve e carregue instantaneamente.
          </p>
        </div>
        <div
          className={[
            'rounded-full border px-3 py-1.5 text-[11px] backdrop-blur-sm',
            anyBusy
              ? 'border-[#FFB300]/35 bg-[#121212]/50 text-[#F5F5F5]/70'
              : 'border-white/10 bg-[#121212]/40 text-[#F5F5F5]/45',
          ].join(' ')}
        >
          {anyBusy ? 'Sincronizando…' : 'Pronto'}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => {
          const slotIndex = i + 1
          const data = presets[i] ?? null
          const occupied = data !== null
          const isBusy = busy[slotIndex] != null
          const action = busy[slotIndex]

          return (
            <div
              key={slotIndex}
              className={[
                'relative overflow-hidden rounded-xl border p-3 backdrop-blur-sm transition',
                occupied
                  ? 'border-white/10 bg-[#1A1A1A]/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                  : 'border-white/20 border-dashed bg-transparent',
                isBusy ? 'ring-1 ring-[#FFB300]/25' : '',
              ].join(' ')}
            >
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.12]"
                style={{
                  backgroundImage: occupied
                    ? 'radial-gradient(circle at 25% 20%, rgba(255,179,0,0.35) 0%, transparent 60%)'
                    : 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.12) 0%, transparent 62%)',
                }}
                aria-hidden
              />

              <div className="relative flex h-full min-h-[84px] flex-col justify-between gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#F5F5F5]/45">
                      Slot {slotIndex}
                    </p>
                    <p className="mt-1 truncate font-mono text-xs text-[#F5F5F5]/85">
                      {slotLabel(slotIndex)}
                    </p>
                  </div>

                  {occupied ? (
                    <button
                      type="button"
                      onClick={() =>
                        void run(slotIndex, 'clear', async () => {
                          await clearPresetSlotInDB(slotIndex)
                          showGlobalToast(`Slot ${slotIndex} limpo.`)
                        })
                      }
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-[#F5F5F5]/70 transition hover:bg-white/10 hover:text-[#F5F5F5]"
                      aria-label={`Limpar slot ${slotIndex}`}
                      disabled={isBusy}
                    >
                      <X className="h-4 w-4" strokeWidth={2.5} />
                    </button>
                  ) : null}
                </div>

                {occupied ? (
                  <button
                    type="button"
                    onClick={() =>
                      void run(slotIndex, 'load', async () => {
                        await clearChain()
                        await loadPresetFromDB(slotIndex)
                        await rebuildNow()
                        showGlobalToast(`Preset carregado no slot ${slotIndex}.`)
                      })
                    }
                    className={[
                      'w-full rounded-lg py-2 text-[11px] font-bold uppercase tracking-wider transition',
                      'bg-[#FFB300] text-black hover:brightness-105 active:scale-[0.99]',
                      isBusy ? 'opacity-80' : '',
                    ].join(' ')}
                    disabled={isBusy}
                  >
                    Carregar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      void run(slotIndex, 'save', async () => {
                        await savePresetToDB(slotIndex)
                        showGlobalToast(`Preset salvo no slot ${slotIndex}.`)
                      })
                    }
                    className="group w-full rounded-lg border border-white/15 bg-white/5 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#F5F5F5]/80 transition hover:border-white/25 hover:bg-white/10 active:scale-[0.99]"
                    disabled={isBusy}
                  >
                    <span className="inline-flex items-center justify-center gap-2">
                      <Plus
                        className="h-4 w-4 text-[#FFB300]/90 transition group-hover:brightness-110"
                        strokeWidth={2.5}
                        aria-hidden
                      />
                      Salvar slot
                    </span>
                  </button>
                )}
              </div>

              {isBusy ? (
                <div
                  className="absolute inset-0 grid place-items-center bg-black/40 backdrop-blur-[2px]"
                  aria-hidden
                >
                  <div className="flex items-center gap-2 rounded-full border border-white/10 bg-[#121212]/70 px-3 py-1.5">
                    <Loader2 className="h-4 w-4 animate-spin text-[#FFB300]" />
                    <span className="text-xs text-[#F5F5F5]/75">
                      {action === 'save'
                        ? 'Salvando…'
                        : action === 'load'
                          ? 'Carregando…'
                          : action === 'clear'
                            ? 'Limpando…'
                            : 'Sincronizando…'}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}

