/**
 * Copias cifradas con contraseña: AES-GCM de 256 bits con la clave derivada por PBKDF2-SHA256.
 * Todo con WebCrypto, en el dispositivo. Sin la contraseña no hay forma de abrir el archivo (ni nosotros).
 */

export interface SealedFile {
  app: 'gastopolis'
  sealed: 1
  kdf: 'PBKDF2-SHA256'
  iterations: number
  /** Base64. */
  salt: string
  iv: string
  data: string
}

/** Lo que recomienda OWASP para PBKDF2-SHA256: lento de propósito para frenar ataques de diccionario. */
export const DEFAULT_ITERATIONS = 600_000

export class WrongPasswordError extends Error {
  constructor() {
    super('Contraseña incorrecta (o el archivo está dañado)')
    this.name = 'WrongPasswordError'
  }
}

const enc = new TextEncoder()
const dec = new TextDecoder()

function toB64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export async function sealText(plain: string, password: string, iterations = DEFAULT_ITERATIONS): Promise<SealedFile> {
  if (!password) throw new Error('Hace falta una contraseña')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt, iterations)
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plain)))
  return { app: 'gastopolis', sealed: 1, kdf: 'PBKDF2-SHA256', iterations, salt: toB64(salt), iv: toB64(iv), data: toB64(data) }
}

export async function unsealText(file: SealedFile, password: string): Promise<string> {
  const key = await deriveKey(password, fromB64(file.salt), file.iterations)
  try {
    return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(file.iv) }, key, fromB64(file.data)))
  } catch {
    // GCM autentica: una contraseña errónea y un archivo manipulado fallan igual.
    throw new WrongPasswordError()
  }
}

export function isSealed(x: unknown): x is SealedFile {
  const f = x as Partial<SealedFile> | null
  return !!f && f.app === 'gastopolis' && f.sealed === 1 && typeof f.data === 'string' && typeof f.salt === 'string' && typeof f.iv === 'string'
}
