import type { ISODate, Movement } from './types'

export type Cadence = 'weekly' | 'monthly' | 'quarterly' | 'yearly'

export const CADENCE_LABEL: Record<Cadence, string> = {
  weekly: 'semanal',
  monthly: 'mensual',
  quarterly: 'trimestral',
  yearly: 'anual',
}

export interface PriceChange {
  date: ISODate
  from: number
  to: number
}

export interface Recurring {
  conceptKey: string
  label: string
  categoryId: string
  cadence: Cadence
  /** Último importe cobrado (positivo). */
  amount: number
  occurrences: { date: ISODate; amount: number }[]
  lastDate: ISODate
  nextDate: ISODate
  /** Sigue cobrándose (el próximo cargo no se ha pasado de largo). */
  active: boolean
  priceChanges: PriceChange[]
  /** Coste anual al precio actual. */
  yearly: number
}

const CADENCES: { cadence: Cadence; min: number; max: number; perYear: number; minCount: number; maxCv: number }[] = [
  { cadence: 'weekly', min: 6, max: 8, perYear: 52, minCount: 4, maxCv: 0.15 },
  { cadence: 'monthly', min: 26, max: 35, perYear: 12, minCount: 3, maxCv: 0.35 },
  { cadence: 'quarterly', min: 85, max: 96, perYear: 4, minCount: 3, maxCv: 0.35 },
  // Anual: dos pagos solo cuentan si son casi iguales; si no, hacen falta tres (un viaje cada verano no es un recibo).
  { cadence: 'yearly', min: 350, max: 380, perYear: 1, minCount: 2, maxCv: 0.35 },
]

const DAY = 86_400_000
const toMs = (d: ISODate) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))
const fromMs = (t: number): ISODate => new Date(t).toISOString().slice(0, 10)
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function addCadence(date: ISODate, cadence: Cadence): ISODate {
  if (cadence === 'weekly') return fromMs(toMs(date) + 7 * DAY)
  const months = cadence === 'monthly' ? 1 : cadence === 'quarterly' ? 3 : 12
  const [y, m, d] = date.split('-').map(Number)
  const t = y * 12 + (m - 1) + months
  const ny = Math.floor(t / 12)
  const nm = (t % 12) + 1
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate()
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
}

/**
 * Cargos que se repiten con cadencia regular (suscripciones, recibos, cuotas). Un concepto cuenta si la mayoría
 * de sus intervalos caen en la ventana de una cadencia y sus importes son estables (o cambian por escalones).
 */
export function detectRecurring(movements: Movement[], today: ISODate): Recurring[] {
  const groups = new Map<string, Movement[]>()
  for (const m of movements) {
    if (m.kind !== 'expense') continue
    const g = groups.get(m.conceptKey)
    if (g) g.push(m)
    else groups.set(m.conceptKey, [m])
  }

  const out: Recurring[] = []
  for (const [key, ms] of groups) {
    if (ms.length < 2) continue
    ms.sort((a, b) => a.date.localeCompare(b.date))
    const gaps = ms.slice(1).map((m, i) => (toMs(m.date) - toMs(ms[i].date)) / DAY)
    const med = median(gaps)
    const c = CADENCES.find((x) => med >= x.min && med <= x.max)
    if (!c || ms.length < c.minCount) continue
    const regular = gaps.filter((g) => g >= c.min * 0.75 && g <= c.max * 1.25).length / gaps.length
    if (regular < 0.75) continue
    const amounts = ms.map((m) => Math.abs(m.amount))
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length
    const cv = Math.sqrt(amounts.reduce((a, v) => a + (v - mean) ** 2, 0) / amounts.length) / mean
    if (cv > c.maxCv) continue
    if (c.cadence === 'yearly' && ms.length < 3 && cv > 0.01) continue

    // Cambios de precio: un salto que se mantiene en el cargo siguiente (o es el último).
    const priceChanges: PriceChange[] = []
    for (let i = 1; i < amounts.length; i++) {
      const prev = amounts[i - 1]
      const cur = amounts[i]
      const persists = i === amounts.length - 1 || Math.abs(amounts[i + 1] - cur) / cur < 0.01
      if (Math.abs(cur - prev) / prev >= 0.01 && persists && cv < 0.15) priceChanges.push({ date: ms[i].date, from: prev, to: cur })
    }

    const last = ms[ms.length - 1]
    const nextDate = addCadence(last.date, c.cadence)
    const amount = Math.abs(last.amount)
    out.push({
      conceptKey: key,
      label: last.concept,
      categoryId: last.categoryId,
      cadence: c.cadence,
      amount,
      occurrences: ms.map((m) => ({ date: m.date, amount: Math.abs(m.amount) })),
      lastDate: last.date,
      nextDate,
      // Margen de una semana (o de la mitad del periodo en semanales) antes de darlo por cancelado.
      active: toMs(nextDate) + (c.cadence === 'weekly' ? 3 : 10) * DAY >= toMs(today),
      priceChanges,
      yearly: amount * c.perYear,
    })
  }
  return out.sort((a, b) => b.yearly - a.yearly)
}

/** Próximos cargos de recurrentes activos dentro de `days` días. */
export function upcomingCharges(recurring: Recurring[], today: ISODate, days = 14): Recurring[] {
  const limit = toMs(today) + days * DAY
  return recurring.filter((r) => r.active && r.nextDate >= today && toMs(r.nextDate) <= limit).sort((a, b) => a.nextDate.localeCompare(b.nextDate))
}
