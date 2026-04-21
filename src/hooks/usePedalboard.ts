import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import * as Tone from 'tone'
import { AudioRoutingEngine } from '../services/AudioRoutingEngine'
import { usePedalboardStore } from '../store/pedalboardStore'
import { getPreferredMicId } from '../utils/audioDevicePreferences'

/**
 * Liga o estado do pedalboard ao `AudioRoutingEngine`.
 * Rebuild apenas quando mudam ordem, tipos ou bypass; knobs usam `updateEffectParam`.
 */
let globalEngine: AudioRoutingEngine | null = null
let globalToneStarted = false

function ensureGlobalEngine(): AudioRoutingEngine {
  globalEngine ??= new AudioRoutingEngine()
  return globalEngine
}

async function ensureGlobalToneStarted() {
  if (globalToneStarted) return
  await Tone.start()
  globalToneStarted = true
}

export function usePedalboard() {
  // Mantemos um ref apenas para compatibilidade do retorno (e debug), mas o engine é global.
  const engineRef = useRef<AudioRoutingEngine | null>(null)

  const pedals = usePedalboardStore((s) => s.pedals)

  const chainSignature = useMemo(
    () => pedals.map((p) => `${p.id}:${p.type}:${p.on ? 1 : 0}`).join('>'),
    [pedals],
  )

  useEffect(() => {
    const engine = ensureGlobalEngine()
    engineRef.current = engine

    let cancelled = false

    void ensureGlobalToneStarted()
      .then(() => {
        if (cancelled) return
        const list = usePedalboardStore.getState().pedals
        engine.rebuildChain(
          list.map((p) => ({
            id: p.id,
            type: p.type,
            on: p.on,
            values: p.values,
          })),
        )
      })
      .catch((e) => {
        console.warn('usePedalboard: Tone.start falhou', e)
      })

    return () => {
      cancelled = true
    }
  }, [chainSignature])

  const updateEffectParam = useCallback(
    (effectId: string, paramName: string, value: number) => {
      ensureGlobalEngine().updateEffectParam(effectId, paramName, value)
    },
    [],
  )

  const getInput = useCallback(() => ensureGlobalEngine().getInput(), [])

  const rebuildNow = useCallback(async () => {
    try {
      await ensureGlobalToneStarted()
      const engine = ensureGlobalEngine()
      const list = usePedalboardStore.getState().pedals
      engine.rebuildChain(
        list.map((p) => ({
          id: p.id,
          type: p.type,
          on: p.on,
          values: p.values,
        })),
      )
    } catch (e) {
      console.warn('usePedalboard: rebuildNow falhou', e)
    }
  }, [])

  const clearChain = useCallback(async () => {
    try {
      await ensureGlobalToneStarted()
      ensureGlobalEngine().rebuildChain([])
    } catch (e) {
      console.warn('usePedalboard: clearChain falhou', e)
    }
  }, [])

  return {
    engine: engineRef,
    updateEffectParam,
    getInput,
    rebuildNow,
    clearChain,
  }
}

type InstrumentOpenErrorCode = 'permission_denied' | 'no_device' | 'unknown'

function classifyInstrumentError(e: unknown): InstrumentOpenErrorCode {
  const name = (e as { name?: unknown } | null)?.name
  const msg = (e as { message?: unknown } | null)?.message
  const n = typeof name === 'string' ? name : ''
  const m = typeof msg === 'string' ? msg : ''

  if (n === 'NotAllowedError' || n === 'PermissionDeniedError') return 'permission_denied'
  if (n === 'NotFoundError' || m.toLowerCase().includes('notfound')) return 'no_device'
  return 'unknown'
}

/** Uma única instância partilhada: evita desligar o microfone ao trocar de rota ou ao desmontar um segundo consumidor (ex.: pedalboard em Tons). */
let sharedInstrumentMic: Tone.UserMedia | null = null
let sharedInstrumentOpen = false
let sharedInstrumentError: string | null = null
const instrumentInputListeners = new Set<() => void>()

function notifyInstrumentInputListeners() {
  instrumentInputListeners.forEach((fn) => {
    fn()
  })
}

function disposeSharedInstrumentMic() {
  const mic = sharedInstrumentMic
  if (!mic) return
  try {
    mic.disconnect()
    mic.close()
  } catch {
    /* noop */
  }
  try {
    mic.dispose()
  } catch {
    /* noop */
  }
  sharedInstrumentMic = null
}

/**
 * Captura entrada do instrumento via `Tone.UserMedia` e roteia para `getInput()`.
 * Importante: desliga processing nativo (eco/AGC/noise) para não "estragar" timbre.
 * O microfone só é desligado quando o utilizador pede explicitamente (ou falha grave).
 */
export function useInstrumentInput(getInput: () => Tone.Gain) {
  const getInputRef = useRef(getInput)
  getInputRef.current = getInput

  const [, bump] = useReducer((n: number) => n + 1, 0)

  useEffect(() => {
    const sub = () => bump()
    instrumentInputListeners.add(sub)
    return () => {
      instrumentInputListeners.delete(sub)
    }
  }, [])

  // Se a cadeia de áudio for reconstruída, volta a ligar ao nó de entrada atual.
  useEffect(() => {
    if (!sharedInstrumentOpen || !sharedInstrumentMic) return
    try {
      const input = getInput()
      sharedInstrumentMic.disconnect()
      sharedInstrumentMic.connect(input)
    } catch {
      /* noop */
    }
  }, [getInput])

  const close = useCallback(async () => {
    if (!sharedInstrumentMic && !sharedInstrumentOpen) return
    disposeSharedInstrumentMic()
    sharedInstrumentOpen = false
    sharedInstrumentError = null
    notifyInstrumentInputListeners()
  }, [])

  const open = useCallback(async () => {
    sharedInstrumentError = null
    notifyInstrumentInputListeners()
    await Tone.start()

    const mic = sharedInstrumentMic ?? new Tone.UserMedia()
    sharedInstrumentMic = mic

    try {
      const audio: MediaTrackConstraints = {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      }
      const micId = getPreferredMicId()
      if (micId) {
        audio.deviceId = { exact: micId }
      }

      await (
        mic.open as unknown as (constraints?: MediaStreamConstraints) => Promise<void>
      )({
        audio,
      })

      const input = getInputRef.current()
      mic.disconnect()
      mic.connect(input)
      sharedInstrumentOpen = true
      notifyInstrumentInputListeners()
    } catch (e) {
      disposeSharedInstrumentMic()
      sharedInstrumentOpen = false
      const code = classifyInstrumentError(e)
      if (code === 'permission_denied') {
        sharedInstrumentError =
          'Permissão de microfone negada. Habilite o acesso ao input na barra do navegador.'
      } else if (code === 'no_device') {
        sharedInstrumentError =
          'Nenhuma interface/entrada encontrada. Conecte um dispositivo e tente novamente.'
      } else {
        sharedInstrumentError = 'Falha ao ligar instrumento. Tente novamente.'
      }
      notifyInstrumentInputListeners()
      throw e
    }
  }, [])

  const toggle = useCallback(async () => {
    if (sharedInstrumentOpen) return await close()
    return await open()
  }, [close, open])

  return {
    isOpen: sharedInstrumentOpen,
    error: sharedInstrumentError,
    open,
    close,
    toggle,
  }
}
