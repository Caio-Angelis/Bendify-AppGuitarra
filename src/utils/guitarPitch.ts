/** Nomes cromáticos (mesma ordem que no Afinador em `Tools.tsx`). */
export const CHROMATIC_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const

/**
 * Calcula o RMS (root mean square) de um buffer de áudio.
 *
 * Regras de negócio: usado para estimar "energia" do sinal (ex.: gate/silêncio)
 * em leituras do microfone para deteção de pitch.
 *
 * @param buf - Buffer mono em Float32 (amostras normalizadas em -1..1).
 * @returns RMS do buffer (0..1 típico, mas pode exceder se o buffer vier não normalizado).
 */
export function rmsFloat32(buf: Float32Array): number {
  let s = 0
  for (let i = 0; i < buf.length; i += 1) {
    const x = buf[i]
    s += x * x
  }
  return Math.sqrt(s / buf.length)
}

/**
 * Dobra uma frequência para a região típica de fundamentais de guitarra.
 *
 * Regras de negócio: a app trabalha melhor com pitches "equivalentes por oitava"
 * no intervalo aproximado 62–520 Hz, reduzindo/expandindo por potências de 2.
 *
 * @param freq - Frequência em Hz.
 * @returns Frequência dobrada/halved para cair no intervalo alvo; retorna o input se inválido.
 */
export function foldToGuitarFundamental(freq: number): number {
  if (!Number.isFinite(freq) || freq <= 0) return freq
  let f = freq
  while (f > 520) f /= 2
  while (f < 62) f *= 2
  return f
}

/**
 * Suaviza uma sequência de frequências com EMA (exponential moving average).
 *
 * Regras de negócio: reduz jitter do pitch detectado sem introduzir demasiada latência.
 *
 * @param prev - Valor anterior (ou `null` para inicializar).
 * @param next - Novo valor observado.
 * @param alpha - Peso do novo valor (0..1). Quanto maior, menos suavização.
 * @returns Valor suavizado.
 */
export function smoothPitchEMA(
  prev: number | null,
  next: number,
  alpha: number,
): number {
  if (prev === null) return next
  return prev * (1 - alpha) + next * alpha
}

/**
 * Converte frequência (Hz) para número MIDI (A4 = 440 Hz).
 *
 * @param freq - Frequência em Hz.
 * @returns Valor MIDI (float) ou `null` se a frequência for inválida.
 */
export function frequencyToMidi(freq: number): number | null {
  if (!Number.isFinite(freq) || freq <= 0) return null
  return 69 + 12 * Math.log2(freq / 440)
}

/**
 * Converte um MIDI (inteiro, tipicamente já arredondado) em nome cromático.
 *
 * @param midiRounded - Número MIDI (idealmente inteiro).
 * @returns Nome cromático (ex.: `C#`).
 */
export function midiToChromaticName(midiRounded: number): string {
  return CHROMATIC_NAMES[((midiRounded % 12) + 12) % 12]
}

/**
 * Produz uma etiqueta estilo afinador (`E2`) a partir de uma frequência.
 *
 * Regras de negócio: arredonda o MIDI para obter o semitom alvo e calcula a oitava
 * com base na convenção MIDI (\(C-1\) em 0).
 *
 * @param freq - Frequência em Hz.
 * @returns Objeto com `chromatic` e `label` (ex.: `{ chromatic: "E", label: "E2" }`)
 * ou `null` se a frequência for inválida.
 */
export function freqToTunerLabel(
  freq: number,
): import('../types/guitarPitch').TunerLabel | null {
  const midi = frequencyToMidi(freq)
  if (midi === null) return null
  const rounded = Math.round(midi)
  const chromatic = midiToChromaticName(rounded)
  const octave = Math.floor(rounded / 12) - 1
  return { chromatic, label: `${chromatic}${octave}` }
}

/**
 * Extrai a letra base de um nome cromático (`C#` → `C`).
 *
 * Regras de negócio: usado para comparar com alvos diatónicos ignorando sustenidos/bemóis.
 *
 * @param chromatic - Nome cromático (ex.: `C#`, `Bb`).
 * @returns Primeira letra ou string vazia se inválido.
 */
export function chromaticBaseLetter(chromatic: string): string {
  if (!chromatic) return ''
  return chromatic.charAt(0)
}
