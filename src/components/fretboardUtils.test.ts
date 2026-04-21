import { describe, expect, it } from 'vitest'
import {
  CHROMATIC,
  MAX_OPEN_FRETS,
  STRING_BASE_INDICES,
  STRING_LABELS,
  fretsForNoteOnString,
  noteAtStringFret,
} from './fretboardUtils'

describe('noteAtStringFret', () => {
  it('cordas ao ar (casa 0) seguem STRING_BASE_INDICES (Mi agudo = mesma classe que “e” na UI)', () => {
    for (let s = 0; s < 6; s += 1) {
      const open = noteAtStringFret(s, 0)
      expect(open).toBe(CHROMATIC[STRING_BASE_INDICES[s]])
      expect(open).toBe(STRING_LABELS[s].toUpperCase())
    }
  })

  it('subir 12 casas na mesma corda volta à mesma classe de altura', () => {
    for (let s = 0; s < 6; s += 1) {
      for (let f = 0; f <= MAX_OPEN_FRETS; f += 1) {
        const a = noteAtStringFret(s, f)
        const b = noteAtStringFret(s, f + 12)
        expect(a).toBe(b)
      }
    }
  })

  it('subir 1 casa avança um semitom na escala cromática', () => {
    expect(noteAtStringFret(0, 0)).toBe('E')
    expect(noteAtStringFret(0, 1)).toBe('F')
    expect(noteAtStringFret(2, 0)).toBe('D')
    expect(noteAtStringFret(2, 2)).toBe('E')
  })
})

describe('fretsForNoteOnString', () => {
  it('corda E grave: E em 0 e 12; Si na casa 7 (casa 5 é Lá)', () => {
    expect(fretsForNoteOnString(0, 'E').sort((a, b) => a - b)).toEqual([0, 12])
    expect(noteAtStringFret(0, 5)).toBe('A')
    expect(fretsForNoteOnString(0, 'B').sort((a, b) => a - b)).toEqual([7])
  })

  it('todas as casas devolvidas têm a classe de altura pedida', () => {
    const fSharpOnA = fretsForNoteOnString(1, 'F#')
    expect(fSharpOnA.every((f) => f >= 0 && f <= MAX_OPEN_FRETS)).toBe(true)
    expect(fSharpOnA.every((f) => noteAtStringFret(1, f) === 'F#')).toBe(true)
  })

  it('etiqueta fora de CHROMATIC nunca casa → []', () => {
    expect(fretsForNoteOnString(0, 'H')).toEqual([])
  })
  it('é consistente com noteAtStringFret para todas as combinações 0..12', () => {
    for (let s = 0; s < 6; s += 1) {
      for (let f = 0; f <= MAX_OPEN_FRETS; f += 1) {
        const name = noteAtStringFret(s, f)
        expect(fretsForNoteOnString(s, name).includes(f)).toBe(true)
      }
    }
  })
})
