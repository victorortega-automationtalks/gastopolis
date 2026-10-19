import { rootIndex } from './series'
import type { Category, ISODate, Movement } from './types'

export type BalanceMode = 'month' | 'cumulative'

export interface BalanceSeg {
  categoryId: string
  name: string
  color: string
  icon: string
  value: number
}

export interface BalanceSnapshot {
  /** Mes mostrado (en acumulado, el último del tramo). */
  month: string
  income: BalanceSeg[]
  expense: BalanceSeg[]
  incomeTotal: number
  expenseTotal: number
  /** Neto de transferencias en positivo = apartado a ahorro/inversión. */
  saved: number
  /** Ingresos − gastos. */
  net: number
  /** −1 … 1: positivo = pesan más los gastos (la balanza cae hacia ese lado). */
  tilt: number
}

const MAX_SEGMENTS = 7

/**
 * Lo que hay en cada platillo de la balanza en un mes (o acumulado hasta ese mes), por categoría raíz.
 * Más de 7 categorías se pliegan en «Otras» para que cada franja se pueda leer.
 */
export function balanceSnapshot(movements: Movement[], categories: Category[], months: string[], index: number, mode: BalanceMode): BalanceSnapshot {
  const month = months[Math.min(Math.max(index, 0), months.length - 1)] ?? ''
  const from = `${mode === 'month' ? month : months[0]}-01`
  return balanceBetween(movements, categories, from, `${month}-31`)
}

/** Lo mismo para cualquier tramo de fechas [from, to]: un día, una semana, un mes o lo acumulado. */
export function balanceBetween(movements: Movement[], categories: Category[], from: ISODate, to: ISODate): BalanceSnapshot {
  const month = to.slice(0, 7)
  const inRange = (d: ISODate) => d >= from && d <= to
  const root = rootIndex(categories)
  const byId = new Map(categories.map((c) => [c.id, c]))
  const sums = { income: new Map<string, number>(), expense: new Map<string, number>() }
  let saved = 0
  for (const m of movements) {
    if (!inRange(m.date)) continue
    if (m.kind === 'transfer') {
      saved -= m.amount
      continue
    }
    const map = sums[m.kind]
    const id = root(m.categoryId)
    map.set(id, (map.get(id) ?? 0) + Math.abs(m.amount))
  }
  const segs = (map: Map<string, number>): BalanceSeg[] => {
    const all = [...map]
      .map(([id, value]) => {
        const c = byId.get(id)
        return { categoryId: id, name: c?.name ?? 'Sin categoría', color: c?.color ?? '#8b8fa8', icon: c?.icon ?? 'CircleDashed', value }
      })
      .sort((a, b) => b.value - a.value)
    if (all.length <= MAX_SEGMENTS) return all
    const rest = all.slice(MAX_SEGMENTS - 1)
    return [
      ...all.slice(0, MAX_SEGMENTS - 1),
      { categoryId: 'otras', name: `Otras (${rest.length})`, color: '#8b8fa8', icon: 'CircleDashed', value: rest.reduce((a, s) => a + s.value, 0) },
    ]
  }
  const income = segs(sums.income)
  const expense = segs(sums.expense)
  const incomeTotal = income.reduce((a, s) => a + s.value, 0)
  const expenseTotal = expense.reduce((a, s) => a + s.value, 0)
  const heavier = Math.max(incomeTotal, expenseTotal, 1)
  return {
    month,
    income,
    expense,
    incomeTotal,
    expenseTotal,
    saved,
    net: incomeTotal - expenseTotal,
    tilt: Math.max(-1, Math.min(1, (expenseTotal - incomeTotal) / heavier)),
  }
}
