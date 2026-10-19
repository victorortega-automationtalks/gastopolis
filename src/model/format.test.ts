import { describe, expect, it } from 'vitest'
import { savingsPhrase } from './format'

describe('formato', () => {
  it('la frase del ahorro no dice «ahorras el -108 %»', () => {
    expect(savingsPhrase(0.25)).toMatch(/^Ahorras el 25\s%/)
    expect(savingsPhrase(-1.08)).toMatch(/^Gastas un 108\s% más de lo que entra$/)
    expect(savingsPhrase(0)).toMatch(/^Ahorras el 0\s%/)
  })
})
