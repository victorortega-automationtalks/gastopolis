import { addMonths, rootIndex } from './series'
import type { Category, ISODate, Movement } from './types'

/** Lo que pasa en un mes normal según tus datos: la línea base del Laboratorio. */
export interface Baseline {
  /** Meses completos en los que se basa la media. */
  months: string[]
  income: number
  /** Gasto medio al mes por categoría raíz. */
  expenseByCat: Map<string, number>
  expenses: number
  /** Lo que apartas al mes a ahorro/inversión (transferencias netas). Informativo: no cambia lo que tienes. */
  setAside: number
}

/** Palancas: lo que cambiarías. Cada una lleva su id para poder editarla y quitarla. */
export type Lever =
  | { id: string; type: 'cut'; categoryId: string; pct: number }
  | { id: string; type: 'cap'; categoryId: string; amount: number }
  | { id: string; type: 'cancel'; conceptKey: string; label: string; monthly: number }
  | { id: string; type: 'income'; monthly: number; fromMonth: number }
  | { id: string; type: 'oneoff'; amount: number; atMonth: number; label: string }
  | { id: string; type: 'invest'; share: number; rate: number }

export type LeverType = Lever['type']

export const LEVER_LABEL: Record<LeverType, string> = {
  cut: 'Recortar una categoría',
  cap: 'Poner tope a una categoría',
  cancel: 'Cancelar un cargo fijo',
  income: 'Cambio de ingresos',
  oneoff: 'Gasto o ingreso puntual',
  invest: 'Invertir lo ahorrado',
}

export interface Assumptions {
  years: number
  /** Subida anual de los gastos (0.025 = 2,5 %). */
  inflation: number
  /** Subida anual de los ingresos. */
  incomeGrowth: number
  /** Lo que ya tienes hoy. */
  startBalance: number
}

export const DEFAULT_ASSUMPTIONS: Assumptions = { years: 5, inflation: 0.025, incomeGrowth: 0.02, startBalance: 0 }

export interface Projection {
  /** Patrimonio al cierre de cada mes (índice 0 = hoy), sin cambios y con las palancas. */
  baseline: number[]
  scenario: number[]
  /** Lo que sobra al mes el primer mes, sin cambios y con las palancas. */
  monthlyBase: number
  monthlyScenario: number
}

/**
 * Media de los últimos `n` meses completos antes del mes de `asOf` (el mes en curso está a medias). Si no hay
 * ninguno completo, el mes en curso tal cual.
 */
export function baselineFrom(movements: Movement[], categories: Category[], asOf: ISODate, n = 6): Baseline {
  const current = asOf.slice(0, 7)
  const all = [...new Set(movements.map((m) => m.date.slice(0, 7)))].sort()
  const complete = all.filter((k) => k < current)
  const months = complete.length ? complete.slice(-n) : all.filter((k) => k === current)
  const inWindow = new Set(months)
  const root = rootIndex(categories)
  const expenseByCat = new Map<string, number>()
  let income = 0
  let setAside = 0
  for (const m of movements) {
    if (!inWindow.has(m.date.slice(0, 7))) continue
    if (m.kind === 'income') income += Math.abs(m.amount)
    else if (m.kind === 'expense') {
      const id = root(m.categoryId)
      expenseByCat.set(id, (expenseByCat.get(id) ?? 0) + Math.abs(m.amount))
    } else setAside -= m.amount
  }
  const k = Math.max(1, months.length)
  for (const [id, v] of expenseByCat) expenseByCat.set(id, v / k)
  const expenses = [...expenseByCat.values()].reduce((a, b) => a + b, 0)
  return { months, income: income / k, expenseByCat, expenses, setAside: setAside / k }
}

