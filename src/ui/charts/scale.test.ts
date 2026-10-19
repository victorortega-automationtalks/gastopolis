import { describe, expect, it } from 'vitest'
import { bands, columnPath, labelEvery, linear, niceTicks } from './scale'

describe('escalas de los gráficos', () => {
  it('marcas redondas que cubren el rango e incluyen el cero', () => {
    expect(niceTicks(0, 2369.7)).toEqual({ ticks: [0, 1000, 2000, 3000], lo: 0, hi: 3000 })
    expect(niceTicks(-1167, 2100).ticks).toContain(0)
    expect(niceTicks(-1167, 2100).lo).toBeLessThanOrEqual(-1167)
    expect(niceTicks(0, 0)).toEqual({ ticks: [0, 1], lo: 0, hi: 1 })
    expect(niceTicks(0, 37.5, 4).ticks).toEqual([0, 10, 20, 30, 40])
  })

  it('escala lineal', () => {
    const y = linear(0, 100, 200, 0)
    expect(y(0)).toBe(200)
    expect(y(50)).toBe(100)
  })

  it('bandas: barras de 24 px como mucho, separadas 2 px y centradas en su hueco', () => {
    const b = bands(12, 600, 2)
    expect(b.bar).toBeLessThanOrEqual(24)
    expect(b.x(0, 1) - b.x(0, 0)).toBeCloseTo(b.bar + 2)
    const centre = b.x(3) + (b.bar * 2 + 2) / 2
    expect(centre).toBeCloseTo(3 * b.slot + b.slot / 2)
    // Muchas categorías en poco sitio: barras estrechas, nunca negativas.
    expect(bands(400, 300, 2).bar).toBeGreaterThan(0)
  })

  it('etiquetas del eje x que caben, siempre con la última', () => {
    expect(labelEvery(12, 600)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    const pocas = labelEvery(61, 300)
    expect(pocas[0]).toBe(0)
    expect(pocas[pocas.length - 1]).toBe(60)
    expect(pocas.length).toBeLessThan(10)
  })

  it('columnas con el extremo redondeado y nada si no tienen altura', () => {
    expect(columnPath(0, 10, 100, 40)).toMatch(/^M0,100V44Q/)
    expect(columnPath(0, 10, 100, 100)).toBe('')
    expect(columnPath(0, 10, 100, 130)).toMatch(/V126Q/)
  })
})
