import type { ISODate } from './types'

const moneyCache = new Map<string, Intl.NumberFormat>()

function moneyFormat(currency: string, locale: string, compact: boolean): Intl.NumberFormat {
  const key = `${currency}|${locale}|${compact}`
  let f = moneyCache.get(key)
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      notation: compact ? 'compact' : 'standard',
      // es-ES no agrupa números de 4 cifras por defecto; en importes se lee mejor 9.707 que 9707.
      useGrouping: 'always',
      maximumFractionDigits: compact ? 1 : 2,
      minimumFractionDigits: compact ? 0 : 2,
    })
    moneyCache.set(key, f)
  }
  return f
}

export interface MoneyOpts {
  currency?: string
  locale?: string
  compact?: boolean
  /** Antepone + a los positivos. */
  signed?: boolean
}

export function fmtMoney(n: number, { currency = 'EUR', locale = 'es-ES', compact = false, signed = false }: MoneyOpts = {}): string {
  const s = moneyFormat(currency, locale, compact).format(Math.abs(n) < 0.005 ? 0 : n)
  return signed && n > 0.004 ? `+${s}` : s
}

export function fmtPercent(n: number, locale = 'es-ES', digits = 0): string {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: digits }).format(n)
}

/** «Ahorras el 12 % de lo que entra» o, si el balance es negativo, «Gastas un 9 % más de lo que entra». */
export function savingsPhrase(rate: number, locale = 'es-ES'): string {
  return rate >= 0 ? `Ahorras el ${fmtPercent(rate, locale)} de lo que entra` : `Gastas un ${fmtPercent(-rate, locale)} más de lo que entra`
}

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export function fmtDate(iso: ISODate, withYear = true): string {
  const [y, m, d] = iso.split('-').map(Number)
  return withYear ? `${d} ${MONTHS_SHORT[m - 1]} ${y}` : `${d} ${MONTHS_SHORT[m - 1]}`
}

/** "2025-07" → "jul 2025" o "julio 2025". */
export function fmtMonth(key: string, long = false): string {
  const [y, m] = key.split('-').map(Number)
  return `${(long ? MONTHS_LONG : MONTHS_SHORT)[m - 1]} ${y}`
}

export function monthName(m: number): string {
  return MONTHS_LONG[m - 1]
}
