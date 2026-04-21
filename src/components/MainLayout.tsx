import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { Mic, MicOff } from 'lucide-react'
import { useStore } from '../store/useStore'
import { usePedalboard, useInstrumentInput } from '../hooks/usePedalboard'
import Sidebar from './Sidebar'
import VolumeControl from './VolumeControl'

export default function MainLayout() {
  const activeTrackersLen = useStore((s) => s.activeTrackers.length)
  const addPracticeTime = useStore((s) => s.addPracticeTime)
  const globalToast = useStore((s) => s.globalToast)
  const showGlobalToast = useStore((s) => s.showGlobalToast)

  // Mantém o timbre/pedalboard ativo e audível mesmo trocando de rota.
  const { getInput } = usePedalboard()
  const mic = useInstrumentInput(getInput)

  useEffect(() => {
    if (!mic.error) return
    showGlobalToast(mic.error, 5200)
  }, [mic.error, showGlobalToast])

  useEffect(() => {
    if (activeTrackersLen === 0) return
    const id = window.setInterval(() => {
      addPracticeTime(1)
    }, 1000)
    return () => {
      window.clearInterval(id)
    }
  }, [activeTrackersLen, addPracticeTime])

  return (
    <div className="relative flex min-h-screen flex-col bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#1A1A1A] via-[#121212] to-[#121212] font-sans text-[#F5F5F5]">
      <header className="relative flex h-12 shrink-0 items-center justify-end border-b border-[#333333] bg-[#1A1A1A]/90 px-4 backdrop-blur-sm md:px-6">
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xs font-medium text-[#F5F5F5]/70">
          Desenvolvido por Caio Angelis
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              void mic.toggle()
            }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[#F5F5F5]/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:border-white/15 hover:bg-white/10 active:scale-[0.98]"
            aria-label={mic.isOpen ? 'Desligar microfone' : 'Ligar microfone'}
            title={mic.isOpen ? 'Microfone ligado (clique para mutar)' : 'Microfone desligado (clique para ligar)'}
          >
            {mic.isOpen ? (
              <Mic className="h-5 w-5" strokeWidth={2} aria-hidden />
            ) : (
              <MicOff className="h-5 w-5" strokeWidth={2} aria-hidden />
            )}
          </button>
          <VolumeControl />
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-h-0 flex-1 overflow-auto py-6 md:py-8 lg:py-10">
          <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>
      {globalToast ? (
        <div
          role="status"
          className="pointer-events-none fixed bottom-6 left-1/2 z-[100] max-w-md -translate-x-1/2 px-4"
        >
          <div className="rounded-xl border border-[#FFB300]/55 bg-[#1A1A1A]/95 px-4 py-3 text-center text-sm font-medium text-[#F5F5F5] shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-sm">
            <span className="text-[#FFB300]">Sucesso</span>
            <span className="mx-1.5 text-[#F5F5F5]/50">·</span>
            {globalToast}
          </div>
        </div>
      ) : null}
    </div>
  )
}
