import { describe, expect, it } from 'vitest'
import { applyFilters } from './aggregate'
import { DEFAULT_FILTERS } from './period'
import type { Movement } from './types'

const now = '2026-10-19'
const at = (d: string) => Date.parse(d)
const mv = (id: string, source: Movement['source'], createdAt: number): Movement => ({
  id,
  date: '2026-10-10',
  amount: -10,
  kind: 'expense',
  concept: id,
  conceptKey: id,
  categoryId: 'c',
  tags: [],
  source,
  createdAt,
})

describe('filtro por origen', () => {
  const ms = [
    mv('banco-viejo', 'bank', at('2026-09-01')),
    mv('banco-nuevo', 'bank', at('2026-10-17')),
    mv('a-mano', 'manual', at('2026-10-18')),
    mv('excel', 'import', at('2026-08-01')),
    mv('ejemplo', 'sample', at('2026-08-01')),
  ]
  const ids = (origin: NonNullable<typeof DEFAULT_FILTERS.origin>) => applyFilters(ms, { ...DEFAULT_FILTERS, origin }, [], now).map((m) => m.id)

  it('separa banco, a mano e importado; «nuevo» es lo que el banco trajo en los últimos 7 días', () => {
    expect(ids('all')).toHaveLength(5)
    expect(ids('bank')).toEqual(['banco-viejo', 'banco-nuevo'])
    expect(ids('manual')).toEqual(['a-mano'])
    expect(ids('import')).toEqual(['excel', 'ejemplo'])
    expect(ids('new')).toEqual(['banco-nuevo'])
  })
})
