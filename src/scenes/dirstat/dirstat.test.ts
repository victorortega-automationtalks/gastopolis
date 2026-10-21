import { describe, expect, it } from 'vitest'
import type { CityNode } from '../../model/hierarchy'
import { cushionLayout, leafAt, makeBrightColor, normalizeColor, renderCushions, squarify, windirstatColor } from './layout'

const leaf = (id: string, value: number, color = '#3b82f6'): CityNode => ({ id, type: 'movement', label: id, value, count: 1, color })
const node = (id: string, children: CityNode[]): CityNode => ({
  id,
  type: 'category',
  label: id,
  value: children.reduce((a, c) => a + c.value, 0),
  count: children.length,
  color: '#ef4444',
  children,
})

describe('vista WinDirStat', () => {
  it('squarify: cada rectángulo tiene el área de su valor y todos caben', () => {
    const r = { x: 0, y: 0, w: 600, h: 400 }
    const values = [500, 300, 120, 50, 20, 8, 2]
    const parts = squarify(values, r)
    const total = values.reduce((a, v) => a + v, 0)
    parts.forEach((p, i) => {
      expect(p.w * p.h).toBeCloseTo((values[i] / total) * 600 * 400, 3)
      expect(p.x).toBeGreaterThanOrEqual(-1e-9)
      expect(p.y).toBeGreaterThanOrEqual(-1e-9)
      expect(p.x + p.w).toBeLessThanOrEqual(600 + 1e-6)
      expect(p.y + p.h).toBeLessThanOrEqual(400 + 1e-6)
    })
    // Squarified: ninguna tira absurda.
    for (const p of parts.slice(0, 4)) expect(Math.max(p.w / p.h, p.h / p.w)).toBeLessThan(4)
  })

  it('los cojines cubren el lienzo, cada hoja tiene su rectángulo y los nodos intermedios también', () => {
    const root = node('root', [node('a', [leaf('a1', 60), leaf('a2', 30)]), node('b', [leaf('b1', 10)]), leaf('vacio', 0)])
    const { leaves, rects } = cushionLayout(root, 300, 200)
    expect(leaves.map((l) => l.node.id).sort()).toEqual(['a1', 'a2', 'b1'])
    expect(leaves.reduce((s, l) => s + l.rect.w * l.rect.h, 0)).toBeCloseTo(300 * 200, 3)
    expect(rects.get('a')!.w * rects.get('a')!.h).toBeCloseTo(0.9 * 300 * 200, 3)
    expect(leafAt(leaves, 1, 1)?.node.id).toBe('a1')
  })

  it('el relieve no deja NaN y da luz y sombra dentro de cada bloque', () => {
    const root = node('root', [leaf('x', 3), leaf('y', 2), leaf('z', 1), leaf('diminuto', 1e-9)])
    const { leaves } = cushionLayout(root, 120, 80)
    const px = renderCushions(leaves, 240, 160, 2)
    expect(px.length).toBe(240 * 160 * 4)
    for (const v of px) expect(Number.isFinite(v)).toBe(true)
    // Dentro de un mismo bloque hay brillo variable (es un cojín, no un color plano).
    const row = 40
    const lum = (x: number) => px[(row * 240 + x) * 4 + 2]
    const xs = Array.from({ length: 20 }, (_, i) => 10 + i * 4).map(lum)
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(20)
  })

  it('colores como WinDirStat: brillo igualado y el exceso de un canal repartido entre los otros', () => {
    expect(normalizeColor(300, 100, 0)).toEqual([255, 122.5, 22.5])
    expect(normalizeColor(10, 20, 30)).toEqual([10, 20, 30])
    // El azul puro de la paleta se aclara hasta el brillo común (0,6), como en WinDirStat.
    const [r, g, b] = makeBrightColor([0, 0, 255])
    expect(b).toBe(255)
    expect(Math.round((r + g + b) / 3)).toBeGreaterThanOrEqual(150)
    expect(windirstatColor(0)).toMatch(/^#[0-9a-f]{6}$/)
    // De la 13.ª categoría en adelante, el mismo color.
    expect(windirstatColor(12)).toBe(windirstatColor(40))
  })
})
