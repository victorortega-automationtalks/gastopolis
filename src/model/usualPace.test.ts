import { describe, expect, it } from 'vitest'
import { usualPace } from './insights'

const mv = (date: string, amount: number, kind: 'expense' | 'income' | 'transfer' = amount < 0 ? 'expense' : 'income') => ({ date, amount, kind })

describe('¿gastas más o menos que de costumbre?', () => {
  it('compara con la media de los meses anteriores hasta el mismo día', () => {
    const r = usualPace(
      [
        mv('2026-11-02', -50),
        mv('2026-11-03', -999), // después de hoy: no cuenta
        mv('2026-10-01', -100),
        mv('2026-10-20', -500), // después del día 2: no cuenta
        mv('2026-09-02', -40),
        mv('2026-08-01', -60),
        mv('2026-08-01', 2000),
        mv('2026-10-02', -300, 'transfer'),
        mv('2026-07-01', -999), // fuera de los tres meses
      ],
      '2026-11-02',
    )
    expect(r).toEqual({ spent: 50, usual: 66.67, months: 3 })
  })

  it('sin meses anteriores no hay con qué comparar; un mes sin movimientos no baja la media', () => {
    expect(usualPace([mv('2026-11-01', -10)], '2026-11-02')).toEqual({ spent: 10, usual: null, months: 0 })
    expect(usualPace([mv('2026-10-01', -90)], '2026-11-02')).toEqual({ spent: 0, usual: 90, months: 1 })
  })
})
