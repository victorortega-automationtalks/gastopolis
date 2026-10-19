/** Clave estable para agrupar textos escritos a mano: "Mediamark " y "mediamark" son lo mismo. */
export function normalizeKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
    .trim()
}

/** Recorta y colapsa espacios conservando mayúsculas y tildes. */
export function cleanLabel(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/** De entre varias grafías de lo mismo, la más repetida; a igualdad, la que lleva tildes o mayúsculas. */
export function preferredSpelling(variants: string[]): string {
  const counts = new Map<string, number>()
  for (const v of variants) counts.set(v, (counts.get(v) ?? 0) + 1)
  const score = (s: string) => (/[À-ÿ]/.test(s) ? 2 : 0) + (/^[A-ZÀ-Þ]/.test(s) ? 1 : 0)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || score(b[0]) - score(a[0]))[0]?.[0] ?? ''
}
