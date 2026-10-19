/**
 * Dónde corre la app: navegador (y web app instalada en el móvil) o Tauri (Windows).
 * El resto del código no pregunta: usa estas funciones y cada plataforma hace lo suyo.
 */
export type Runtime = 'web' | 'tauri'

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
  }
}

export const runtime: Runtime = typeof window !== 'undefined' && window.__TAURI_INTERNALS__ ? 'tauri' : 'web'

export const isNative = runtime !== 'web'

export type SaveResult = 'saved' | 'shared' | 'cancelled'

/**
 * Guarda un archivo generado por la app (texto, o binario como un PDF o un Excel). Windows: «Guardar como».
 * Navegador: en móvil, hoja de compartir (Archivos, Drive, WhatsApp…) si se puede; si no, descarga.
 */
export async function saveFile(fileName: string, content: string | Uint8Array, mime: string): Promise<SaveResult> {
  if (runtime === 'tauri') {
    const { invoke } = await import('@tauri-apps/api/core')
    const saved =
      typeof content === 'string'
        ? await invoke<boolean>('save_text_file', { fileName, contents: content })
        : // Binario: los bytes van tal cual en el cuerpo de la llamada (sin pasar por JSON) y el nombre en una cabecera.
          await invoke<boolean>('save_binary_file', content, { headers: { 'x-file-name': encodeURIComponent(fileName) } })
    return saved ? 'saved' : 'cancelled'
  }
  const file = new File([content as BlobPart], fileName, { type: typeof content === 'string' ? `${mime};charset=utf-8` : mime })
  if (isTouchDevice() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
      // Si compartir falla por otra cosa, se descarga.
    }
  }
  download(file)
  return 'saved'
}

function isTouchDevice(): boolean {
  return matchMedia('(pointer: coarse)').matches
}

function download(file: File) {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Pide al navegador que no borre los datos por falta de espacio. En las apps nativas los datos ya son de la app. */
export async function requestPersistentStorage(): Promise<void> {
  if (runtime !== 'web') return
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist()
  } catch {
    // Sin soporte: no pasa nada.
  }
}

/** Fecha y hora para nombres de archivo: 20261018-1945. */
export function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}
