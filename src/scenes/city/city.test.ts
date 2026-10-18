import { describe, expect, it } from 'vitest'
import { buildHierarchy, findById, movementsOf, resolvePath } from '../../model/hierarchy'
import type { Category, Movement } from '../../model/types'
import { H_MAX, H_MIN, layoutCity } from './layout'

const cat = (id: string, name: string, parentId: string | null = null): Category => ({
  id,
  name,
  kind: 'expense',
  parentId,
  color: '#ff0000',
  icon: 'X',
  order: 0,
})
let seq = 0
const mov = (categoryId: string, concept: string, amount: number, date = '2025-01-10'): Movement => ({
  id: `m${seq++}`,
  date,
  amount,
  kind: 'expense',
  concept,
  conceptKey: concept.toLowerCase(),
  categoryId,
  tags: [],
  source: 'manual',
  createdAt: 0,
})

const categories = [cat('ocio', 'Ocio'), cat('rest', 'Restaurantes', 'ocio'), cat('subs', 'Suscripciones', 'ocio'), cat('gas', 'Gasolina')]
const movements = [
  mov('rest', 'Sushi', -30),
  mov('rest', 'sushi', -20, '2025-02-03'),
  mov('subs', 'Spotify', -10),
  mov('ocio', 'Cine', -8),
  mov('gas', 'Repsol', -60),
  mov('gas', 'Repsol', -55, '2025-02-01'),
  mov('gas', 'Cepsa', -40),
]

describe('jerarquía', () => {
  const root = buildHierarchy(movements, categories, ['category', 'concept'], 'Gastos')

  it('agrupa por categoría raíz, ordenado de mayor a menor', () => {
    expect(root.value).toBe(223)
    expect(root.children!.map((c) => [c.label, c.value])).toEqual([
      ['Gasolina', 155],
      ['Ocio', 68],
    ])
  })

  it('baja por subcategorías antes de pasar a conceptos, con un grupo para lo asignado al padre', () => {
    const ocio = root.children!.find((c) => c.label === 'Ocio')!
    expect(ocio.children!.map((c) => c.label)).toEqual(['Restaurantes', 'Suscripciones', 'Ocio (directo)'])
    const rest = ocio.children![0]
    expect(rest.children!.map((c) => [c.type, c.label, c.count])).toEqual([['concept', 'Sushi', 2]])
    expect(rest.children![0].children!.every((c) => c.type === 'movement')).toBe(true)
  })

  it('agrupa conceptos por clave normalizada y termina en movimientos', () => {
    const gas = root.children![0]
    expect(gas.children!.map((c) => [c.label, c.count])).toEqual([
      ['Repsol', 2],
      ['Cepsa', 1],
    ])
    expect(movementsOf(gas)).toHaveLength(3)
  })

  it('admite mes como primera dimensión y hereda el color dominante', () => {
    const byMonth = buildHierarchy(movements, categories, ['month', 'category'], 'Gastos')
    expect(byMonth.children!.map((c) => c.label)).toEqual(['ene 2025', 'feb 2025'])
    expect(byMonth.children![0].color).toBe('#ff0000')
  })

  it('resuelve rutas y se queda en el último tramo válido', () => {
    const gas = root.children![0]
    const repsol = gas.children![0]
    expect(resolvePath(root, [gas.id, repsol.id]).map((n) => n.label)).toEqual(['Gastos', 'Gasolina', 'Repsol'])
    expect(resolvePath(root, [gas.id, 'root/c:nada']).map((n) => n.label)).toEqual(['Gastos', 'Gasolina'])
    expect(findById(root, repsol.id)).toBe(repsol)
  })
})

describe('layout de la ciudad', () => {
  const root = buildHierarchy(movements, categories, ['category', 'concept'], 'Gastos')

  it('crea un distrito por hijo con edificios dentro, sin salirse del solar', () => {
    const l = layoutCity(root, { depth: 2, heightBy: 'count', colorBy: 'category', size: 100 })
    expect(l.districts.map((d) => d.node.label)).toEqual(['Gasolina', 'Ocio'])
    expect(l.buildings).toHaveLength(2 + 3)
    for (const b of l.buildings) {
      expect(Math.abs(b.x) + b.w / 2).toBeLessThanOrEqual(50.001)
      expect(Math.abs(b.z) + b.d / 2).toBeLessThanOrEqual(50.001)
      expect(b.h).toBeGreaterThanOrEqual(H_MIN)
      expect(b.h).toBeLessThanOrEqual(H_MAX)
      const d = l.districts[b.district]
      expect(Math.abs(b.x - d.x) + b.w / 2).toBeLessThanOrEqual(d.w / 2 + 1e-6)
    }
  })

  it('la superficie es proporcional al importe', () => {
    const l = layoutCity(root, { depth: 1, heightBy: 'flat', colorBy: 'category', size: 100 })
    const [gas, ocio] = l.buildings
    const ratio = (gas.w * gas.d) / (ocio.w * ocio.d)
    expect(ratio).toBeGreaterThan(155 / 68 - 0.5)
    expect(ratio).toBeLessThan(155 / 68 + 0.5)
  })

  it('no hay edificios solapados', () => {
    const l = layoutCity(root, { depth: 2, heightBy: 'value', colorBy: 'heat', size: 100 })
    const bs = l.buildings
    for (let i = 0; i < bs.length; i++)
      for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i]
        const b = bs[j]
        const overlapX = Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 1e-6
        const overlapZ = Math.abs(a.z - b.z) < (a.d + b.d) / 2 - 1e-6
        expect(overlapX && overlapZ).toBe(false)
      }
  })

  it('el más alto por importe es el de mayor importe', () => {
    const l = layoutCity(root, { depth: 1, heightBy: 'value', colorBy: 'category', size: 100 })
    const tallest = [...l.buildings].sort((a, b) => b.h - a.h)[0]
    expect(tallest.node.label).toBe('Gasolina')
    expect(tallest.h).toBeCloseTo(H_MAX)
  })
})
