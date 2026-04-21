import { describe, expect, it } from 'vitest'
import {
  CHROMATIC_NAMES,
  chromaticBaseLetter,
  foldToGuitarFundamental,
  freqToTunerLabel,
  frequencyToMidi,
  midiToChromaticName,
  rmsFloat32,
  smoothPitchEMA,
} from './guitarPitch'

/** 12-TET: MIDI 60 = C4. */
const C4_HZ = 440 * 2 ** ((60 - 69) / 12)
/** MIDI 69 = A4 */
const A4_HZ = 440

describe('frequencyToMidi', () => {
  it('mapeia A4 (440 Hz) exatamente para MIDI 69', () => {
    expect(frequencyToMidi(A4_HZ)).toBe(69)
  })

  it('mapeia C4 para MIDI 60 com precisão numérica', () => {
    const m = frequencyToMidi(C4_HZ)
    expect(m).not.toBeNull()
    expect(m!).toBeCloseTo(60, 12)
  })

  it('é inversa da fórmula 12-TET: f = 440 * 2^((midi-69)/12)', () => {
    for (const midi of [21, 48, 60, 69, 72, 96, 108]) {
      const f = 440 * 2 ** ((midi - 69) / 12)
      const back = frequencyToMidi(f)
      expect(back).toBeCloseTo(midi, 12)
    }
  })

  it('devolve null para não finitos ou não positivos', () => {
    expect(frequencyToMidi(NaN)).toBeNull()
    expect(frequencyToMidi(Number.POSITIVE_INFINITY)).toBeNull()
    expect(frequencyToMidi(Number.NEGATIVE_INFINITY)).toBeNull()
    expect(frequencyToMidi(0)).toBeNull()
    expect(frequencyToMidi(-1)).toBeNull()
  })

  it('mantém precisão em uma faixa ampla (varredura de MIDI inteiros)', () => {
    for (let midi = 0; midi <= 127; midi += 1) {
      const f = 440 * 2 ** ((midi - 69) / 12)
      const back = frequencyToMidi(f)
      expect(back).not.toBeNull()
      expect(back!).toBeCloseTo(midi, 12)
    }
  })

  it('é monotónica crescente (freq maior => MIDI maior)', () => {
    const a = frequencyToMidi(220)!
    const b = frequencyToMidi(440)!
    const c = frequencyToMidi(880)!
    expect(a).toBeLessThan(b)
    expect(b).toBeLessThan(c)
  })

  it('1 oitava = +12 semitons (razão 2x em Hz)', () => {
    const m1 = frequencyToMidi(110)!
    const m2 = frequencyToMidi(220)!
    const m3 = frequencyToMidi(440)!
    expect(m2 - m1).toBeCloseTo(12, 12)
    expect(m3 - m2).toBeCloseTo(12, 12)
  })

  it('1 semitom = multiplicar por 2^(1/12) em Hz', () => {
    const base = 440
    const step = base * 2 ** (1 / 12)
    expect(frequencyToMidi(step)! - frequencyToMidi(base)!).toBeCloseTo(1, 12)
  })
})

describe('midiToChromaticName', () => {
  it('percorre CHROMATIC_NAMES para oitavas inteiras (MIDI 60, 72, …)', () => {
    expect(midiToChromaticName(60)).toBe('C')
    expect(midiToChromaticName(61)).toBe('C#')
    expect(midiToChromaticName(69)).toBe('A')
    expect(midiToChromaticName(71)).toBe('B')
    expect(midiToChromaticName(72)).toBe('C')
  })

  it('normaliza índice para MIDI negativos e grandes', () => {
    expect(midiToChromaticName(-1)).toBe('B')
    expect(midiToChromaticName(-13)).toBe('B')
    expect(midiToChromaticName(600)).toBe(CHROMATIC_NAMES[600 % 12])
  })

  it('cobre todos os 12 nomes cromáticos para uma oitava', () => {
    const out = Array.from({ length: 12 }, (_, i) => midiToChromaticName(60 + i))
    expect(out).toEqual([...CHROMATIC_NAMES])
  })
})

