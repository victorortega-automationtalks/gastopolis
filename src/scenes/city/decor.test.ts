import { describe, expect, it } from 'vitest'
import { buildHierarchy } from '../../model/hierarchy'
import type { Category, Movement } from '../../model/types'
import { buildDecor, perimeter, pointOnLoop } from './decor'
import { layoutCity } from './layout'

const cats: Category[] = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({
  id,
  name: id.toUpperCase(),
  kind: 'expense',
  parentId: null,
  color: '#3987e5',
  icon: 'X',
  order: i,
}))
const movs: Movement[] = Array.from({ length: 60 }, (_, i) => ({
  id: `m${i}`,
  date: `2025-0${(i % 6) + 1}-10`,
  amount: -(10 + ((i * 37) % 200)),
  kind: 'expense',
  concept: `c${i % 12}`,
  conceptKey: `c${i % 12}`,
  categoryId: cats[i % cats.length].id,
  tags: [],
  source: 'manual',
  createdAt: 0,
}))
const layout = layoutCity(buildHierarchy(movs, cats, ['category', 'concept'], 'Gastos'), { depth: 2, heightBy: 'count', colorBy: 'category' })
const inside = (x: number, z: number, b: { x: number; z: number; w: number; d: number }, margin = 0) =>
  Math.abs(x - b.x) < b.w / 2 - margin && Math.abs(z - b.z) < b.d / 2 - margin

describe('recorrido de coches', () => {
  const r = { x0: 0, z0: 0, x1: 4, z1: 2 }
  it('recorre el rectángulo en sentido horario y vuelve al inicio', () => {
    expect(perimeter(r)).toBe(12)
    expect(pointOnLoop(r, 0)).toMatchObject({ x: 0, z: 0, angle: 0 })
    expect(pointOnLoop(r, 5)).toMatchObject({ x: 4, z: 1 })
    expect(pointOnLoop(r, 7)).toMatchObject({ x: 3, z: 2, angle: Math.PI })
    expect(pointOnLoop(r, 11)).toMatchObject({ x: 0, z: 1 })
    expect(pointOnLoop(r, 12)).toMatchObject({ x: 0, z: 0 })
    expect(pointOnLoop(r, -1)).toMatchObject({ x: 0, z: 1 })
  })
})

describe('decorado', () => {
  const high = buildDecor(layout, { quality: 'high', seed: 42 })

  it('es determinista', () => {
    expect(buildDecor(layout, { quality: 'high', seed: 42 })).toEqual(high)
    expect(buildDecor(layout, { quality: 'high', seed: 7 }).lots).not.toEqual(high.lots)
  })

  it('las farolas y los coches van por la calle, nunca dentro de una manzana', () => {
    for (const l of high.lamps) for (const d of layout.districts) expect(inside(l.x, l.z, d)).toBe(false)
    for (const loop of high.loops)
      for (const s of loop.starts) {
        const p = pointOnLoop(loop.rect, s)
        for (const d of layout.districts) expect(inside(p.x, p.z, d)).toBe(false)
      }
  })

  it('el extrarradio no pisa la ronda ni el río', () => {
    for (const lot of high.lots) {
      expect(Math.max(Math.abs(lot.x), Math.abs(lot.z)) - lot.w / 2).toBeGreaterThan(high.ring.outer)
      const overlapsRiver = lot.z + lot.d / 2 > high.river.z0 && lot.z - lot.d / 2 < high.river.z1
      expect(overlapsRiver).toBe(false)
    }
  })

  it('lo de las azoteas queda dentro de su torre', () => {
    expect(high.roof.length).toBeGreaterThan(0)
    for (const r of high.roof) {
      const t = layout.buildings[r.building].towers[r.tower]
      expect(Math.abs(r.dx - t.dx) + r.w / 2).toBeLessThanOrEqual(t.w / 2 + 1e-9)
      expect(Math.abs(r.dz - t.dz) + r.d / 2).toBeLessThanOrEqual(t.d / 2 + 1e-9)
    }
  })

  it('la calidad ligera genera bastante menos', () => {
    const low = buildDecor(layout, { quality: 'low', seed: 42 })
    const cars = (d: typeof high) => d.loops.reduce((a, l) => a + l.starts.length, 0)
    expect(cars(low)).toBeLessThan(cars(high) * 0.6)
    expect(low.lots.length).toBeLessThan(high.lots.length * 0.6)
    expect(low.lamps.length).toBeLessThan(high.lamps.length)
  })
})
