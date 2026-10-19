import { describe, expect, it } from 'vitest'
import { rulePattern, suggestRules } from './ruleSuggest'

describe('sugerencias de reglas', () => {
  it('saca el texto que identifica al comercio, sin números ni relleno, y siempre literal', () => {
    expect(rulePattern('Revolut**1271* Dublin 000000000')).toBe('revolut')
    expect(rulePattern('Compra En Amazon')).toBe('amazon')
    expect(rulePattern('Www.Amazon* Nq2ag0d14 Luxembourg 0100795')).toBe('amazon')
    expect(rulePattern('Winamax Es Internet 010079670')).toBe('winamax')
    // Primera palabra genérica: se añade la siguiente, tal cual aparece en el concepto.
    expect(rulePattern('Consulta Psicologia \\grinon\\es2607')).toBe('consulta psicologia')
    expect(rulePattern('Hotel at Booking.com Amsterdam')).toBe('hotel at booking')
    expect(rulePattern('PAGO BIZUM - cena')).toBeUndefined()
    expect(rulePattern('12345')).toBeUndefined()
  })

  it('agrupa lo que más se repite, por sentido, sin lo que ya cubre una regla, y propone categoría', () => {
    const cats = [
      { id: 'sin', name: 'Sin clasificar', kind: 'expense' as const },
      { id: 'otros', name: 'Otros ingresos', kind: 'income' as const },
      { id: 'gas', name: 'Gasolina', kind: 'expense' as const },
      { id: 'ocio', name: 'Ocio', kind: 'expense' as const },
    ]
    const ms = [
      ...[1, 2, 3, 4].map((i) => ({ concept: `Repsol Getafe 00${i}`, amount: -40, categoryId: 'sin' })),
      ...[1, 2, 3].map((i) => ({ concept: `Winamax Es Internet 0${i}`, amount: -10, categoryId: i === 1 ? 'ocio' : 'sin' })),
      ...[1, 2, 3].map(() => ({ concept: 'Mercadona', amount: -20, categoryId: 'sin' })),
      ...[1, 2].map(() => ({ concept: 'Raro SL', amount: -5, categoryId: 'sin' })),
      ...[1, 2, 3].map(() => ({ concept: 'Winamax Es Internet', amount: 30, categoryId: 'otros' })),
    ]
    const out = suggestRules(ms, [{ matchType: 'contains', pattern: 'mercadona', enabled: true }], cats, ['sin', 'otros'])
    expect(out.map((s) => [s.pattern, s.kind, s.count])).toEqual([
      ['repsol', 'expense', 4],
      // Empate a veces: primero el que más dinero mueve.
      ['winamax', 'income', 3],
      ['winamax', 'expense', 3],
    ])
    expect(out[0]).toMatchObject({ categoryId: 'gas', total: -160 })
    // Ya tenías uno en Ocio: se propone esa antes que la del catálogo.
    expect(out[2].categoryId).toBe('ocio')
    // Sin categoría que encaje: la del catálogo, para crearla al aceptar.
    expect(out[1]).toMatchObject({ categoryId: undefined, newCategory: { name: 'Premios de apuestas', kind: 'income' } })
  })
})
