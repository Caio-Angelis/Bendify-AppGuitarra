/** Tipos de efeito suportados pelo motor de roteamento (Tone.js). */
export type PedalType = 'distortion' | 'chorus' | 'delay' | 'reverb'

export type PedalInstance = {
  id: string
  type: PedalType
  /** Ligado = efeito na cadeia; desligado = bypass. */
  on: boolean
  /** Valores dos knobs (0–1). */
  values: Record<string, number>
}

/** Chaves de parâmetros persistidas na UI (0–1 nos sliders; o motor mapeia para unidades Tone). */
export type PedalParamKey =
  | 'drive'
  | 'tone'
  | 'rate'
  | 'depth'
  | 'mix'
  | 'time'
  | 'feedback'
  | 'decay'
  | 'preDelay'

export type PedalDefinition = {
  type: PedalType
  label: string
  /** Cor da faixa superior do cartão (Tailwind bg-* ou classe completa). */
  accentClass: string
  knobs: { key: PedalParamKey; label: string }[]
}

export const PEDAL_CATALOG: Record<PedalType, PedalDefinition> = {
  distortion: {
    type: 'distortion',
    label: 'Distorção',
    accentClass: 'bg-gradient-to-r from-orange-500/90 to-amber-600/70',
    knobs: [
      { key: 'drive', label: 'Drive' },
      { key: 'tone', label: 'Tom' },
    ],
  },
  chorus: {
    type: 'chorus',
    label: 'Chorus',
    accentClass: 'bg-gradient-to-r from-sky-500/90 to-blue-700/70',
    knobs: [
      { key: 'rate', label: 'Velocidade' },
      { key: 'depth', label: 'Profundidade' },
      { key: 'mix', label: 'Mix' },
    ],
  },
  delay: {
    type: 'delay',
    label: 'Delay',
    accentClass: 'bg-gradient-to-r from-emerald-500/90 to-teal-700/75',
    knobs: [
      { key: 'time', label: 'Tempo' },
      { key: 'feedback', label: 'Feedback' },
      { key: 'mix', label: 'Mix' },
    ],
  },
  reverb: {
    type: 'reverb',
    label: 'Reverb',
    accentClass: 'bg-gradient-to-r from-violet-500/80 to-indigo-700/65',
    knobs: [
      { key: 'decay', label: 'Decay' },
      { key: 'preDelay', label: 'Pre-delay' },
      { key: 'mix', label: 'Mix' },
    ],
  },
}

/** Valores iniciais dos knobs por tipo (0–1). */
export function defaultKnobsForType(type: PedalType): Record<string, number> {
  switch (type) {
    case 'distortion':
      return { drive: 0.35, tone: 0.5 }
    case 'chorus':
      return { rate: 0.35, depth: 0.45, mix: 0.35 }
    case 'delay':
      return { time: 0.35, feedback: 0.28, mix: 0.35 }
    case 'reverb':
      return { decay: 0.45, preDelay: 0.08, mix: 0.4 }
    default: {
      const _exhaustive: never = type
      return _exhaustive
    }
  }
}
