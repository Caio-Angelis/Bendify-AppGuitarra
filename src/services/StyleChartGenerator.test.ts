import { describe, expect, it } from 'vitest'
import { styleChartGenerator } from './StyleChartGenerator'

describe('StyleChartGenerator', () => {
  it('gera segmento determinístico com mesmo seed/parâmetros', () => {
    const a = styleChartGenerator.generateSegment({
      style: 'blues',
      key: 'A',
      bpm: 96,
      difficulty: 3,
      segmentIndex: 1,
      seed: 123,
    })
    const b = styleChartGenerator.generateSegment({
      style: 'blues',
      key: 'A',
      bpm: 96,
      difficulty: 3,
      segmentIndex: 1,
      seed: 123,
    })
    expect(a.notes).toEqual(b.notes)
  })

  it('metal tende a gerar mais notas que bossa no mesmo tier', () => {
    const metal = styleChartGenerator.generateSegment({
      style: 'metal',
      key: 'E',
      bpm: 120,
      difficulty: 6,
      segmentIndex: 0,
      seed: 77,
    })
    const bossa = styleChartGenerator.generateSegment({
      style: 'bossa',
      key: 'E',
      bpm: 120,
      difficulty: 6,
      segmentIndex: 0,
      seed: 77,
    })
    expect(metal.notes.length).toBeGreaterThanOrEqual(bossa.notes.length)
  })
})
