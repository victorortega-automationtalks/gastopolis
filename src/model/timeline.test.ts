import { describe, expect, it } from 'vitest'
import { buildFrames, frameIndexOf, frameLabel, monthPosition, weekStart } from './timeline'

describe('línea de tiempo', () => {
  it('días, semanas (de lunes a domingo) y meses', () => {
    expect(buildFrames('2026-02-27', '2026-03-02', 'day').map((f) => f.from)).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02'])
    // 2026-03-04 es miércoles: la semana empieza el lunes 2.
    expect(weekStart('2026-03-04')).toBe('2026-03-02')
    expect(buildFrames('2026-03-04', '2026-03-16', 'week')).toEqual([
      { from: '2026-03-02', to: '2026-03-08' },
      { from: '2026-03-09', to: '2026-03-15' },
      { from: '2026-03-16', to: '2026-03-22' },
    ])
    expect(buildFrames('2025-12-20', '2026-02-03', 'month')).toEqual([
      { from: '2025-12-01', to: '2025-12-31' },
      { from: '2026-01-01', to: '2026-01-31' },
      { from: '2026-02-01', to: '2026-02-28' },
    ])
  })

  it('etiquetas legibles', () => {
    expect(frameLabel({ from: '2026-03-09', to: '2026-03-15' }, 'week')).toBe('sem. 9–15 mar 2026')
    expect(frameLabel({ from: '2026-03-30', to: '2026-04-05' }, 'week')).toBe('sem. 30 mar–5 abr 2026')
    expect(frameLabel({ from: '2026-03-01', to: '2026-03-31' }, 'month')).toBe('marzo 2026')
  })

  it('busca el fotograma de una fecha', () => {
    const f = buildFrames('2026-01-01', '2026-03-31', 'month')
    expect(frameIndexOf(f, '2026-02-14')).toBe(1)
    expect(frameIndexOf(f, '2030-01-01')).toBe(2)
  })

  it('posición continua sobre los meses de la Cordillera', () => {
    const months = ['2026-01', '2026-02', '2026-03']
    expect(monthPosition(months, '2026-01-31')).toBe(0)
    expect(monthPosition(months, '2026-02-28')).toBe(1)
    expect(monthPosition(months, '2026-03-16')).toBeCloseTo(1 + 16 / 31)
    expect(monthPosition(months, '2027-01-01')).toBe(2)
  })
})
