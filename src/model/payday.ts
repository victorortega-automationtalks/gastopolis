import type { ISODate, Movement } from './types'

/**
 * Nómina inteligente. Mucha gente cobra a finales de mes y ese dinero es para el mes siguiente: la nómina del 28 de
 * septiembre paga octubre. Aquí se detectan los ingresos que llegan una vez al mes (nómina, pensión, alquiler que
 * cobras…) y su día típico, y cada cobro se imputa al mes cuya fecha esperada tiene más cerca:
 *
 * - Si suele llegar los últimos días, el del 28 de septiembre cuenta para octubre; y si un mes se retrasa al 1 de
 *   octubre, también cuenta para octubre (no hay dos nóminas en un mes ni ninguna en otro).
 * - Si suele llegar a primeros, cuenta para su mes; y si un mes se adelanta al 29 del anterior, para el siguiente.
 *
 * La fecha real no se toca: solo los cálculos por mes ven la fecha contable (el día 1 del mes imputado).
 */

const DAY = 86_400_000
const toMs = (d: ISODate) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()
const pad = (n: number) => String(n).padStart(2, '0')
const firstOf = (y: number, m: number): ISODate => {
  const t = new Date(Date.UTC(y, m - 1, 1))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-01`
}

/** Días respecto al día 1 del mes: el 28 de un mes de 30 días es −3 (tres días antes del 1 siguiente); el 2, +1. */
export function dayOffset(date: ISODate): number {
  const [y, m, d] = date.split('-').map(Number)
  return d >= 16 ? d - daysIn(y, m) - 1 : d - 1
}

export interface PaydaySeries {
  categoryId: string
  /** Desfase típico respecto al día 1 (negativo: llega antes de que empiece el mes). */
  offset: number
  /** Cobros que se han imputado a otro mes. */
  shifted: number
  count: number
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const k = Math.floor(s.length / 2)
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2
}

/**
 * Fecha contable de los cobros que deben contar en otro mes (id → día 1 del mes imputado) y las series detectadas.
 * Una serie es una categoría de ingresos con un cobro grande al mes durante al menos tres meses; los ingresos
 * pequeños de la misma categoría (un reembolso) no se mueven.
 */
export function paydayShifts(movements: Movement[]): { shifts: Map<string, ISODate>; series: PaydaySeries[] } {
  const byCat = new Map<string, Movement[]>()
  for (const m of movements) {
    if (m.kind !== 'income' || m.amount <= 0) continue
    const list = byCat.get(m.categoryId)
    if (list) list.push(m)
    else byCat.set(m.categoryId, [m])
  }
  const shifts = new Map<string, ISODate>()
  const series: PaydaySeries[] = []
  for (const [categoryId, list] of byCat) {
    if (list.length < 3) continue
    const big = median(list.map((m) => m.amount)) * 0.5
    const main = list.filter((m) => m.amount >= big)
    const months = new Set(main.map((m) => m.date.slice(0, 7)))
    // Una vez al mes (con margen para algún mes con dos, cuando una se adelanta), y al menos tres meses.
    if (months.size < 3 || main.length > months.size * 1.35) continue
    // Y de verdad periódico: llega la mayoría de los meses y siempre por las mismas fechas (±4 días). Una venta de
    // segunda mano de vez en cuando no es una nómina.
    const keys = [...months].sort()
    const span = (+keys.at(-1)!.slice(0, 4) - +keys[0].slice(0, 4)) * 12 + (+keys.at(-1)!.slice(5, 7) - +keys[0].slice(5, 7)) + 1
    if (months.size < span * 0.6) continue
    const offsets = main.map((m) => dayOffset(m.date))
    const offset = Math.round(median(offsets))
    if (median(offsets.map((o) => Math.abs(o - offset))) > 4) continue
    let shifted = 0
    for (const m of main) {
      const [y, mo] = m.date.split('-').map(Number)
      const t = toMs(m.date)
      // Candidatos: su propio mes y el siguiente. Gana el que espera el cobro más cerca de cuando llegó.
      const own = toMs(firstOf(y, mo)) + offset * DAY
      const next = toMs(firstOf(y, mo + 1)) + offset * DAY
      if (Math.abs(t - next) < Math.abs(t - own)) {
        shifts.set(m.id, firstOf(y, mo + 1))
        shifted++
      }
    }
    series.push({ categoryId, offset, shifted, count: main.length })
  }
  return { shifts, series }
}

/**
 * Movimientos para los cálculos: los cobros imputados a otro mes llevan esa fecha y la real en `realDate`. Si no hay
 * nada que mover, devuelve el mismo array (las memorias de React no se invalidan).
 */
export function bookMovements(movements: Movement[]): Movement[] {
  const { shifts } = paydayShifts(movements)
  if (!shifts.size) return movements
  return movements.map((m) => {
    const to = shifts.get(m.id)
    return to ? { ...m, date: to, realDate: m.date } : m
  })
}

/** Fecha que se enseña: la real. */
export const shownDate = (m: Pick<Movement, 'date' | 'realDate'>): ISODate => m.realDate ?? m.date
