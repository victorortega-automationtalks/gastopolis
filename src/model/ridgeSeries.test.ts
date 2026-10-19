import { describe, expect, it } from 'vitest'
import { autoBucket, bucketLabel, bucketPosition, seriesByBucket } from './ridgeSeries'
import type { Category, Movement } from './types'

const cat = (id: string, parentId: string | null = null): Category => ({ id, name: id, kind: 'expense', parentId, color: '#123456', icon: 'Tag', order: 0 })
let seq = 0
const mov = (date: string, categoryId: string, amount: number): Movement => ({
  id: `m${seq++}`,
  date,
  amount,
  kind: 'expense',
  concept: categoryId,
  conceptKey: categoryId,
  categoryId,
  tags: [],
  source: 'manual',
  createdAt: 0,
})
const cats = [cat('casa'), cat('ocio'), cat('cine', 'ocio')]

describe('cordillera: agrupación adaptativa', () => {
  it('elige días, semanas o meses según lo que abarcan los datos', () => {
    expect(autoBucket('2026-10-01', '2026-10-31')).toBe('day')
    expect(autoBucket('2026-05-01', '2026-10-31')).toBe('week')
    expect(autoBucket('2025-05-01', '2026-10-31')).toBe('month')
  })

  it('un mes de datos da una cresta por días, con su relieve', () => {
    const ms = [mov('2026-10-01', 'casa', -700), mov('2026-10-03', 'cine', -12), mov('2026-10-15', 'ocio', -30), mov('2026-10-31', 'casa', -50)]
    const s = seriesByBucket(ms, cats, 'expense', 'root', 'auto')
    expect(s.bucket).toBe('day')
    expect(s.frames).toHaveLength(31)
    const casa = s.rows.find((r) => r.categoryId === 'casa')!
    expect(casa.values[0]).toBe(700)
    expect(casa.values[30]).toBe(50)
    // Las subcategorías suben a su raíz.
    expect(s.rows.find((r) => r.categoryId === 'ocio')!.total).toBe(42)
  })

  it('con un solo tramo, antepone otro a cero', () => {
    const s = seriesByBucket([mov('2026-10-14', 'casa', -10)], cats, 'expense', 'root', 'month')
    expect(s.frames.map((f) => f.from)).toEqual(['2026-09-01', '2026-10-01'])
    expect(s.rows[0].values).toEqual([0, 10])
    const d = seriesByBucket([mov('2026-10-14', 'casa', -10)], cats, 'expense', 'root', 'day')
    expect(d.frames.map((f) => f.from)).toEqual(['2026-10-13', '2026-10-14'])
  })

  it('posición continua de una fecha sobre los tramos', () => {
    const s = seriesByBucket([mov('2026-01-05', 'casa', -1), mov('2026-03-20', 'casa', -1)], cats, 'expense', 'root', 'month')
    expect(bucketPosition(s.frames, '2026-01-31')).toBe(0)
    expect(bucketPosition(s.frames, '2026-02-28')).toBe(1)
    expect(bucketPosition(s.frames, '2026-03-16')).toBeCloseTo(1 + 16 / 31)
    expect(bucketPosition(s.frames, '2030-01-01')).toBe(2)
  })

  it('rótulos del eje', () => {
    expect(bucketLabel({ from: '2026-10-12', to: '2026-10-12' }, 'day')).toBe('12 oct')
    expect(bucketLabel({ from: '2026-03-09', to: '2026-03-15' }, 'week', true)).toBe('semana del 9 mar 2026')
    expect(bucketLabel({ from: '2025-10-01', to: '2025-10-31' }, 'month')).toBe('oct 2025')
  })
})
