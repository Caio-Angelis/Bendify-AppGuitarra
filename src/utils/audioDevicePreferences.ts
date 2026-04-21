import * as Tone from 'tone'

const LS_MIC = 'guitar-app-audio-input-id'
const LS_OUT = 'guitar-app-audio-output-id'

/**
 * Lê o ID do microfone preferido salvo localmente.
 *
 * Regras de negócio: o app guarda a escolha do utilizador no `localStorage` para
 * reaplicar automaticamente na próxima sessão.
 *
 * @returns ID do dispositivo (string) ou `''` se não existir/der erro.
 */
export function getPreferredMicId(): string {
  try {
    return localStorage.getItem(LS_MIC) ?? ''
  } catch {
    return ''
  }
}

/**
 * Persiste o ID do microfone preferido.
 *
 * Regras de negócio: `id` vazio remove a preferência (volta ao padrão do browser).
 *
 * @param id - ID do dispositivo (como vindo de `MediaDeviceInfo.deviceId`).
 */
export function setPreferredMicId(id: string): void {
  try {
    if (id) localStorage.setItem(LS_MIC, id)
    else localStorage.removeItem(LS_MIC)
  } catch {
    /* ignore */
  }
}

/**
 * Lê o ID de saída de áudio preferido salvo localmente.
 *
 * @returns ID do dispositivo (string) ou `''` se não existir/der erro.
 */
export function getPreferredOutputId(): string {
  try {
    return localStorage.getItem(LS_OUT) ?? ''
  } catch {
    return ''
  }
}

/**
 * Persiste o ID de saída de áudio preferido.
 *
 * Regras de negócio: `id` vazio remove a preferência.
 *
 * @param id - ID do dispositivo (como vindo de `HTMLMediaElement.setSinkId`).
 */
export function setPreferredOutputId(id: string): void {
  try {
    if (id) localStorage.setItem(LS_OUT, id)
    else localStorage.removeItem(LS_OUT)
  } catch {
    /* ignore */
  }
}

/**
 * Indica se o browser suporta seleção explícita de dispositivo de saída.
 *
 * Regras de negócio: algumas plataformas expõem `AudioContext.prototype.setSinkId`.
 *
 * @returns `true` se `setSinkId` estiver disponível; caso contrário `false`.
 */
export function supportsAudioOutputSelection(): boolean {
  if (typeof AudioContext === 'undefined') return false
  const proto = AudioContext.prototype as unknown as {
    setSinkId?: (id: string) => Promise<void>
  }
  return typeof proto.setSinkId === 'function'
}

/**
 * Aplica o dispositivo de saída para o áudio do Tone.js (quando suportado).
 *
 * Regras de negócio: a app usa Tone.js; quando o browser suporta `setSinkId`,
 * redirecionamos o `rawContext` para o dispositivo escolhido.
 *
 * @param deviceId - ID do dispositivo de saída (string). Vazio → padrão.
 * @returns Promise resolvida quando aplicado (ou imediatamente se não suportado).
 */
export async function applyToneOutputDevice(deviceId: string): Promise<void> {
  await Tone.start()
  const raw = Tone.getContext().rawContext as AudioContext & {
    setSinkId?: (id: string) => Promise<void>
  }
  if (typeof raw.setSinkId !== 'function') return
  await raw.setSinkId(deviceId || '')
}
