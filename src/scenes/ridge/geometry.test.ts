import { describe, expect, it } from 'vitest'
import { applyReveal, buildRidge, MIN_H, revealAt } from './geometry'

const c = { r: 0.5, g: 0.2, b: 0.8 }
const d = { r: 0.1, g: 0.05, b: 0.2 }

describe('geometría de la cresta', () => {
  it('sin NaN ni normales nulas, aunque haya tramos planos, a cero o con datos raros', () => {
    for (const profile of [[0, 0, 0, 0], [0, 10, 10, 0, 5], [5], [0, NaN, 3, Infinity, 0]]) {
      const b = buildRidge(profile, 40, 3, c, d)
      expect([...b.positions].every(Number.isFinite)).toBe(true)
      for (let v = 0; v < b.normals.length; v += 3) expect(Math.hypot(b.normals[v], b.normals[v + 1], b.normals[v + 2])).toBeCloseTo(1)
      expect(Math.max(...b.index)).toBeLessThan(b.positions.length / 3)
    }
  })

  it('las caras miran hacia fuera: la lámina hacia arriba, la delantera hacia la cámara', () => {
    const b = buildRidge([2, 2, 2], 10, 2, c, d)
    const p = (i: number) => [b.positions[i * 3], b.positions[i * 3 + 1], b.positions[i * 3 + 2]]
    const faceNormal = (t: number) => {
      const [a, bb, cc] = [p(b.index[t]), p(b.index[t + 1]), p(b.index[t + 2])]
      const u = [bb[0] - a[0], bb[1] - a[1], bb[2] - a[2]]
      const w = [cc[0] - a[0], cc[1] - a[1], cc[2] - a[2]]
      return [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]
    }
    // Primer triángulo: lámina superior (+y). El que sigue a la lámina: cara delantera (+z).
    expect(faceNormal(0)[1]).toBeGreaterThan(0)
    const frontFirst = 6 * (3 - 1)
    expect(faceNormal(frontFirst)[2]).toBeGreaterThan(0)
  })

  it('la ola de la reproducción: crecido detrás del frente, plano delante', () => {
    expect(revealAt(-10, 0, 4)).toBe(1)
    expect(revealAt(1, 0, 4)).toBe(0)
    expect(revealAt(-2, 0, 4)).toBeCloseTo(0.5)
    const b = buildRidge([10, 10, 10, 10, 10], 40, 3, c, d)
    const pos = b.positions.slice()
    const nor = b.normals.slice()
    const crest = b.crest.positions.slice()
    const col = b.colors.slice()
    applyReveal(b, 0, 4, pos, nor, crest, col)
    // x = −20 (pasado) a su altura; x = +20 (futuro) en el mínimo.
    expect(pos[1]).toBeCloseTo(10)
    expect(pos[2 * 4 * 3 + 1]).toBeCloseTo(MIN_H)
    expect([...pos, ...nor, ...crest, ...col].every(Number.isFinite)).toBe(true)
    // El futuro, en penumbra; el pasado, con su color.
    expect(col[0]).toBeCloseTo(b.colors[0])
    expect(col[2 * 4 * 3]).toBeLessThan(b.colors[2 * 4 * 3] * 0.2)
  })
})
