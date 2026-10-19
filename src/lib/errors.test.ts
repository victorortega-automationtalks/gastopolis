import { describe, expect, it } from 'vitest'
import { errorMessage } from './errors'

describe('mensajes de error', () => {
  it('saca el texto venga como venga (Tauri rechaza con una cadena)', () => {
    expect(errorMessage(new Error('a'))).toBe('a')
    expect(errorMessage('El archivo .pem no es válido')).toBe('El archivo .pem no es válido')
    expect(errorMessage({ message: 'b' })).toBe('b')
    expect(errorMessage(undefined)).toMatch(/desconocido/)
  })
})
