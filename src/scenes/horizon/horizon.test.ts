import { describe, expect, it } from 'vitest'
import { layoutHorizon } from './layout'

describe('Horizonte', () => {
  const lineal = (step: number) => Array.from({ length: 61 }, (_, m) => m * step)
  const layout = layoutHorizon(
    [
      { id: 'esc', label: 'Con cambios', color: '#0ff', values: lineal(1000) },
      { id: 'base', label: 'Sin cambios', color: '#888', values: lineal(500) },
    ],
    [
      { id: 'casa', name: 'Casa', color: '#f0f', icon: 'House', target: 20000, month: 20, sooner: 20 },
      { id: 'yate', name: 'Yate', color: '#ff0', icon: 'Ship', target: 1e9, month: null, sooner: null },
    ],
  )

  it('cintas en carriles, hacia el horizonte, a la altura de lo que tendrías', () => {
    expect(layout.series[0].x).toBeLessThan(layout.series[1].x)
    expect(layout.series[0].points[60][2]).toBeCloseTo(-layout.length)
    // Lo más alto llega justo a la altura máxima.
    expect(layout.series[0].points[60][1]).toBeCloseTo(layout.maxH)
    expect(layout.years.map((y) => y.month)).toEqual([12, 24, 36, 48, 60])
  })

  it('el pórtico está en el mes del objetivo y por encima de la cinta: la cinta lo atraviesa; si no llega, al fondo', () => {
    const casa = layout.gates.find((g) => g.id === 'casa')!
    expect(casa.inside).toBe(true)
    expect(casa.z).toBeCloseTo(layout.series[0].points[20][2])
    expect(casa.y).toBeGreaterThan(layout.series[0].points[20][1])
    const yate = layout.gates.find((g) => g.id === 'yate')!
    expect(yate.inside).toBe(false)
    expect(yate.z).toBeCloseTo(-layout.length)
    // Las metas no cambian la escala: manda la cinta más alta.
    expect(layout.scaleY).toBeCloseTo(layout.maxH / 60000)
  })
})
