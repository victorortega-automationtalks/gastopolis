import { describe, expect, it } from 'vitest'
import { autoContext, classify, findCategory, planAutoAssign } from './autocat'

const mv = (concept: string, amount: number, date = '2026-05-10') => ({ concept, amount, date })
const name = (concept: string, amount: number, ctx = autoContext([])) => classify({ concept, amount }, ctx)?.name

describe('clasificación automática', () => {
  it('reconoce comercios habituales de los extractos españoles, con su sentido', () => {
    expect(name('COMPRA EN MERCADONA S.A.', -54.2)).toBe('Supermercado')
    expect(name('E.S. Repsol Getafe 000000', -60)).toBe('Gasolina')
    expect(name('Uber * Eats Pending Amsterdam', -22)).toBe('Comida a domicilio')
    expect(name('Uber *Trip Madrid', -12)).toBe('Transporte')
    expect(name('Hotel at Booking.com Amsterdam 0100', -170)).toBe('Viajes')
    expect(name('Media Markt On\\aeroport Del\\es2601', -129)).toBe('Tecnología')
    expect(name('Apple.Com/Bill Cork 3677', -9.99)).toBe('Suscripciones')
    expect(name('Compra En Farmacia Lopez', -12)).toBe('Salud')
    expect(name('Winamax Es Internet 0100', -20)).toBe('Apuestas y juego')
    expect(name('Myinvestor Fondo, Trf.Periodica: 5', -300)).toBe('Ahorro e inversión')
    expect(name('Revolut**1234* Dublin', -200)).toBe('Traspasos entre mis cuentas')
    expect(name('Traspaso Desde Hucha Principal', 100)).toBe('Traspasos entre mis cuentas')
    // «bp» entero, no dentro de otra palabra.
    expect(name('BPM Musica Online', -10)).not.toBe('Gasolina')
    expect(name('Concepto raro', -10)).toBeUndefined()
  })

  it('lo que te devuelve un comercio es una devolución, nunca un gasto en positivo', () => {
    expect(name('Www.Amazon* AB12 Luxembourg', 35)).toBe('Devoluciones de compras')
    expect(name('Www.Amazon* AB12 Luxembourg', -35)).toBe('Compras online')
    expect(name('Winamax Es Internet 0100', 50)).toBe('Premios de apuestas')
  })

  it('Bizum: el concepto manda y, si no dice nada, va a Bizum', () => {
    expect(name('PAGO BIZUM - cena viernes', -25)).toBe('Restaurantes y bares')
    expect(name('PAGO BIZUM - taller coche', -120)).toBe('Coche y moto')
    expect(name('PAGO BIZUM - jeje', -10)).toBe('Bizum enviados')
    expect(name('INGRESO BIZUM - cena', 25)).toBe('Bizum recibidos')
  })

  it('ingresos: Hacienda, intereses, ventas y quién te paga', () => {
    expect(name('Declaracion I.R.P.F 25mod:100', 500)).toBe('Devolución de Hacienda')
    expect(name('Intereses Cta.', 3.2)).toBe('Intereses y rendimientos')
    expect(name('Mangopay', 40)).toBe('Ventas de segunda mano')
    const ctx = autoContext([
      mv('Acme Consulting S.L.', 1800, '2026-01-28'),
      mv('Acme Consulting S.L.', 1800, '2026-02-27'),
      mv('Acme Consulting, S.L.U.', 1850, '2026-03-30'),
      mv('Federacion Regional De Tenis', 120, '2026-03-02'),
      mv('Federacion Regional De Tenis', 90, '2026-04-02'),
      mv('Federacion Regional De Tenis', 150, '2026-05-02'),
    ])
    expect(name('Acme Consulting S.L.', 1800, ctx)).toBe('Nómina')
    // Paga a menudo, pero poco: no es la nómina; y aunque «tenis» suene a tienda, es un organismo que te paga.
    expect(name('Federacion Regional De Tenis', 120, ctx)).toBe('Trabajos y colaboraciones')
    expect(name('Pago Nomina Octubre', 1500)).toBe('Nómina')
  })

  it('tu nombre se deduce de lo que te mandas entre cuentas, y solo cuenta como traspaso si el concepto es tu nombre', () => {
    const ctx = autoContext([
      mv('Ana Garcia', 300),
      mv('Ana Garcia', 200),
      mv('Ana Garcia Lopez', -500),
      mv('Luis Perez Gil', 50),
      mv('INGRESO BIZUM - Ana Garcia', 10),
    ])
    expect(ctx.selfTokens.sort()).toEqual(['ana', 'garcia'])
    expect(name('T012-Ana Garcia Lopez', -200, ctx)).toBe('Traspasos entre mis cuentas')
    expect(name('Garcia Lopez Ana', 80, ctx)).toBe('Traspasos entre mis cuentas')
    // Otra persona con tu apellido, o una compra con tu nombre, no.
    expect(name('Maria Garcia Lopez', -50, ctx)).toBeUndefined()
    expect(name('Uniforme Arbitro Ana Garcia', -60, ctx)).toBe('Deporte')
  })

  it('reutiliza tus categorías por nombre o sinónimo y del mismo tipo', () => {
    const cats = [
      { id: 'c1', name: 'Comida', kind: 'expense' as const },
      { id: 'c2', name: 'Gasolina', kind: 'income' as const },
    ]
    expect(findCategory(classify({ concept: 'Mercadona', amount: -5 })!, cats)).toBe('c1')
    expect(findCategory(classify({ concept: 'Repsol', amount: -5 })!, cats)).toBeUndefined()
  })

  it('el plan solo toca lo del banco que sigue sin clasificar, agrupado', () => {
    const base = { date: '2026-05-01', source: 'bank' as const }
    const ms = [
      { ...base, id: '1', concept: 'Mercadona', amount: -10, categoryId: 'sin' },
      { ...base, id: '2', concept: 'Mercadona', amount: -20, categoryId: 'sin' },
      { ...base, id: '3', concept: 'Lidl', amount: -5, categoryId: 'sin' },
      { ...base, id: '4', concept: 'Mercadona', amount: -7, categoryId: 'ocio' },
      { ...base, id: '5', concept: 'Dinero', amount: -50, categoryId: 'sin' },
      { ...base, id: '6', concept: 'Mercadona', amount: -9, categoryId: 'sin', source: 'manual' as const },
      { ...base, id: '7', concept: 'Intereses Cta.', amount: 2, categoryId: 'otros' },
    ]
    const plan = planAutoAssign(ms, [{ id: 'super', name: 'Supermercado', kind: 'expense' }], ['sin', 'otros'])
    expect(plan.pending).toBe(5)
    expect(plan.unresolved).toBe(1)
    const sup = plan.groups.find((g) => g.auto.key === 'supermarket')!
    expect(sup).toMatchObject({ existingId: 'super', ids: ['1', '2', '3'], total: -35, samples: ['Mercadona', 'Lidl'] })
    expect(plan.groups.find((g) => g.auto.key === 'interest')).toMatchObject({ existingId: undefined, ids: ['7'] })
  })
})
