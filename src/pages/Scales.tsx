import { useMemo, useState } from 'react'
import Fretboard from '../components/Fretboard'
import { useStore } from '../store/useStore'

const SCALE_OPTIONS = [
  'Am Pentatônica',
  'C Maior',
  'E Blues',
  'G Menor Pentatônica',
  'D Mixolídio',
] as const

/**
 * IMPORTANTE:
 * O `Fretboard` opera com nomes cromáticos vindo de `noteAtStringFret` (`E, F, F#, ...`).
 * Para evitar desencontros de "pitch class" (ex.: arrays baseados em C), aqui usamos diretamente
 * as notas (strings) que o `Fretboard` produz.
 */
const SCALE_NOTES: Record<(typeof SCALE_OPTIONS)[number], readonly string[]> = {
  'Am Pentatônica': ['A', 'C', 'D', 'E', 'G'],
  'C Maior': ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
  // E blues = E menor pentatônica + b5 (Bb/A#)
  'E Blues': ['E', 'G', 'A', 'A#', 'B', 'D'],
  'G Menor Pentatônica': ['G', 'A#', 'C', 'D', 'F'],
  // D mixolídio = D E F# G A B C
  'D Mixolídio': ['D', 'E', 'F#', 'G', 'A', 'B', 'C'],
}

const ROOT_BY_SCALE: Record<(typeof SCALE_OPTIONS)[number], string> = {
  'Am Pentatônica': 'A',
  'C Maior': 'C',
  'E Blues': 'E',
  'G Menor Pentatônica': 'G',
  'D Mixolídio': 'D',
}

export default function Scales() {
  const [scaleName, setScaleName] =
    useState<(typeof SCALE_OPTIONS)[number]>('Am Pentatônica')
  const activeChord = useStore((s) => s.activeChord)

  const activePitchClasses = useMemo(() => {
    return SCALE_NOTES[scaleName]
  }, [scaleName])

  const rootPitchClass = ROOT_BY_SCALE[scaleName]

  return (
    <div className="space-y-6">
      <h1 className="font-mono text-2xl font-semibold tracking-tight md:text-3xl">
        Escalas
      </h1>

      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <label className="flex flex-col gap-1.5 text-sm text-[#F5F5F5]/80">
          <span className="font-medium text-[#F5F5F5]">Escala</span>
          <select
            value={scaleName}
            onChange={(e) =>
              setScaleName(e.target.value as (typeof SCALE_OPTIONS)[number])
            }
            className="min-w-[14rem] rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-sans text-[#F5F5F5] outline-none backdrop-blur-sm transition duration-200 ease-in-out focus:border-[#FFB300]/50 focus:ring-1 focus:ring-[#FFB300]/30 bg-[#1A1A1A] text-white"
            aria-label="Selecionar escala"
          >
            {SCALE_OPTIONS.map((name) => (
              <option key={name} value={name} className="bg-[#1A1A1A] text-white">
                {name}
              </option>
            ))}
          </select>
        </label>
        <p className="font-mono text-sm text-[#F5F5F5]/70">
          Acorde ativo (player):{' '}
          <span className="text-[#FFB300]">
            {activeChord.trim() ? activeChord : '—'}
          </span>
        </p>
      </div>

      <Fretboard
        maxFrets={22}
        activePitchClasses={activePitchClasses}
        rootPitchClass={rootPitchClass}
      />
    </div>
  )
}
