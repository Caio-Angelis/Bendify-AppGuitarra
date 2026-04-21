import * as Tone from 'tone'
import type { PedalType } from '../types/pedalboard'

/**
 * Snapshot mínimo para reconstruir a cadeia (ordem, bypass e parâmetros).
 */
export type PedalRoutingSnapshot = {
  id: string
  type: PedalType
  on: boolean
  values: Record<string, number>
}

type DistortionUnit = {
  distortion: Tone.Distortion
  tone: Tone.Filter
}

type EffectUnit =
  | { kind: 'distortion'; unit: DistortionUnit }
  | { kind: 'chorus'; unit: Tone.Chorus }
  | { kind: 'delay'; unit: Tone.FeedbackDelay }
  | { kind: 'reverb'; unit: Tone.Reverb }

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

function mapToneHz(normalized: number): number {
  const t = clamp01(normalized)
  return 800 * Math.pow(10, (t - 0.5) * 0.8)
}

/**
 * Motor de roteamento dinâmico Tone.js: entrada → efeitos (ou bypass) → destino.
 */
export class AudioRoutingEngine {
  private readonly input: Tone.Gain

  private readonly bypassById = new Map<string, Tone.Gain>()

  private readonly effectById = new Map<string, EffectUnit>()

  private readonly generatedReverbIds = new Set<string>()

  private disposed = false

  constructor() {
    this.input = new Tone.Gain(1)
  }

  getInput(): Tone.Gain {
    return this.input
  }

  /**
   * Desconecta a cadeia atual e reconstrói: `Input → (efeito | bypass)* → Destination`.
   */
  rebuildChain(pedals: PedalRoutingSnapshot[]): void {
    if (this.disposed) return

    this.disconnectAllChainOutputs()

    const activeIds = new Set(pedals.map((p) => p.id))
    for (const id of [...this.effectById.keys()]) {
      if (!activeIds.has(id)) this.disposeEffectId(id)
    }
    for (const id of [...this.bypassById.keys()]) {
      if (!activeIds.has(id)) this.disposeBypassId(id)
    }

    let current: Tone.ToneAudioNode = this.input

    for (const p of pedals) {
      if (p.on) {
        const unit = this.ensureEffect(p.id, p.type)
        this.applyValues(unit, p.type, p.values)
        const inNode = this.effectInputNode(unit)
        const outNode = this.effectOutputNode(unit)
        current.connect(inNode)
        current = outNode
      } else {
        const bypass = this.ensureBypass(p.id)
        current.connect(bypass)
        current = bypass
      }
    }

    current.connect(Tone.getDestination())
  }

