/**
 * Texto de un error, venga como venga: un `Error`, o el texto que devuelve el lado nativo (Tauri rechaza las llamadas
 * con una cadena, no con un `Error`, y entonces `e.message` no existe).
 */
export function errorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message
  if (typeof e === 'string' && e) return e
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') return (e as { message: string }).message
  return 'Error desconocido. Vuelve a intentarlo.'
}
