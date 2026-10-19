import { descendantIds } from './aggregate'
import type { Category, ISODate, Movement } from './types'

const DAY = 86_400_000
const toMs = (d: ISODate) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))
const fromMs = (t: number): ISODate => new Date(t).toISOString().slice(0, 10)

/**
 * Fecha «de hoy» para los indicadores: hoy, salvo que los datos acaben antes (se importan a meses vencidos);
 * entonces el último día con movimientos, para no enseñar un mes en blanco.
 */
export function dataAsOf(movements: Movement[], now: ISODate): { asOf: ISODate; stale: boolean } {
  let last = ''
  for (const m of movements) if (m.date > last) last = m.date
  if (!last || last >= now) return { asOf: now, stale: false }
  // Si el último dato es de este mes o del anterior, se sigue mirando hoy.
  const months = (+now.slice(0, 4) - +last.slice(0, 4)) * 12 + (+now.slice(5, 7) - +last.slice(5, 7))
  return months <= 1 ? { asOf: now, stale: false } : { asOf: last, stale: true }
}

/** Último día del mes de una clave `aaaa-mm`. */
export function monthEndOf(key: string): ISODate {
  const [y, m] = key.split('-').map(Number)
  return `${key}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`
}

/** El periodo de la misma duración justo antes de `range`, para comparar. */
export function previousRange(range: { from: ISODate; to: ISODate }): { from: ISODate; to: ISODate } {
  const len = toMs(range.to) - toMs(range.from) + DAY
  return { from: fromMs(toMs(range.from) - len), to: fromMs(toMs(range.from) - DAY) }
}

export interface MonthProjection {
  /** Gastado en lo que va de mes (positivo). */
  spent: number
  /** Estimación al cierre: lo gastado + ritmo diario de los 90 días anteriores × días que quedan. */
  projected: number
  dailyAvg: number
  daysLeft: number
}

export function monthProjection(movements: Movement[], today: ISODate): MonthProjection {
  const monthStart = today.slice(0, 8) + '01'
  const [y, m] = today.split('-').map(Number)
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const day = +today.slice(8, 10)
  const historyFrom = fromMs(toMs(monthStart) - 90 * DAY)
  let spent = 0
  let history = 0
  for (const mv of movements) {
    if (mv.kind !== 'expense') continue
    if (mv.date >= monthStart && mv.date <= today) spent -= mv.amount
    else if (mv.date >= historyFrom && mv.date < monthStart) history -= mv.amount
  }
  const dailyAvg = history > 0 ? history / 90 : spent / Math.max(day, 1)
  const daysLeft = daysInMonth - day
  return { spent, projected: spent + dailyAvg * daysLeft, dailyAvg, daysLeft }
}

/** Días seguidos sin gastos hasta hoy (0 si hoy ya hubo alguno). */
export function noSpendStreak(movements: Movement[], today: ISODate): number {
  const spendDays = new Set(movements.filter((m) => m.kind === 'expense' && m.date <= today).map((m) => m.date))
  if (!spendDays.size) return 0
  const first = [...spendDays].sort()[0]
  let n = 0
  for (let t = toMs(today); t >= toMs(first) && !spendDays.has(fromMs(t)); t -= DAY) n++
  return n
}

export interface BudgetStatus {
  category: Category
  spent: number
  budget: number
  /** gastado / presupuesto. */
  ratio: number
  /** Ritmo esperado a estas alturas de mes (día / días del mes). */
  pace: number
}

/** Presupuestos del mes en curso (con sus subcategorías). */
export function budgetStatus(movements: Movement[], categories: Category[], today: ISODate): BudgetStatus[] {
  const monthStart = today.slice(0, 8) + '01'
  const [y, m] = today.split('-').map(Number)
  const pace = +today.slice(8, 10) / new Date(Date.UTC(y, m, 0)).getUTCDate()
  return categories
    .filter((c) => c.kind === 'expense' && c.budgetMonthly && c.budgetMonthly > 0)
    .map((c) => {
      const ids = descendantIds([c.id], categories)
      const spent = movements.filter((mv) => ids.has(mv.categoryId) && mv.date >= monthStart && mv.date <= today).reduce((a, mv) => a - mv.amount, 0)
      return { category: c, spent, budget: c.budgetMonthly!, ratio: spent / c.budgetMonthly!, pace }
    })
    .sort((a, b) => b.ratio - a.ratio)
}
