import { describe, expect, it } from 'vitest'
import { calendarMonth, heat, shiftDay, shiftMonth } from './calendar'

const mv = (date: string, amount: number, kind: 'expense' | 'income' | 'transfer' = amount < 0 ? 'expense' : 'income') => ({ date, amount, kind })

describe('calendario', () => {
  it('el mes en semanas de lunes a domingo, con los días de fuera marcados', () => {
    // Octubre de 2026 empieza en jueves y acaba en sábado.
    const cal = calendarMonth([], '2026-10', '2026-10-19')
    expect(cal.weeks[0].map((d) => d.iso)[0]).toBe('2026-09-28')
    expect(cal.weeks[0][3]).toMatchObject({ iso: '2026-10-01', day: 1, inMonth: true })
    expect(cal.weeks.every((w) => w.length === 7)).toBe(true)
    expect(cal.weeks.at(-1)!.some((d) => d.iso === '2026-10-31')).toBe(true)
    expect(cal.weeks).toHaveLength(5)
    expect(cal.weeks[2][5]).toMatchObject({ iso: '2026-10-17', weekend: true })
    expect(cal.weeks[3][0]).toMatchObject({ iso: '2026-10-19', isToday: true, isFuture: false })
  })

  it('suma lo gastado e ingresado por día y semana; los traspasos no cuentan', () => {
    const cal = calendarMonth(
      [mv('2026-10-05', -20), mv('2026-10-05', -5.5), mv('2026-10-06', 1500), mv('2026-10-06', -300, 'transfer'), mv('2026-11-01', -99)],
      '2026-10',
      '2026-10-19',
    )
    const day5 = cal.weeks.flat().find((d) => d.iso === '2026-10-05')!
    expect(day5).toMatchObject({ expense: 25.5, income: 0, count: 2 })
    const day6 = cal.weeks.flat().find((d) => d.iso === '2026-10-06')!
    expect(day6).toMatchObject({ expense: 0, income: 1500, count: 2 })
    expect(cal.weekTotals[1]).toEqual({ expense: 25.5, income: 1500 })
    expect(cal).toMatchObject({ expense: 25.5, income: 1500, maxDay: { iso: '2026-10-05' } })
  })

  it('días sin gastar y mejor racha, solo hasta hoy', () => {
    const cal = calendarMonth([mv('2026-10-03', -10), mv('2026-10-10', -10)], '2026-10', '2026-10-12')
    // Del 1 al 12: dos días con gasto.
    expect(cal.noSpendDays).toBe(10)
    expect(cal.bestStreak).toBe(6)
    expect(cal.elapsed).toBe(12)
    expect(cal.perDay).toBeCloseTo(1.67, 2)
  })

  it('moverse por meses y días, e intensidad del calor', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftDay('2026-10-31', 1)).toBe('2026-11-01')
    expect(heat(0, 100)).toBe(0)
    expect(heat(25, 100)).toBe(0.5)
    expect(heat(200, 100)).toBe(1)
  })
})
