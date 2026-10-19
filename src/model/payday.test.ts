import { describe, expect, it } from 'vitest'
import { monthlyTotals } from './series'
import { bookMovements, dayOffset, paydayShifts, shownDate } from './payday'
import type { Movement } from './types'

let seq = 0
const mv = (date: string, amount: number, categoryId = 'nomina', kind: Movement['kind'] = 'income'): Movement => ({
  id: `m${seq++}`,
  date,
  amount,
  kind,
  concept: 'Nómina',
  conceptKey: 'nomina',
  categoryId,
  tags: [],
  source: 'manual',
  createdAt: 0,
})

describe('nómina inteligente', () => {
  it('desfase respecto al día 1', () => {
    expect(dayOffset('2026-09-28')).toBe(-3)
    expect(dayOffset('2026-09-30')).toBe(-1)
    expect(dayOffset('2026-10-01')).toBe(0)
    expect(dayOffset('2026-10-03')).toBe(2)
  })

  it('si suele llegar a final de mes, cuenta para el siguiente; y si un mes se retrasa al día 1, también', () => {
    const late = [mv('2026-06-27', 2000), mv('2026-07-28', 2000), mv('2026-08-28', 2000), mv('2026-10-01', 2000)]
    const { shifts, series } = paydayShifts(late)
    expect(series).toHaveLength(1)
    expect(series[0].offset).toBeLessThan(0)
    expect(shifts.get(late[0].id)).toBe('2026-07-01')
    expect(shifts.get(late[1].id)).toBe('2026-08-01')
    expect(shifts.get(late[2].id)).toBe('2026-09-01')
    // El del 1 de octubre se retrasó: ya es de octubre, no se mueve (y septiembre no se queda sin nómina).
    expect(shifts.has(late[3].id)).toBe(false)
    const months = monthlyTotals(bookMovements(late), ['2026-07', '2026-08', '2026-09', '2026-10']).map((r) => r.income)
    expect(months).toEqual([2000, 2000, 2000, 2000])
  })

  it('si suele llegar a primeros, se queda en su mes salvo que se adelante al final del anterior', () => {
    const early = [mv('2026-06-01', 1800), mv('2026-07-02', 1800), mv('2026-08-01', 1800), mv('2026-08-29', 1800), mv('2026-10-01', 1800)]
    const { shifts } = paydayShifts(early)
    expect(shifts.size).toBe(1)
    expect(shifts.get(early[3].id)).toBe('2026-09-01')
  })

  it('los ingresos pequeños de la misma categoría y los que no son mensuales no se mueven', () => {
    const list = [mv('2026-06-28', 2000), mv('2026-07-28', 2000), mv('2026-08-28', 2000), mv('2026-08-30', 15)]
    const { shifts } = paydayShifts(list)
    expect(shifts.has(list[3].id)).toBe(false)
    // Bizums de amigos: varios al mes, no es una nómina.
    const bizum = ['01', '05', '12', '20', '28'].flatMap((d) => ['06', '07', '08'].map((m) => mv(`2026-${m}-${d}`, 20, 'bizum')))
    expect(paydayShifts(bizum).shifts.size).toBe(0)
    // Ventas de segunda mano sueltas: una al mes algunos meses, cualquier día. Tampoco.
    const sales = ['2026-03-04', '2026-04-22', '2026-06-11', '2026-07-27', '2026-10-19'].map((d) => mv(d, 30, 'ventas'))
    expect(paydayShifts(sales).series).toHaveLength(0)
  })

  it('la fecha real se conserva para enseñarla', () => {
    const list = [mv('2026-06-28', 2000), mv('2026-07-28', 2000), mv('2026-08-28', 2000)]
    const booked = bookMovements(list)
    expect(booked[0].date).toBe('2026-07-01')
    expect(shownDate(booked[0])).toBe('2026-06-28')
    // Sin nada que mover, el mismo array (no invalida memorias).
    const none = [mv('2026-06-02', 10, 'otros')]
    expect(bookMovements(none)).toBe(none)
  })
})
