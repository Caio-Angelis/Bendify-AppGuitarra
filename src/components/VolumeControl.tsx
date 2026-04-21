import { useEffect } from 'react'
import { Volume2, Volume1, VolumeX } from 'lucide-react'
import { useStore } from '../store/useStore'

type ToneNs = typeof import('tone')

let toneModulePromise: Promise<ToneNs> | null = null
function getToneModule(): Promise<ToneNs> {
  toneModulePromise ??= import('tone')
  return toneModulePromise
}

function applyMasterVolume(Tone: ToneNs, linear: number) {
  const dest = Tone.getDestination()
  const v = Math.min(1, Math.max(0, linear))
  if (v < 0.0001) {
    dest.mute = true
  } else {
    dest.mute = false
    dest.volume.value = 20 * Math.log10(v)
  }
}

export default function VolumeControl() {
  const masterVolume = useStore((s) => s.masterVolume)
  const setMasterVolume = useStore((s) => s.setMasterVolume)

  useEffect(() => {
    let cancelled = false
    void getToneModule()
      .then((Tone) => {
        if (cancelled) return
        try {
          applyMasterVolume(Tone, masterVolume)
        } catch (e) {
          console.warn('VolumeControl: não foi possível aplicar o volume', e)
        }
      })
      .catch((e) => {
        console.warn('VolumeControl: Tone.js indisponível', e)
      })
    return () => {
      cancelled = true
    }
  }, [masterVolume])

  const Icon =
    masterVolume < 0.0001
      ? VolumeX
      : masterVolume < 0.45
        ? Volume1
        : Volume2

  return (
    <div className="flex items-center gap-3">
      <label htmlFor="app-master-volume" className="sr-only">
        Volume geral
      </label>
      <Icon
        className="h-5 w-5 shrink-0 text-[#F5F5F5]/80"
        strokeWidth={2}
        aria-hidden
      />
      <input
        id="app-master-volume"
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={masterVolume}
        onChange={(e) => setMasterVolume(Number(e.target.value))}
        className="h-1.5 w-28 cursor-pointer appearance-none rounded-full bg-[#333333] accent-[#FFB300] md:w-40 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#FFB300]"
      />
      <span className="w-9 tabular-nums text-xs text-[#F5F5F5]/55">
        {Math.round(masterVolume * 100)}%
      </span>
    </div>
  )
}
