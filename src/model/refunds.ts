import { groupKey } from './sortGame'
import type { Movement } from './types'

/** Días tras una compra en los que un ingreso del mismo importe y comercio se toma por su devolución. */
export const REFUND_DAYS = 90

/** Categoría (de traspaso) donde quedan la compra y su devolución: se anulan, no cuentan como gasto ni como ingreso. */
export const REFUND_CATEGORY = 'Compras devueltas'

const DAY = 86_400_000
const ms = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))

/**
 * Compras devueltas: un ingreso con el mismo importe que un gasto anterior (hasta `days` días antes) y del mismo
 * comercio («Www.Amazon* AB12» y «Devolución Amazon» cuentan como el mismo). Cada gasto empareja con una sola
 * devolución, la más cercana en fecha. Bizum queda fuera: que un amigo te devuelva una cena no es una devolución.
 */
export function refundPairs(movements: Pick<Movement, 'id' | 'date' | 'amount' | 'concept' | 'kind'>[], days = REFUND_DAYS): [string, string][] {
  const expenses = new Map<string, { id: string; date: string; key: string }[]>()
  for (const m of movements) {
    if (m.kind !== 'expense' || m.amount >= 0) continue
    const key = groupKey(m.concept)
    if (!key || /\bbizum\b/.test(key)) continue
    const k = String(Math.round(-m.amount * 100))
    const list = expenses.get(k) ?? []
    list.push({ id: m.id, date: m.date, key })
    expenses.set(k, list)
  }
  const used = new Set<string>()
  const out: [string, string][] = []
  const incomes = movements.filter((m) => m.kind === 'income' && m.amount > 0).sort((a, b) => a.date.localeCompare(b.date))
  for (const inc of incomes) {
    const key = groupKey(inc.concept)
    if (!key || /\bbizum\b/.test(key)) continue
    const t = ms(inc.date)
    const match = (expenses.get(String(Math.round(inc.amount * 100))) ?? [])
      .filter((e) => !used.has(e.id) && e.key === key && ms(e.date) <= t && t - ms(e.date) <= days * DAY)
      .sort((a, b) => b.date.localeCompare(a.date))[0]
    if (!match) continue
    used.add(match.id)
    out.push([match.id, inc.id])
  }
  return out
}