/** Ahorro al mes que aporta una palanca (al principio, antes de inflación). Las puntuales y la inversión, 0. */
export function leverMonthly(base: Baseline, l: Lever): number {
  switch (l.type) {
    case 'cut':
      return (base.expenseByCat.get(l.categoryId) ?? 0) * Math.min(1, Math.max(0, l.pct))
    case 'cap':
      return Math.max(0, (base.expenseByCat.get(l.categoryId) ?? 0) - Math.max(0, l.amount))
    case 'cancel':
      return Math.max(0, l.monthly)
    case 'income':
      return l.fromMonth <= 0 ? l.monthly : 0
    default:
      return 0
  }
}

/**
 * Proyección mes a mes. Lo que sobra cada mes (ingresos − gastos) se suma a lo que tienes; los gastos suben con la
 * inflación y los ingresos con su propia subida. Las palancas cambian el escenario; la línea base sigue igual.
 * «Invertir» hace que una parte de lo acumulado rente al tipo anual indicado, con interés compuesto mensual.
 */
export function project(base: Baseline, levers: Lever[], a: Assumptions): Projection {
  const months = Math.max(1, Math.round(a.years * 12))
  const cutsByCat = new Map<string, number>()
  let cancelled = 0
  for (const l of levers) {
    if (l.type === 'cut' || l.type === 'cap') cutsByCat.set(l.categoryId, Math.max(cutsByCat.get(l.categoryId) ?? 0, leverMonthly(base, l)))
    if (l.type === 'cancel') cancelled += Math.max(0, l.monthly)
  }
  const cuts = [...cutsByCat.values()].reduce((x, y) => x + y, 0) + cancelled
  const invest = levers.filter((l): l is Extract<Lever, { type: 'invest' }> => l.type === 'invest')
  const monthlyRate = invest.reduce((acc, l) => acc + Math.min(1, Math.max(0, l.share)) * (Math.pow(1 + l.rate, 1 / 12) - 1), 0)

  const baseline = [a.startBalance]
  const scenario = [a.startBalance]
  let monthlyBase = 0
  let monthlyScenario = 0
  for (let m = 0; m < months; m++) {
    const exp = Math.pow(1 + a.inflation, m / 12)
    const inc = Math.pow(1 + a.incomeGrowth, m / 12)
    const baseNet = base.income * inc - base.expenses * exp
    let extraIncome = 0
    let oneoff = 0
    for (const l of levers) {
      if (l.type === 'income' && m >= l.fromMonth) extraIncome += l.monthly * inc
      if (l.type === 'oneoff' && m === l.atMonth) oneoff += l.amount
    }
    const scenNet = baseNet + cuts * exp + extraIncome + oneoff
    if (m === 0) {
      monthlyBase = baseNet
      monthlyScenario = scenNet - oneoff
    }
    baseline.push(baseline[m] + baseNet)
    const prev = scenario[m]
    scenario.push(prev + (prev > 0 ? prev * monthlyRate : 0) + scenNet)
  }
  return { baseline, scenario, monthlyBase, monthlyScenario }
}

/** Valor en cada horizonte (1, 3, 5, 10 años) que cabe en la proyección. */
export function atHorizons(series: number[]): { years: number; value: number }[] {
  return [1, 3, 5, 10].filter((y) => y * 12 < series.length).map((y) => ({ years: y, value: series[y * 12] }))
}

/**
 * Cuánto antes llega un objetivo si recibe además `extra` al mes. Devuelve meses hasta llegar sin y con el extra
 * (null si al ritmo actual no llega nunca).
 */
export function goalSooner(remaining: number, pace: number, extra: number): { before: number | null; after: number | null; sooner: number | null } {
  if (remaining <= 0) return { before: 0, after: 0, sooner: 0 }
  const before = pace > 0 ? Math.ceil(remaining / pace) : null
  const after = pace + extra > 0 ? Math.ceil(remaining / (pace + extra)) : null
  return { before, after, sooner: before != null && after != null ? before - after : null }
}

/** «2031-04» a partir de un mes de referencia y un número de meses. */
export function monthAfter(fromMonth: string, months: number): string {
  return addMonths(fromMonth, months)
}
