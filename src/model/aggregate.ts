import { normalizeKey } from '../lib/text'
import { inPeriod, resolvePeriod, type Filters } from './period'
import type { Category, ISODate, Kind, Movement } from './types'

/** Ids de una categoría y todas sus descendientes. */
export function descendantIds(rootIds: string[], categories: Category[]): Set<string> {
  const children = new Map<string, string[]>()
  for (const c of categories) {
    if (!c.parentId) continue
    const list = children.get(c.parentId) ?? []
    list.push(c.id)
    children.set(c.parentId, list)
  }
  const out = new Set<string>()
  const stack = [...rootIds]
  while (stack.length) {
    const id = stack.pop()!
    if (out.has(id)) continue
    out.add(id)
    stack.push(...(children.get(id) ?? []))
  }
  return out
}

export function applyFilters(movements: Movement[], filters: Filters, categories: Category[], now: ISODate, fiscalYearStart = 1): Movement[] {
  const range = resolvePeriod(filters.period, now, fiscalYearStart)
  const kinds = new Set(filters.kinds)
  const cats = filters.categoryIds.length ? descendantIds(filters.categoryIds, categories) : null
  const q = normalizeKey(filters.search)
  const catName = q ? new Map(categories.map((c) => [c.id, normalizeKey(c.name)])) : null
  return movements.filter(
    (m) =>
      kinds.has(m.kind) &&
      inPeriod(m.date, range) &&
      (!cats || cats.has(m.categoryId)) &&
      (!q || m.conceptKey.includes(q) || catName!.get(m.categoryId)?.includes(q) || (m.notes && normalizeKey(m.notes).includes(q))),
  )
}

export interface Totals {
  income: number
  /** En positivo. */
  expense: number
  /** Neto de transferencias: negativo = se apartó dinero. */
  transfer: number
  /** Ingresos − gastos. */
  net: number
  /** (ingresos − gastos) / ingresos, o null sin ingresos. */
  savingsRate: number | null
  count: number
}

export function totals(movements: Movement[]): Totals {
  let income = 0
  let expense = 0
  let transfer = 0
  for (const m of movements) {
    if (m.kind === 'income') income += m.amount
    else if (m.kind === 'expense') expense -= m.amount
    else transfer += m.amount
  }
  const net = income - expense
  return { income, expense, transfer, net, savingsRate: income > 0 ? net / income : null, count: movements.length }
}

/** Signo canónico: gastos en negativo, ingresos en positivo; las transferencias conservan el suyo. */
export function signFor(kind: Kind, amount: number): number {
  if (kind === 'expense') return -Math.abs(amount)
  if (kind === 'income') return Math.abs(amount)
  return amount
}

export function dataBounds(movements: Movement[]): { from: ISODate; to: ISODate } | null {
  if (!movements.length) return null
  let from = movements[0].date
  let to = from
  for (const m of movements) {
    if (m.date < from) from = m.date
    if (m.date > to) to = m.date
  }
  return { from, to }
}

export function yearsWithData(movements: Movement[]): number[] {
  return [...new Set(movements.map((m) => Number(m.date.slice(0, 4))))].sort((a, b) => b - a)
}