  updateEffectParam(
    effectId: string,
    paramName: string,
    value: number,
  ): void {
    if (this.disposed) return
    const unit = this.effectById.get(effectId)
    if (!unit) return

    const v = clamp01(value)

    switch (unit.kind) {
      case 'distortion': {
        const { distortion, tone } = unit.unit
        if (paramName === 'drive') distortion.distortion = v
        if (paramName === 'tone') tone.frequency.value = mapToneHz(v)
        break
      }
      case 'chorus': {
        const ch = unit.unit
        if (paramName === 'rate') ch.frequency.value = 0.1 + v * 7.9
        if (paramName === 'depth') ch.depth = v
        if (paramName === 'mix') ch.wet.value = v
        break
      }
      case 'delay': {
        const d = unit.unit
        if (paramName === 'time') d.delayTime.value = 0.02 + v * 0.78
        if (paramName === 'feedback') d.feedback.value = v * 0.92
        if (paramName === 'mix') d.wet.value = v
        break
      }
      case 'reverb': {
        const r = unit.unit
        if (paramName === 'decay') r.decay = 0.2 + v * 9.8
        if (paramName === 'preDelay') r.preDelay = v * 0.2
        if (paramName === 'mix') r.wet.value = v
        break
      }
      default: {
        const _exhaustive: never = unit
        return _exhaustive
      }
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disconnectAllChainOutputs()
    this.input.disconnect()
    for (const id of [...this.effectById.keys()]) this.disposeEffectId(id)
    for (const id of [...this.bypassById.keys()]) this.disposeBypassId(id)
    this.input.dispose()
    this.disposed = true
  }

  private disconnectAllChainOutputs(): void {
    this.input.disconnect()
    for (const g of this.bypassById.values()) {
      g.disconnect()
    }
    for (const u of this.effectById.values()) {
      this.effectOutputNode(u).disconnect()
    }
  }

  private ensureBypass(id: string): Tone.Gain {
    let g = this.bypassById.get(id)
    if (!g) {
      g = new Tone.Gain(1)
      this.bypassById.set(id, g)
    }
    return g
  }

  private disposeBypassId(id: string): void {
    const g = this.bypassById.get(id)
    if (!g) return
    g.disconnect()
    g.dispose()
    this.bypassById.delete(id)
  }

  private disposeEffectId(id: string): void {
    const u = this.effectById.get(id)
    if (!u) return
    switch (u.kind) {
      case 'distortion': {
        u.unit.distortion.disconnect()
        u.unit.tone.disconnect()
        u.unit.distortion.dispose()
        u.unit.tone.dispose()
        break
      }
      case 'chorus':
      case 'delay':
      case 'reverb': {
        u.unit.disconnect()
        u.unit.dispose()
        break
      }
      default: {
        const _e: never = u
        return _e
      }
    }
    this.effectById.delete(id)
    this.generatedReverbIds.delete(id)
  }

  private ensureEffect(id: string, type: PedalType): EffectUnit {
    const existing = this.effectById.get(id)
    if (existing && existing.kind === type) return existing
    if (existing) this.disposeEffectId(id)

    let created: EffectUnit
    switch (type) {
      case 'distortion': {
        const distortion = new Tone.Distortion(0.4)
        const tone = new Tone.Filter(mapToneHz(0.5), 'lowpass')
        distortion.connect(tone)
        created = { kind: 'distortion', unit: { distortion, tone } }
        break
      }
      case 'chorus': {
        const chorus = new Tone.Chorus({
          frequency: 2,
          delayTime: 3.5,
          depth: 0.45,
          wet: 0.35,
        }).start()
        created = { kind: 'chorus', unit: chorus }
        break
      }
      case 'delay': {
        const delay = new Tone.FeedbackDelay({
          delayTime: 0.25,
          feedback: 0.28,
          wet: 0.35,
        })
        created = { kind: 'delay', unit: delay }
        break
      }
      case 'reverb': {
        const reverb = new Tone.Reverb({
          decay: 2.5,
          preDelay: 0.02,
          wet: 0.4,
        })
        created = { kind: 'reverb', unit: reverb }
        if (!this.generatedReverbIds.has(id)) {
          void reverb.generate().then(() => {
            this.generatedReverbIds.add(id)
          })
        }
        break
      }
      default: {
        const _ex: never = type
        return _ex
      }
    }
    this.effectById.set(id, created)
    return created
  }

  private effectInputNode(u: EffectUnit): Tone.ToneAudioNode {
    switch (u.kind) {
      case 'distortion':
        return u.unit.distortion
      case 'chorus':
      case 'delay':
      case 'reverb':
        return u.unit
      default: {
        const _e: never = u
        return _e
      }
    }
  }

  private effectOutputNode(u: EffectUnit): Tone.ToneAudioNode {
    switch (u.kind) {
      case 'distortion':
        return u.unit.tone
      case 'chorus':
      case 'delay':
      case 'reverb':
        return u.unit
      default: {
        const _e: never = u
        return _e
      }
    }
  }

  private applyValues(
    unit: EffectUnit,
    type: PedalType,
    values: Record<string, number>,
  ): void {
    const v = (k: string, d: number) => clamp01(values[k] ?? d)

    switch (type) {
      case 'distortion':
        if (unit.kind === 'distortion') {
          unit.unit.distortion.distortion = v('drive', 0.35)
          unit.unit.tone.frequency.value = mapToneHz(v('tone', 0.5))
        }
        break
      case 'chorus':
        if (unit.kind === 'chorus') {
          unit.unit.frequency.value = 0.1 + v('rate', 0.35) * 7.9
          unit.unit.depth = v('depth', 0.45)
          unit.unit.wet.value = v('mix', 0.35)
        }
        break
      case 'delay':
        if (unit.kind === 'delay') {
          unit.unit.delayTime.value = 0.02 + v('time', 0.35) * 0.78
          unit.unit.feedback.value = v('feedback', 0.28) * 0.92
          unit.unit.wet.value = v('mix', 0.35)
        }
        break
      case 'reverb':
        if (unit.kind === 'reverb') {
          unit.unit.decay = 0.2 + v('decay', 0.45) * 9.8
          unit.unit.preDelay = v('preDelay', 0.08) * 0.2
          unit.unit.wet.value = v('mix', 0.4)
        }
        break
      default: {
        const _ex: never = type
        return _ex
      }
    }
  }
}
