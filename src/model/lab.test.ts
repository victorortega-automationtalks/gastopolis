import { describe, expect, it } from 'vitest'
import { atHorizons, baselineFrom, goalSooner, leverMonthly, project, type Assumptions } from './lab'
import type { Category, Kind, Movement } from './types'

const cat = (id: string, kind: Kind, parentId: string | null = null): Category => ({ id, name: id, kind, parentId, color: '#000', icon: 'Tag', order: 0 })
let seq = 0
const mov = (date: string, categoryId: string, kind: Kind, amount: number): Movement => ({
  id: `m${seq++}`,
  date,
  amount,
  kind,
  concept: categoryId,
  conceptKey: categoryId,
  categoryId,
  tags: [],
  source: 'manual',
  createdAt: 0,
})
const cats = [cat('nomina', 'income'), cat('ocio', 'expense'), cat('rest', 'expense', 'ocio'), cat('casa', 'expense'), cat('ahorro', 'transfer')]
// Tres meses completos (ene–mar) iguales y un abril a medias que no debe contar.
const ms = ['01', '02', '03'].flatMap((m) => [
  mov(`2026-${m}-01`, 'nomina', 'income', 2000),
  mov(`2026-${m}-05`, 'casa', 'expense', -800),
  mov(`2026-${m}-10`, 'rest', 'expense', -300),
  mov(`2026-${m}-28`, 'ahorro', 'transfer', -400),
])
ms.push(mov('2026-04-02', 'casa', 'expense', -5000))
const flat: Assumptions = { years: 1, inflation: 0, incomeGrowth: 0, startBalance: 1000 }

describe('laboratorio', () => {
  it('línea base: media de los meses completos, por categoría raíz', () => {
    const b = baselineFrom(ms, cats, '2026-04-15')
    expect(b.months).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(b.income).toBe(2000)
    expect(b.expenseByCat.get('ocio')).toBe(300)
    expect(b.expenses).toBe(1100)
    expect(b.setAside).toBe(400)
  })

  it('sin palancas, el escenario es la línea base', () => {
    const b = baselineFrom(ms, cats, '2026-04-15')
    const p = project(b, [], flat)
    expect(p.baseline).toEqual(p.scenario)
    expect(p.baseline[12]).toBe(1000 + 12 * 900)
  })

  it('recortar, topar, cancelar y subir ingresos suman al mes; la puntual una vez', () => {
    const b = baselineFrom(ms, cats, '2026-04-15')
    expect(leverMonthly(b, { id: 'a', type: 'cut', categoryId: 'ocio', pct: 0.5 })).toBe(150)
    expect(leverMonthly(b, { id: 'b', type: 'cap', categoryId: 'casa', amount: 700 })).toBe(100)
    const p = project(
      b,
      [
        { id: 'a', type: 'cut', categoryId: 'ocio', pct: 0.5 },
        { id: 'c', type: 'cancel', conceptKey: 'x', label: 'X', monthly: 10 },
        { id: 'd', type: 'income', monthly: 100, fromMonth: 0 },
        { id: 'e', type: 'oneoff', amount: -2000, atMonth: 3, label: 'Coche' },
      ],
      flat,
    )
    expect(p.monthlyScenario - p.monthlyBase).toBe(260)
    expect(p.scenario[12] - p.baseline[12]).toBe(12 * 260 - 2000)
  })

  it('dos palancas sobre la misma categoría no se suman dos veces', () => {
    const b = baselineFrom(ms, cats, '2026-04-15')
    const p = project(
      b,
      [
        { id: 'a', type: 'cut', categoryId: 'ocio', pct: 0.5 },
        { id: 'b', type: 'cut', categoryId: 'ocio', pct: 0.2 },
      ],
      flat,
    )
    expect(p.monthlyScenario - p.monthlyBase).toBe(150)
  })

  it('invertir: interés compuesto sobre lo acumulado; la inflación encarece los gastos', () => {
    const b = baselineFrom(ms, cats, '2026-04-15')
    const p = project(b, [{ id: 'i', type: 'invest', share: 1, rate: 0.06 }], { ...flat, years: 10 })
    expect(p.scenario[120]).toBeGreaterThan(p.baseline[120] * 1.25)
    const caro = project(b, [], { ...flat, years: 10, inflation: 0.03 })
    expect(caro.baseline[120]).toBeLessThan(p.baseline[120])
    expect(atHorizons(p.scenario).map((h) => h.years)).toEqual([1, 3, 5, 10])
    expect(atHorizons(project(b, [], flat).scenario).map((h) => h.years)).toEqual([1])
  })

  it('cuánto antes se llega a un objetivo con un extra al mes', () => {
    expect(goalSooner(12000, 500, 250)).toEqual({ before: 24, after: 16, sooner: 8 })
    expect(goalSooner(1000, 0, 0)).toEqual({ before: null, after: null, sooner: null })
  })
})