describe('freqToTunerLabel', () => {
  it('rotula A4 (440 Hz): MIDI 69 → A4 (oitava = floor(midi/12)-1)', () => {
    const r = freqToTunerLabel(440)
    expect(r).not.toBeNull()
    expect(r!.chromatic).toBe('A')
    expect(r!.label).toBe('A4')
  })

  it('rotula C4 (261.63… Hz): MIDI 60 → C4', () => {
    const r = freqToTunerLabel(C4_HZ)
    expect(r).not.toBeNull()
    expect(r!.label).toBe('C4')
  })

  it('devolve null quando frequencyToMidi falha', () => {
    expect(freqToTunerLabel(0)).toBeNull()
    expect(freqToTunerLabel(-10)).toBeNull()
  })

  it('arredonda MIDI para o mais próximo (limiar em meia unidade)', () => {
    // Frequência de A4, mas 49 cents acima (~0.49 semitom) ainda deve arredondar para A4.
    const belowHalf = 440 * 2 ** (0.49 / 12)
    const r1 = freqToTunerLabel(belowHalf)
    expect(r1).not.toBeNull()
    expect(r1!.label).toBe('A4')

    // 51 cents acima (> 0.5 semitom) deve arredondar para A#4.
    const aboveHalf = 440 * 2 ** (0.51 / 12)
    const r2 = freqToTunerLabel(aboveHalf)
    expect(r2).not.toBeNull()
    expect(r2!.chromatic).toBe('A#')
    expect(r2!.label).toBe('A#4')
  })

  it('calcula oitava corretamente em limiares (C4=60 e B3=59)', () => {
    const b3 = 440 * 2 ** ((59 - 69) / 12)
    const r = freqToTunerLabel(b3)
    expect(r).not.toBeNull()
    expect(r!.label).toBe('B3')
  })
})

describe('foldToGuitarFundamental', () => {
  it('preserva não finitos ou não positivos (retorna o mesmo valor de entrada)', () => {
    expect(foldToGuitarFundamental(NaN)).toBe(NaN)
    expect(foldToGuitarFundamental(Number.POSITIVE_INFINITY)).toBe(
      Number.POSITIVE_INFINITY,
    )
    expect(foldToGuitarFundamental(0)).toBe(0)
    expect(foldToGuitarFundamental(-5)).toBe(-5)
  })

  it('divide por 2 enquanto > 520 (1040 → 520 num passo; 2080 → 520 em dois)', () => {
    expect(foldToGuitarFundamental(1040)).toBe(520)
    expect(foldToGuitarFundamental(2080)).toBeCloseTo(520, 10)
    expect(foldToGuitarFundamental(521)).toBeCloseTo(260.5, 10)
    expect(foldToGuitarFundamental(520)).toBe(520)
  })

  it('multiplica por 2 enquanto < 62', () => {
    expect(foldToGuitarFundamental(31)).toBe(62)
    expect(foldToGuitarFundamental(61.9)).toBeCloseTo(123.8, 5)
    expect(foldToGuitarFundamental(62)).toBe(62)
  })

  it('mantém faixa típica de corda sem alterar', () => {
    expect(foldToGuitarFundamental(82.41)).toBeCloseTo(82.41, 5)
  })

  it('nunca devolve valor fora do intervalo (62..520) para entradas válidas', () => {
    for (const f of [1, 10, 30, 61.999, 62, 63, 100, 520, 521, 1040, 4000]) {
      const out = foldToGuitarFundamental(f)
      if (!Number.isFinite(f) || f <= 0) continue
      expect(out).toBeGreaterThanOrEqual(62)
      expect(out).toBeLessThanOrEqual(520)
    }
  })
})

describe('smoothPitchEMA', () => {
  it('sem histórico, devolve next', () => {
    expect(smoothPitchEMA(null, 440, 0.3)).toBe(440)
  })

  it('alpha = 1 ignora prev', () => {
    expect(smoothPitchEMA(100, 200, 1)).toBe(200)
  })

  it('alpha = 0 mantém prev', () => {
    expect(smoothPitchEMA(100, 200, 0)).toBe(100)
  })

  it('interpola linearmente (EMA)', () => {
    expect(smoothPitchEMA(100, 200, 0.5)).toBe(150)
  })

  it('alpha fora de [0,1] não é clampado (comportamento atual)', () => {
    expect(smoothPitchEMA(100, 200, 2)).toBe(300)
    expect(smoothPitchEMA(100, 200, -1)).toBe(0)
  })
})

