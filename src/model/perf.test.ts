import { describe, expect, it } from 'vitest'
import { buildStress } from '../data/stress'
import { growthIndex } from '../scenes/city/growth'
import { layoutCity } from '../scenes/city/layout'
import { layoutRidge } from '../scenes/ridge/layout'
import { applyFilters } from './aggregate'
import { balanceBetween } from './balance'
import { DEFAULT_FILTERS } from './period'
import { moneyFlow } from './flow'
import { buildHierarchy } from './hierarchy'
import { baselineFrom, project, DEFAULT_ASSUMPTIONS } from './lab'
import { detectLeaks } from './leaks'
import { detectRecurring } from './recurring'
import { seriesByBucket } from './ridgeSeries'
import { budgetStatus, monthProjection, noSpendStreak } from './insights'
import { buildFrames } from './timeline'

/**
 * Rendimiento con 12.000 movimientos en 8 años y 900 comercios. Los límites son holgados (la máquina de CI es lenta
 * y compartida): lo que vigilan es que nada se vuelva cuadrático. Los tiempos reales se imprimen con PERF=1.
 */
const { categories, movements } = buildStress(12000, 8)
const asOf = '2026-10-18'
const timings: [string, number][] = []
const time = <T>(name: string, fn: () => T): T => {
  const t0 = performance.now()
  const r = fn()
  timings.push([name, performance.now() - t0])
  return r
}

describe('rendimiento con 12.000 movimientos', () => {
  it('cada cálculo de pantalla tarda poco', () => {
    expect(movements.length).toBeGreaterThan(11000)
    const all = time('filtros', () => applyFilters(movements, DEFAULT_FILTERS, categories, asOf))
    const expenses = all.filter((m) => m.kind === 'expense')
    const root = time('jerarquía de la Ciudad', () => buildHierarchy(expenses, categories, ['category', 'concept'], 'Gastos'))
    const city = time('plano de la Ciudad', () => layoutCity(root, { depth: 2, heightBy: 'count', colorBy: 'category' }))
    const grow = time('índice de crecimiento', () => growthIndex(city, 'count'))
    const frames = buildFrames('2018-11-01', asOf, 'day')
    time(`${frames.length} fotogramas de crecimiento`, () => frames.forEach((f, i) => i % 7 === 0 && grow(f.to)))
    time('Cordillera (meses)', () => layoutRidge(seriesByBucket(movements, categories, 'expense', 'root', 'auto')))
    time('Cordillera (días)', () => layoutRidge(seriesByBucket(movements, categories, 'expense', 'root', 'day')))
    time('Balanza (un tramo)', () => balanceBetween(movements, categories, '2026-01-01', '2026-01-31'))
    time('Río', () => moneyFlow(movements, categories, { splitExpenses: true, expenseColor: '#f00', leftoverColor: '#0f0', deficitColor: '#ff0' }))
    time('recurrentes', () => detectRecurring(movements, asOf))
    time('fugas', () => detectLeaks(movements, categories, asOf, { antMax: 5, dupDays: 2 }))
    time('Inicio: presupuestos, proyección, racha', () => [
      budgetStatus(movements, categories, asOf),
      monthProjection(movements, asOf),
      noSpendStreak(movements, asOf),
    ])
    time('Laboratorio (10 años)', () => project(baselineFrom(movements, categories, asOf), [], { ...DEFAULT_ASSUMPTIONS, years: 10 }))
    if (import.meta.env.PERF) console.table(timings.map(([n, ms]) => ({ cálculo: n, ms: Math.round(ms * 10) / 10 })))
    for (const [name, ms] of timings) expect(ms, name).toBeLessThan(1500)
  })
})
