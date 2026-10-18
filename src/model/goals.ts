import { addMonths, monthRange } from './series'
import type { Goal, ISODate, Movement } from './types'

const DAY = 86_400_000
const MONTH_DAYS = 30.4375
const toMs = (d: ISODate) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))
const fromMs = (t: number): ISODate => new Date(t).toISOString().slice(0, 10)

export type GoalStatus = 'done' | 'on-track' | 'behind' | 'no-deadline' | 'stalled' | 'new'

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  done: 'Conseguido',
  'on-track': 'En camino',
  behind: 'Vas con retraso',
  'no-deadline': 'Sin fecha límite',
  stalled: 'Parado',
  new: 'Recién empezado',
}

/** Por debajo de esto no hay datos para hablar de ritmo (una aportación suelta no es «al mes»). */
const MIN_PACE_DAYS = 45

export interface GoalEntry {
  date: ISODate
  amount: number
  source: 'initial' | 'transfer' | 'manual'
  label: string
}

export interface GoalProgress {
  saved: number
  ratio: number
  remaining: number
  /**
   * Aportación media al mes en los últimos 6 meses. Las categorías vinculadas cuentan aunque sea antes del inicio del
   * objetivo: es la costumbre de ahorro. 0 si hay menos de ~6 semanas de datos (estado `new`).
   */
  monthlyPace: number
  /** Al mes para llegar a la fecha límite; null sin fecha. */
  monthlyNeeded: number | null
  monthsLeft: number | null
  /** Cuándo se llega al ritmo actual; null si no hay ritmo. */
  eta: ISODate | null
  status: GoalStatus
  milestones: { pct: 25 | 50 | 75 | 100; reachedAt: ISODate | null }[]
  /** Ahorro acumulado al cierre de cada mes desde el inicio. */
  history: { month: string; saved: number }[]
  entries: GoalEntry[]
}

/** Todo lo que suma (o resta) a un objetivo hasta `asOf`, en orden. */
export function goalEntries(goal: Goal, movements: Movement[], asOf: ISODate): GoalEntry[] {
  const linked = new Set(goal.linkedCategoryIds)
  const out: GoalEntry[] = []
  if (goal.initial) out.push({ date: goal.startDate, amount: goal.initial, source: 'initial', label: 'Ahorro inicial' })
  for (const m of movements) {
    if (!linked.has(m.categoryId) || m.date < goal.startDate || m.date > asOf) continue
    // Transferencia negativa = dinero apartado: suma al objetivo. Positiva = se saca: resta.
    out.push({ date: m.date, amount: -m.amount, source: 'transfer', label: m.concept })
  }
  for (const c of goal.contributions) if (c.date <= asOf) out.push({ date: c.date, amount: c.amount, source: 'manual', label: c.note || 'Aportación' })
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

export function goalProgress(goal: Goal, movements: Movement[], asOf: ISODate): GoalProgress {
  const entries = goalEntries(goal, movements, asOf)
  const saved = entries.reduce((a, e) => a + e.amount, 0)
  const remaining = Math.max(0, goal.target - saved)
  const ratio = goal.target > 0 ? Math.max(0, saved / goal.target) : 0

  // Ritmo: lo aportado en los últimos 6 meses (sin el ahorro inicial), entre los meses observados.
  const linked = new Set(goal.linkedCategoryIds)
  const windowStart = fromMs(toMs(asOf) - 182 * DAY)
  let observedFrom = goal.startDate
  let inWindow = 0
  for (const m of movements) {
    if (!linked.has(m.categoryId) || m.date > asOf) continue
    // Desde el día 1 de ese mes: seis traspasos mensuales son seis meses, no cinco.
    if (m.date < observedFrom) observedFrom = `${m.date.slice(0, 7)}-01`
    if (m.date >= windowStart) inWindow -= m.amount
  }
  for (const c of goal.contributions) if (c.date >= windowStart && c.date <= asOf) inWindow += c.amount
  const observedDays = (toMs(asOf) - toMs(observedFrom > windowStart ? observedFrom : windowStart)) / DAY
  const isNew = observedDays < MIN_PACE_DAYS
  const monthlyPace = isNew ? 0 : Math.max(0, inWindow / (observedDays / MONTH_DAYS))

  const monthsLeft = goal.deadline ? Math.max(0, (toMs(goal.deadline) - toMs(asOf)) / DAY / MONTH_DAYS) : null
  const monthlyNeeded = monthsLeft == null ? null : remaining <= 0 ? 0 : monthsLeft < 1 ? remaining : remaining / monthsLeft
  const eta = remaining <= 0 ? asOf : monthlyPace > 0 ? fromMs(toMs(asOf) + (remaining / monthlyPace) * MONTH_DAYS * DAY) : null

  let status: GoalStatus
  if (remaining <= 0) status = 'done'
  else if (isNew) status = 'new'
  else if (!goal.deadline) status = monthlyPace > 0 ? 'no-deadline' : 'stalled'
  else status = eta && eta <= goal.deadline ? 'on-track' : monthlyPace > 0 ? 'behind' : 'stalled'

  const milestones = ([25, 50, 75, 100] as const).map((pct) => {
    let acc = 0
    for (const e of entries) {
      acc += e.amount
      if (acc >= (goal.target * pct) / 100) return { pct, reachedAt: e.date }
    }
    return { pct, reachedAt: null }
  })

  const history: { month: string; saved: number }[] = []
  let acc = 0
  let i = 0
  for (const month of monthRange(goal.startDate.slice(0, 7), asOf.slice(0, 7))) {
    const end = addMonths(month, 1)
    while (i < entries.length && entries[i].date.slice(0, 7) < end) acc += entries[i++].amount
    history.push({ month, saved: acc })
  }

  return { saved, ratio, remaining, monthlyPace, monthlyNeeded, monthsLeft, eta, status, milestones, history, entries }
}

/** Colchón de emergencia sugerido: 6 meses del gasto medio de los últimos 6, redondeado a centenas. */
export function suggestedEmergencyFund(movements: Movement[], asOf: ISODate, months = 6): number {
  // Meses naturales: los 6 anteriores al de referencia (incluido), o menos si los datos empiezan después.
  const first = movements.reduce((min, m) => (m.date < min ? m.date : min), asOf).slice(0, 7)
  const window = monthRange([addMonths(asOf.slice(0, 7), -5), first].sort()[1], asOf.slice(0, 7))
  const inWindow = new Set(window)
  const spent = movements.filter((m) => m.kind === 'expense' && m.date <= asOf && inWindow.has(m.date.slice(0, 7))).reduce((a, m) => a - m.amount, 0)
  return Math.round(((spent / window.length) * months) / 100) * 100
}
