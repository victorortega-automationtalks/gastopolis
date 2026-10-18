import { monthKey } from './period'
import type { Category, Kind, Movement } from './types'

/** "2025-01" + n meses. */
export function addMonths(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number)
  const t = y * 12 + (m - 1) + n
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}

/** Meses consecutivos entre dos claves, ambas incluidas. */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = []
  for (let k = from; k <= to && out.length < 600; k = addMonths(k, 1)) out.push(k)
  return out
}

/** Meses con datos, sin huecos, del primero al último movimiento. */
export function monthsOf(movements: Movement[]): string[] {
  if (!movements.length) return []
  let min = movements[0].date
  let max = min
  for (const m of movements) {
    if (m.date < min) min = m.date
    if (m.date > max) max = m.date
  }
  return monthRange(monthKey(min), monthKey(max))
}

/** Antepasado raíz de cada categoría. */
export function rootIndex(categories: Category[]): (id: string) => string {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const cache = new Map<string, string>()
  return (id) => {
    const hit = cache.get(id)
    if (hit) return hit
    let c = byId.get(id)
    const seen = new Set<string>()
    while (c?.parentId && byId.has(c.parentId) && !seen.has(c.id)) {
      seen.add(c.id)
      c = byId.get(c.parentId)
    }
    const root = c?.id ?? id
    cache.set(id, root)
    return root
  }
}

export interface CategorySeries {
  categoryId: string
  name: string
  color: string
  icon: string
  /** Importe absoluto por mes, alineado con `months`. */
  values: number[]
  total: number
}

/**
 * Importe por mes y categoría (raíz o la propia) de un tipo de movimiento. Filas ordenadas de mayor a menor total.
 */
export function monthlyByCategory(
  movements: Movement[],
  categories: Category[],
  kind: Kind,
  level: 'root' | 'leaf' = 'root',
): { months: string[]; rows: CategorySeries[]; max: number } {
  const ofKind = movements.filter((m) => m.kind === kind)
  const months = monthsOf(ofKind)
  const col = new Map(months.map((k, i) => [k, i]))
  const root = rootIndex(categories)
  const byId = new Map(categories.map((c) => [c.id, c]))
  const rows = new Map<string, CategorySeries>()
  for (const m of ofKind) {
    const id = level === 'root' ? root(m.categoryId) : m.categoryId
    let row = rows.get(id)
    if (!row) {
      const c = byId.get(id)
      row = {
        categoryId: id,
        name: c?.name ?? 'Sin categoría',
        color: c?.color ?? '#8b8fa8',
        icon: c?.icon ?? 'CircleDashed',
        values: months.map(() => 0),
        total: 0,
      }
      rows.set(id, row)
    }
    const v = Math.abs(m.amount)
    row.values[col.get(monthKey(m.date))!] += v
    row.total += v
  }
  const sorted = [...rows.values()].sort((a, b) => b.total - a.total)
  const max = Math.max(0, ...sorted.flatMap((r) => r.values))
  return { months, rows: sorted, max }
}

export interface MonthTotals {
  month: string
  income: number
  /** En positivo. */
  expense: number
  transfer: number
  net: number
}

/** Totales por mes (consecutivos, con ceros en los meses vacíos). */
export function monthlyTotals(movements: Movement[], months = monthsOf(movements)): MonthTotals[] {
  const idx = new Map(months.map((k, i) => [k, i]))
  const out = months.map((month) => ({ month, income: 0, expense: 0, transfer: 0, net: 0 }))
  for (const m of movements) {
    const i = idx.get(monthKey(m.date))
    if (i == null) continue
    const row = out[i]
    if (m.kind === 'income') row.income += m.amount
    else if (m.kind === 'expense') row.expense -= m.amount
    else row.transfer += m.amount
  }
  for (const r of out) r.net = r.income - r.expense
  return out
}

/** Saldo acumulado mes a mes (ingresos − gastos). */
export function cumulativeNet(rows: MonthTotals[]): { month: string; value: number }[] {
  let acc = 0
  return rows.map((r) => ({ month: r.month, value: (acc += r.net) }))
}
