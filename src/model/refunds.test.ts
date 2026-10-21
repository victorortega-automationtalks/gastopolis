import { describe, expect, it } from 'vitest'
import { refundPairs } from './refunds'

let n = 0
const mv = (concept: string, amount: number, date: string, kind = amount < 0 ? 'expense' : 'income') => ({
  id: `m${n++}`,
  concept,
  amount,
  date,
  kind: kind as 'expense' | 'income' | 'transfer',
})

describe('compras devueltas', () => {
  it('empareja el ingreso con la compra del mismo importe y comercio, la más cercana anterior', () => {
    const vieja = mv('Www.Amazon* AB12 Luxembourg', -35.9, '2026-05-01')
    const compra = mv('Www.Amazon* CD34 Luxembourg', -35.9, '2026-06-03')
    const devolucion = mv('Devolución Amazon', 35.9, '2026-06-15')
    const otro = mv('Zara', -35.9, '2026-06-10')
    expect(refundPairs([vieja, compra, otro, devolucion])).toEqual([[compra.id, devolucion.id]])
  })

  it('no empareja si cambia el importe, el comercio, si la devolución es anterior o pasa de 90 días', () => {
    expect(refundPairs([mv('Decathlon', -40, '2026-06-01'), mv('Decathlon', 39.99, '2026-06-05')])).toEqual([])
    expect(refundPairs([mv('Decathlon', -40, '2026-06-01'), mv('Nomina Acme', 40, '2026-06-05')])).toEqual([])
    expect(refundPairs([mv('Decathlon', 40, '2026-05-25'), mv('Decathlon', -40, '2026-06-01')])).toEqual([])
    expect(refundPairs([mv('Decathlon', -40, '2026-01-01'), mv('Decathlon', 40, '2026-06-05')])).toEqual([])
  })

  it('con el formato de los extractos: «COMPRA TARJ.» y «DEVOLUCION TARJ.» del mismo comercio', () => {
    const compra = mv('COMPRA TARJ. 5402XXXXXXXX1234 AMAZON EU SARL', -35.9, '2026-10-10')
    const devolucion = mv('DEVOLUCION TARJ. 5402XXXXXXXX1234 AMAZON EU SARL', 35.9, '2026-10-14')
    expect(refundPairs([compra, devolucion])).toEqual([[compra.id, devolucion.id]])
  })

  it('cada compra con una sola devolución, y Bizum queda fuera', () => {
    const a = mv('Primark', -20, '2026-06-01')
    const b = mv('Primark', -20, '2026-06-02')
    const r1 = mv('Primark', 20, '2026-06-10')
    const r2 = mv('Primark', 20, '2026-06-11')
    expect(refundPairs([a, b, r1, r2])).toHaveLength(2)
    expect(refundPairs([mv('PAGO BIZUM - cena', -30, '2026-06-01'), mv('INGRESO BIZUM - cena', 30, '2026-06-02')])).toEqual([])
  })
})
