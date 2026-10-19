/**
 * Métricas de Helvetica y Helvetica-Bold (dos de las 14 fuentes estándar de PDF: todo lector las trae, no hace falta
 * incrustarlas) en codificación WinAnsi. Anchos en milésimas de em de los códigos 32–255, sacados de los AFM de Adobe.
 */

export type FontName = 'regular' | 'bold'

// prettier-ignore
const WIDTHS: Record<FontName, number[]> = {
  regular: [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,0,556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,500,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500],
  bold: [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,0,556,0,278,556,500,1000,556,556,333,1000,667,333,1000,0,611,0,0,278,278,500,500,350,556,1000,333,1000,556,333,944,0,500,556,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556],
}

/** Caracteres de 0x80–0x9F en WinAnsi (el resto de 0xA0–0xFF coincide con Latin-1). */
const CP1252: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
}

/** Espacios finos y otros que Intl usa al formatear y que WinAnsi no tiene: se escriben como su equivalente. */
const FALLBACK: Record<number, number> = { 0x202f: 0xa0, 0x2009: 0x20, 0x200a: 0x20, 0x2007: 0x20, 0x2212: 0x2d, 0x2010: 0x2d, 0x2011: 0x2d }

/** Código WinAnsi de un carácter, o null si no existe (emojis, otros alfabetos): se omite. */
export function winAnsiCode(cp: number): number | null {
  if ((cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff)) return cp
  return CP1252[cp] ?? FALLBACK[cp] ?? null
}

export function encodeWinAnsi(s: string): number[] {
  const out: number[] = []
  for (const ch of s) {
    const c = winAnsiCode(ch.codePointAt(0)!)
    if (c != null) out.push(c)
  }
  return out
}

/** Ancho de un texto en puntos. */
export function textWidth(s: string, font: FontName, size: number): number {
  const w = WIDTHS[font]
  let sum = 0
  for (const c of encodeWinAnsi(s)) sum += w[c - 32] ?? 0
  return (sum * size) / 1000
}

/** Recorta un texto con «…» para que quepa en `max` puntos. */
export function fitText(s: string, font: FontName, size: number, max: number): string {
  if (textWidth(s, font, size) <= max) return s
  const chars = [...s]
  let lo = 0
  let hi = chars.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (textWidth(chars.slice(0, mid).join('') + '…', font, size) <= max) lo = mid
    else hi = mid - 1
  }
  return lo > 0 ? chars.slice(0, lo).join('').trimEnd() + '…' : ''
}

/** Parte un texto en líneas de como mucho `max` puntos (por palabras). */
export function wrapText(s: string, font: FontName, size: number, max: number): string[] {
  const lines: string[] = []
  for (const para of s.split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? line + ' ' + word : word
      if (textWidth(next, font, size) <= max || !line) line = next
      else {
        lines.push(line)
        line = word
      }
    }
    lines.push(line)
  }
  return lines.map((l) => (textWidth(l, font, size) > max ? fitText(l, font, size, max) : l))
}
