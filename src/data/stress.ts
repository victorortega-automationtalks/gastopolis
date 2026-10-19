import { mulberry32 } from '../lib/random'
import { normalizeKey } from '../lib/text'
import { isoOf } from '../model/period'
import type { Category, Movement } from '../model/types'
import { buildSample } from './sample'

/**
 * Datos de carga para medir el rendimiento: las categorías del ejemplo y `count` movimientos inventados a lo largo
 * de `years` años, con cientos de comercios distintos (lo que más pesa en la Ciudad y en el detector de fugas),
 * decenas de cargos periódicos y nóminas. Solo para pruebas; no se ofrece en la app.
 */
export function buildStress(count = 12000, years = 8, now = new Date(2026, 9, 18)): { categories: Category[]; movements: Movement[] } {
  const { categories } = buildSample(now)
  const rnd = mulberry32(424242)
  const expense = categories.filter((c) => c.kind === 'expense' && c.parentId)
  const merchants = Array.from({ length: 900 }, (_, i) => ({ name: `Comercio ${String(i).padStart(3, '0')}`, cat: expense[i % expense.length].id }))
  const subs = Array.from({ length: 40 }, (_, i) => ({ name: `Suscripción ${i}`, day: 1 + (i % 27), amount: 3 + (i % 17) * 2.5 }))
  const movements: Movement[] = []
  let seq = 0
  const push = (date: Date, categoryId: string, concept: string, amount: number) => {
    if (date > now) return // Nada en el futuro: el mes en curso solo hasta hoy.
    const cat = categories.find((c) => c.id === categoryId)!
    movements.push({
      id: `stress-${seq++}`,
      date: isoOf(date),
      amount: cat.kind === 'expense' ? -Math.abs(amount) : amount,
      kind: cat.kind,
      concept,
      conceptKey: normalizeKey(concept),
      categoryId,
      tags: [],
      source: 'manual',
      createdAt: 0,
    })
  }
  const months = years * 12
  const start = new Date(now.getFullYear(), now.getMonth() - months + 1, 1)
  const fixedPerMonth = 1 + subs.length + 2
  const variablePerMonth = Math.max(0, Math.round(count / months) - fixedPerMonth)
  for (let mi = 0; mi < months; mi++) {
    const y = start.getFullYear()
    const m = start.getMonth() + mi
    const last = new Date(y, m + 1, 0).getDate()
    const day = (d: number) => new Date(y, m, Math.min(d, last))
    push(day(28), 'sample-nomina', 'Nómina Acme S.L.', 2100 + mi * 3)
    push(day(1), 'sample-alquiler', 'Alquiler piso', 750)
    push(day(29), 'sample-ahorro', 'Traspaso a cuenta ahorro', -250)
    for (const s of subs) push(day(s.day), 'sample-suscripciones', s.name, s.amount)
    for (let k = 0; k < variablePerMonth; k++) {
      const mer = merchants[Math.floor(Math.pow(rnd(), 1.8) * merchants.length)]
      push(day(1 + Math.floor(rnd() * last)), mer.cat, mer.name, Math.round((2 + rnd() * rnd() * 140) * 100) / 100)
    }
  }
  return { categories, movements }
}
