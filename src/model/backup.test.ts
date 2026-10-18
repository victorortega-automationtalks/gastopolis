import { describe, expect, it } from 'vitest'
import { backupDue } from './backup'

const DAY = 86_400_000
const now = Date.UTC(2026, 9, 18)

describe('recordatorio de copia', () => {
  it('con pocos datos propios no molesta', () => {
    expect(backupDue(undefined, 5, now)).toBeNull()
  })
  it('nunca hecha, con datos: avisa sin días', () => {
    expect(backupDue(undefined, 50, now)).toEqual({ days: null })
  })
  it('reciente no avisa; de hace más de un mes, sí', () => {
    expect(backupDue(now - 10 * DAY, 50, now)).toBeNull()
    expect(backupDue(now - 45 * DAY, 50, now)).toEqual({ days: 45 })
  })
})
