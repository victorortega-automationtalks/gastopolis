import { describe, expect, it } from 'vitest'
import { isSealed, sealText, unsealText, WrongPasswordError } from './crypto'

// Pocas iteraciones en los tests: lo que se prueba es el formato, no la lentitud.
const IT = 1000

describe('copias cifradas', () => {
  it('ida y vuelta con la contraseña correcta, también con tildes y emojis', async () => {
    const plain = JSON.stringify({ concepto: 'Panadería ñ 🥐', importe: -3.7 })
    const sealed = await sealText(plain, 'contraseña larga', IT)
    expect(isSealed(sealed)).toBe(true)
    expect(sealed.data).not.toContain('Panader')
    expect(await unsealText(sealed, 'contraseña larga')).toBe(plain)
  })

  it('cada copia lleva su sal y su IV: el mismo texto no se cifra igual dos veces', async () => {
    const a = await sealText('hola', 'x', IT)
    const b = await sealText('hola', 'x', IT)
    expect(a.salt).not.toBe(b.salt)
    expect(a.data).not.toBe(b.data)
  })

  it('contraseña errónea o archivo manipulado → WrongPasswordError', async () => {
    const sealed = await sealText('secreto', 'buena', IT)
    await expect(unsealText(sealed, 'mala')).rejects.toBeInstanceOf(WrongPasswordError)
    const tampered = { ...sealed, data: sealed.data.slice(0, -4) + (sealed.data.endsWith('AAAA') ? 'BBBB' : 'AAAA') }
    await expect(unsealText(tampered, 'buena')).rejects.toBeInstanceOf(WrongPasswordError)
  })

  it('reconoce una copia cifrada y no confunde una normal', async () => {
    expect(isSealed({ app: 'gastopolis', version: 1, movements: [] })).toBe(false)
    expect(isSealed(null)).toBe(false)
    await expect(sealText('x', '')).rejects.toThrow()
  })
})
