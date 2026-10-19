import type { ISODate, Kind } from './types'

export type PeriodPreset = 'all' | 'thisMonth' | 'lastMonth' | 'last3' | 'last12' | 'thisYear' | 'lastYear' | 'year' | 'custom'

export interface Period {
  preset: PeriodPreset
  /** Solo para `year` (año natural o fiscal que empieza ese año) y `custom`. */
  year?: number
  from?: ISODate
  to?: ISODate
}

export interface Filters {
  period: Period
  kinds: Kind[]
  search: string
  /** Vacío = todas. Incluye subcategorías. */
  categoryIds: string[]
  /** Vacío = todas. `NO_ACCOUNT` = los que no tienen cuenta. */
  accountIds?: string[]
}

export const NO_ACCOUNT = '__sin-cuenta__'

export const DEFAULT_FILTERS: Filters = {
  period: { preset: 'all' },
  kinds: ['expense', 'income', 'transfer'],
  search: '',
  categoryIds: [],
}

const pad = (n: number) => String(n).padStart(2, '0')

export function isoOf(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function today(): ISODate {
  return isoOf(new Date())
}

function monthStart(y: number, m: number): ISODate {
  const d = new Date(y, m - 1, 1)
  return isoOf(d)
}

function monthEnd(y: number, m: number): ISODate {
  return isoOf(new Date(y, m, 0))
}

/** Rango cerrado [from, to] o null si no hay límite. `fiscalYearStart` es el mes (1–12) en que empieza el año. */
export function resolvePeriod(p: Period, now: ISODate, fiscalYearStart = 1): { from: ISODate; to: ISODate } | null {
  const [y, m] = now.split('-').map(Number)
  const yearRange = (startYear: number) => ({
    from: monthStart(startYear, fiscalYearStart),
    to: fiscalYearStart > 1 ? monthEnd(startYear + 1, fiscalYearStart - 1) : monthEnd(startYear, 12),
  })
  const currentFiscalYear = m >= fiscalYearStart ? y : y - 1
  switch (p.preset) {
    case 'all':
      return null
    case 'thisMonth':
      return { from: monthStart(y, m), to: monthEnd(y, m) }
    case 'lastMonth':
      return { from: monthStart(y, m - 1), to: monthEnd(y, m - 1) }
    case 'last3':
      return { from: monthStart(y, m - 2), to: monthEnd(y, m) }
    case 'last12':
      return { from: monthStart(y, m - 11), to: monthEnd(y, m) }
    case 'thisYear':
      return yearRange(currentFiscalYear)
    case 'lastYear':
      return yearRange(currentFiscalYear - 1)
    case 'year':
      return yearRange(p.year ?? y)
    case 'custom':
      if (!p.from && !p.to) return null
      return { from: p.from ?? '0000-01-01', to: p.to ?? '9999-12-31' }
  }
}

/** Fecha `n` días antes (o después, con n negativo). */
export function shiftDays(iso: ISODate, n: number): ISODate {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10)
}

export function inPeriod(date: ISODate, range: { from: ISODate; to: ISODate } | null): boolean {
  return !range || (date >= range.from && date <= range.to)
}

export function monthKey(date: ISODate): string {
  return date.slice(0, 7)
}
