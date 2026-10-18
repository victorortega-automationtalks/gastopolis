import type { ISODate, Kind } from '../model/types'
import { normalizeKey } from '../lib/text'

const pad = (n: number) => String(n).padStart(2, '0')

export function toISODate(y: number, m: number, d: number): ISODate | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null
  if (y < 100) y += y < 70 ? 2000 : 1900
  if (y < 1970 || y > 2200 || m < 1 || m > 12 || d < 1) return null
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  if (d > daysInMonth) return null
  return `${y}-${pad(m)}-${pad(d)}`
}

/** Número de serie de Excel → fecha. Se calcula en UTC para no depender de la zona horaria. */
export function excelSerialToISO(serial: number, date1904 = false): ISODate | null {
  if (!Number.isFinite(serial) || serial < 1) return null
  const ms = Date.UTC(1899, 11, 30) + (Math.floor(serial) + (date1904 ? 1462 : 0)) * 86_400_000
  const d = new Date(ms)
  return toISODate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

/**
 * Fechas tal y como aparecen en hojas y extractos: serie de Excel, objetos Date,
 * `dd/mm/aaaa`, `dd-mm-aa`, `dd.mm.aaaa`, `aaaa-mm-dd`. Día antes que mes, como en España.
 */
export function parseDate(v: unknown, date1904 = false): ISODate | null {
  if (v == null || v === '') return null
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null
    return toISODate(v.getFullYear(), v.getMonth() + 1, v.getDate())
  }
  if (typeof v === 'number') return excelSerialToISO(v, date1904)
  const s = String(v).trim()
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/)
  if (m) return toISODate(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:\s.*)?$/)
  if (m) return toISODate(+m[3], +m[2], +m[1])
  if (/^\d+(\.\d+)?$/.test(s)) return excelSerialToISO(Number(s), date1904)
  return null
}

/**
 * Importes con formato español o inglés: `-1.234,56 €`, `1,234.56`, `(12,30)`, `12,30-`.
 * Devuelve null si no hay un número reconocible.
 */
export function parseAmount(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? round2(v) : null
  let s = String(v).trim()
  if (!s) return null
  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1)
  }
  if (/-\s*$/.test(s)) {
    negative = true
    s = s.replace(/-\s*$/, '')
  }
  s = s.replace(/[€$£\s ]|eur|usd/gi, '')
  if (s.startsWith('+')) s = s.slice(1)
  if (s.startsWith('-')) {
    negative = !negative
    s = s.slice(1)
  }
  if (!/^[\d.,]+$/.test(s)) return null
  const lastDot = s.lastIndexOf('.')
  const lastComma = s.lastIndexOf(',')
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? '.' : ','
    const thou = dec === '.' ? ',' : '.'
    s = s.split(thou).join('').replace(dec, '.')
  } else if (lastComma >= 0) {
    // Solo comas: decimal si es la única y no agrupa de tres en tres ("1,234,567").
    s = /^\d{1,3}(,\d{3}){2,}$/.test(s) ? s.split(',').join('') : s.split(',').join('.')
    if ((s.match(/\./g) ?? []).length > 1) return null
  } else if (lastDot >= 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    // "1.234" en España son mil doscientos.
    s = s.split('.').join('')
  }
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return round2(negative ? -n : n)
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

const KIND_WORDS: Record<string, Kind> = {
  gasto: 'expense',
  gastos: 'expense',
  expense: 'expense',
  expenses: 'expense',
  cargo: 'expense',
  debe: 'expense',
  ingreso: 'income',
  ingresos: 'income',
  income: 'income',
  abono: 'income',
  haber: 'income',
  transferencia: 'transfer',
  transferencias: 'transfer',
  traspaso: 'transfer',
  traspasos: 'transfer',
  transfer: 'transfer',
}

export function parseKind(v: unknown): Kind | null {
  if (typeof v !== 'string') return null
  return KIND_WORDS[normalizeKey(v)] ?? null
}