describe('rmsFloat32', () => {
  it('RMS de sinal constante = |amplitude|', () => {
    const buf = new Float32Array([0.5, 0.5, 0.5, 0.5])
    expect(rmsFloat32(buf)).toBeCloseTo(0.5, 10)
  })

  it('array vazio produz NaN (0/0)', () => {
    expect(rmsFloat32(new Float32Array(0))).toBeNaN()
  })

  it('silêncio = 0', () => {
    expect(rmsFloat32(new Float32Array([0, 0, 0]))).toBe(0)
  })

  it('RMS é sempre não negativo, mesmo com amostras negativas', () => {
    const buf = new Float32Array([-1, -1, -1, -1])
    expect(rmsFloat32(buf)).toBeCloseTo(1, 10)
  })
})

describe('chromaticBaseLetter', () => {
  it('primeira letra de notas com sustenido', () => {
    expect(chromaticBaseLetter('C#')).toBe('C')
    expect(chromaticBaseLetter('A#')).toBe('A')
  })

  it('string vazia → string vazia', () => {
    expect(chromaticBaseLetter('')).toBe('')
  })

  it('apenas retorna o primeiro caractere (não valida formato)', () => {
    expect(chromaticBaseLetter('Bb')).toBe('B')
    expect(chromaticBaseLetter('G♯')).toBe('G')
    expect(chromaticBaseLetter('1')).toBe('1')
  })
})

describe('freqToTunerLabel — frequências extremas e “nota errada”', () => {
  it('frequências muito baixas/altas ainda produzem etiqueta se MIDI for finito', () => {
    const veryLow = freqToTunerLabel(65)
    expect(veryLow).not.toBeNull()
    expect(veryLow!.label).toMatch(/^[A-G]#?[0-9]+$/)

    const veryHigh = freqToTunerLabel(900)
    expect(veryHigh).not.toBeNull()
  })

  it('entre dois MIDI, o arredondamento pode saltar para cromático diferente (limiar)', () => {
    const hzBetweenAandBb = 440 * 2 ** (0.25 / 12)
    const r = freqToTunerLabel(hzBetweenAandBb)
    expect(r).not.toBeNull()
    expect(['A', 'A#']).toContain(r!.chromatic)
  })
})

describe('foldToGuitarFundamental — limites 62 e 520 Hz', () => {
  it('f=62 e f=520 permanecem na faixa sem alteração', () => {
    expect(foldToGuitarFundamental(62)).toBe(62)
    expect(foldToGuitarFundamental(520)).toBe(520)
  })

  it('521 Hz é dobrado até ≤520 (harmónico percebido como fundamental)', () => {
    expect(foldToGuitarFundamental(521)).toBeCloseTo(260.5, 5)
  })
})

describe('rmsFloat32 — ruído e sinais “difíceis”', () => {
  it('sinal quadrado ±1 tem RMS 1 (como ruído de amplitude máxima)', () => {
    const buf = new Float32Array(256)
    for (let i = 0; i < buf.length; i += 1) {
      buf[i] = i % 2 === 0 ? 1 : -1
    }
    expect(rmsFloat32(buf)).toBeCloseTo(1, 5)
  })

  it('buffer pequeno pseudo-aleatório mantém RMS entre 0 e 1 (amostras em [-1,1])', () => {
    const buf = new Float32Array(64)
    for (let i = 0; i < buf.length; i += 1) {
      buf[i] = Math.sin(i * 12.9898) * 0.37
    }
    const r = rmsFloat32(buf)
    expect(r).toBeGreaterThan(0)
    expect(r).toBeLessThanOrEqual(0.37)
  })
})

describe('smoothPitchEMA — saltos grandes (deteção instável)', () => {
  it('com alpha alto segue saltos rápidos (ex.: oitava)', () => {
    const a = smoothPitchEMA(440, 880, 0.95)
    expect(a).toBeCloseTo(440 + 0.95 * 440, 5)
  })

  it('com alpha baixo atenua saltos (comportamento anti-spike)', () => {
    const a = smoothPitchEMA(440, 880, 0.05)
    expect(a).toBeCloseTo(440 + 0.05 * 440, 5)
  })
})
