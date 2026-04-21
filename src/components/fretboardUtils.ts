export const CHROMATIC = [
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
  'C',
  'C#',
  'D',
  'D#',
] as const

// Índice da nota solta (casa 0) de cada corda em `CHROMATIC`.
// Afinação padrão: E A D G B e
export const STRING_BASE_INDICES = [0, 5, 10, 3, 7, 0] as const
export const STRING_LABELS = ['E', 'A', 'D', 'G', 'B', 'e'] as const

export const MAX_OPEN_FRETS = 12

export function noteAtStringFret(stringIndex: number, fret: number): string {
  const base = STRING_BASE_INDICES[stringIndex]
  return CHROMATIC[(base + fret) % 12]
}

/** Todas as casas 0..12 em que a nota aparece nesta corda. */
export function fretsForNoteOnString(
  stringIndex: number,
  pitchClass: string,
): number[] {
  const out: number[] = []
  for (let f = 0; f <= MAX_OPEN_FRETS; f++) {
    if (noteAtStringFret(stringIndex, f) === pitchClass) out.push(f)
  }
  return out
}

