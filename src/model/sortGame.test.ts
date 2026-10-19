import { describe, expect, it } from 'vitest'
import { buildDeck, cardOptions, cardPoints, cardQuip, cheer, groupKey, levelFor, longDate } from './sortGame'

const cats = [
  { id: 'sin', name: 'Sin clasificar', kind: 'expense' as const },
  { id: 'otros', name: 'Otros ingresos', kind: 'income' as const },
  { id: 'gas', name: 'Gasolina', kind: 'expense' as const },
  { id: 'ocio', name: 'Ocio', kind: 'expense' as const },
  { id: 'super', name: 'Supermercado', kind: 'expense' as const },
  { id: 'nomina', name: 'Nómina', kind: 'income' as const },
  { id: 'trasp', name: 'Traspasos', kind: 'transfer' as const },
]
let n = 0
const mv = (concept: string, amount: number, categoryId: string, date = '2026-05-10') => ({ id: `m${n++}`, concept, amount, categoryId, date })

describe('el Clasificador', () => {
  it('agrupa el mismo comercio escrito de varias formas', () => {
    expect(groupKey('Revolut**1271* Dublin 0000')).toBe(groupKey('Revolut**6553* Dublin 0100'))
    expect(groupKey('PAGO BIZUM - cena 12')).toBe('pago bizum cena')
  })

  it('el mazo solo lleva lo que sigue sin clasificar, y primero lo que más arregla', () => {
    const ms = [
      mv('Revolut**1271* Dublin 0000', -100, 'sin', '2026-01-02'),
      mv('Revolut**6553* Dublin 0100', -50, 'sin', '2026-03-02'),
      mv('Revolut**0414* Dublin 0000', -20, 'sin', '2026-02-02'),
      mv('PAGO BIZUM - cena', -30, 'sin'),
      mv('Mercadona', -10, 'super'),
      mv('Abalia Consulting S.L.', 1500, 'otros'),
    ]
    const deck = buildDeck(ms, ['sin', 'otros'])
    expect(deck.map((c) => [c.key, c.kind, c.ids.length])).toEqual([
      ['revolut', 'expense', 3],
      ['abalia', 'income', 1],
      ['pago bizum cena', 'expense', 1],
    ])
    expect(deck[0]).toMatchObject({ total: -170, from: '2026-01-02', to: '2026-03-02', rule: { matchType: 'contains', pattern: 'revolut' } })
    // Sin texto fiable para «contiene» (Bizum), la regla es el concepto exacto.
    expect(deck[2].rule).toEqual({ matchType: 'equals', pattern: 'PAGO BIZUM - cena' })
  })

  it('propone primero lo que tienen los parecidos, luego el catálogo y luego tus más usadas, del mismo sentido', () => {
    const ms = [
      mv('Repsol Getafe', -40, 'sin'),
      mv('Repsol Madrid 22', -30, 'ocio'),
      ...[1, 2, 3, 4].map(() => mv('Mercadona', -10, 'super')),
      mv('Nomina', 2000, 'nomina'),
    ]
    const [card] = buildDeck(ms, ['sin', 'otros'])
    const opts = cardOptions(card, ms, cats, ['sin', 'otros'])
    expect(opts.map((o) => [o.name, o.reason])).toEqual([
      ['Ocio', 'similar'],
      ['Gasolina', 'catalog'],
      ['Supermercado', 'frequent'],
    ])
    // Sin categoría que encaje en tus datos: la del catálogo, para crearla.
    const card2 = buildDeck([mv('Winamax Es 01', -5, 'sin')], ['sin'])[0]
    const [opt] = cardOptions(card2, [], cats, ['sin'])
    expect(opt).toMatchObject({ name: 'Apuestas y juego', reason: 'catalog', auto: { key: 'betting' } })
    expect(opt.categoryId).toBeUndefined()
  })

  it('puntos: más por cada movimiento arreglado y la racha multiplica, con tope', () => {
    expect(cardPoints(1, 0)).toBe(15)
    expect(cardPoints(4, 4)).toBe(60)
    expect(cardPoints(100, 100)).toBe(330)
  })
})

describe('el Clasificador, versión divertida', () => {
  const card = (p: Partial<import('./sortGame').SortCard>) => ({
    key: 'x',
    kind: 'expense' as const,
    ids: ['a'],
    total: -10,
    from: '2026-10-14',
    to: '2026-10-14',
    ...p,
  })

  it('fecha larga con el día de la semana', () => {
    expect(longDate('2026-10-17')).toBe('sábado 17 de octubre de 2026')
    expect(longDate('2026-01-05')).toBe('lunes 5 de enero de 2026')
  })

  it('chascarrillo según lo que es, y si no según cómo es; siempre el mismo para la misma carta', () => {
    expect(cardQuip(card({}), 'betting')).toMatch(/casa|Apuesta|quiniela/)
    expect(cardQuip(card({ ids: Array.from({ length: 25 }, (_, i) => String(i)) }))).toMatch(/^25 veces/)
    expect(cardQuip(card({ total: -900 }))).toMatch(/tres cifras/)
    expect(cardQuip(card({ total: -1.2 }))).toMatch(/Calderilla/)
    expect(cardQuip(card({ from: '2026-10-17', to: '2026-10-17' }))).toMatch(/fin de semana/)
    expect(cardQuip(card({ key: 'mercadona' }), 'supermarket')).toBe(cardQuip(card({ key: 'mercadona' }), 'supermarket'))
  })

  it('niveles por puntos y celebraciones de racha', () => {
    expect(levelFor(0)).toMatchObject({ index: 0, name: 'Novato del recibo', next: 150, progress: 0 })
    expect(levelFor(600)).toMatchObject({ index: 2, name: 'Cazador de tickets' })
    expect(levelFor(99999)).toMatchObject({ name: 'Leyenda de Gastópolis', progress: 1 })
    expect(cheer(5, 'k')).toEqual({ text: '¡Combo ×5!', big: true })
    expect(cheer(20, 'k').big).toBe(true)
    expect(cheer(2, 'k').big).toBe(false)
  })
})
