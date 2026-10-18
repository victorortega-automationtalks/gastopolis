import { fmtDate, fmtMonth } from './format'
import { shiftDays } from './period'
import type { ISODate, Movement } from './types'

/** Paso de la reproducción temporal de las escenas. */
export type TimeStep = 'day' | 'week' | 'month'

export const STEP_LABEL: Record<TimeStep, string> = { day: 'Día', week: 'Semana', month: 'Mes' }

/** Un fotograma: el tramo [from, to] (ambos incluidos) que muestra la escena en ese instante. */
export interface Frame {
  from: ISODate
  to: ISODate
}

/** Tope de fotogramas: años de datos día a día siguen siendo reproducibles sin colgar la pantalla. */
export const MAX_FRAMES = 4000

const pad = (n: number) => String(n).padStart(2, '0')
const toMs = (d: ISODate) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))

function monthEnd(d: ISODate): ISODate {
  const [y, m] = d.split('-').map(Number)
  return `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`
}

function nextMonthStart(d: ISODate): ISODate {
  const [y, m] = d.split('-').map(Number)
  return m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`
}

/** Lunes de la semana de `d` (semanas de lunes a domingo, como en España). */
export function weekStart(d: ISODate): ISODate {
  const dow = (new Date(toMs(d)).getUTCDay() + 6) % 7
  return shiftDays(d, dow)
}

/** Fotogramas consecutivos que cubren de `first` a `last`. */
export function buildFrames(first: ISODate, last: ISODate, step: TimeStep): Frame[] {
  const out: Frame[] = []
  if (first > last) return out
  if (step === 'day') {
    for (let d = first; d <= last && out.length < MAX_FRAMES; d = shiftDays(d, -1)) out.push({ from: d, to: d })
  } else if (step === 'week') {
    for (let d = weekStart(first); d <= last && out.length < MAX_FRAMES; d = shiftDays(d, -7)) out.push({ from: d, to: shiftDays(d, -6) })
  } else {
    for (let d = `${first.slice(0, 7)}-01`; d <= last && out.length < MAX_FRAMES; d = nextMonthStart(d)) out.push({ from: d, to: monthEnd(d) })
  }
  return out
}

/** Primer y último día con movimientos, o null si no hay. */
export function dataSpan(movements: Movement[]): { first: ISODate; last: ISODate } | null {
  if (!movements.length) return null
  let first = movements[0].date
  let last = first
  for (const m of movements) {
    if (m.date < first) first = m.date
    if (m.date > last) last = m.date
  }
  return { first, last }
}

/** «12 mar 2026», «sem. 9–15 mar 2026», «marzo 2026». */
export function frameLabel(f: Frame, step: TimeStep): string {
  if (step === 'day') return fmtDate(f.from)
  if (step === 'month') return fmtMonth(f.from.slice(0, 7), true)
  const sameMonth = f.from.slice(0, 7) === f.to.slice(0, 7)
  return `sem. ${sameMonth ? +f.from.slice(8, 10) : fmtDate(f.from, false)}–${fmtDate(f.to)}`
}

/** Fotograma que contiene la fecha (o el más cercano). */
export function frameIndexOf(frames: Frame[], date: ISODate): number {
  let lo = 0
  let hi = frames.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (frames[mid].to < date) lo = mid + 1
    else hi = mid
  }
  return Math.max(0, lo)
}

/**
 * Posición continua de una fecha sobre una serie de meses: el mes i ya «completo» al acabar (i), a medias a mitad
 * de camino entre el anterior y él. Sirve para revelar la Cordillera poco a poco. Entre 0 y months.length − 1.
 */
export function monthPosition(months: string[], date: ISODate): number {
  if (!months.length) return 0
  const i = months.indexOf(date.slice(0, 7))
  if (i < 0) return date < months[0] ? 0 : months.length - 1
  const day = +date.slice(8, 10)
  const days = +monthEnd(date).slice(8, 10)
  return Math.min(months.length - 1, Math.max(0, i - 1 + day / days))
}

/** Duración de cada fotograma al reproducir (ms), según el paso: los días van rápido, los meses se paladean. */
export const STEP_MS: Record<TimeStep, number> = { day: 90, week: 320, month: 950 }

/** Días entre dos fechas (para estimar cuánto dura la reproducción). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toMs(b) - toMs(a)) / 86_400_000)
}
