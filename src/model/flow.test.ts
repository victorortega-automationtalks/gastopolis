import { describe, expect, it } from 'vitest'
import { sankeyLayout } from '../lib/sankey'
import { moneyFlow } from './flow'
import type { Category, Kind, Movement } from './types'

const cat = (id: string, kind: Kind, name = id): Category => ({ id, name, kind, parentId: null, color: '#123456', icon: 'Tag', order: 0 })
let seq = 0
const mov = (categoryId: string, kind: Kind, amount: number): Movement => ({
  id: `m${seq++}`,
  date: '2026-03-10',
  amount,
  kind,
  concept: categoryId,
  conceptKey: categoryId,
  categoryId,
  tags: [],
  source: 'manual',
  createdAt: 0,
})
const cats = [
  cat('nomina', 'income', 'Nómina'),
  cat('extra', 'income', 'Paga'),
  cat('super', 'expense'),
  cat('casa', 'expense'),
  cat('ahorro', 'transfer', 'Ahorro'),
]
const opts = { expenseColor: '#e00', leftoverColor: '#0e0', deficitColor: '#f80' }

describe('río del dinero', () => {
  it('reparte cada fuente entre los destinos en proporción y cuadra lo que entra con lo que sale', () => {
    const ms = [
      mov('nomina', 'income', 2000),
      mov('extra', 'income', 500),
      mov('super', 'expense', -1000),
      mov('casa', 'expense', -500),
      mov('ahorro', 'transfer', -600),
    ]
    const f = moneyFlow(ms, cats, opts)
    const byId = new Map(f.nodes.map((n) => [n.id, n]))
    expect(byId.get('1:gastos')!.value).toBe(1500)
    expect(byId.get('1:ahorro')!.value).toBe(600)
    expect(byId.get('1:sobra')!.value).toBe(400)
    expect(f.total).toBe(2500)
    // La nómina (80 % de lo que entra) pone el 80 % de los gastos.
    expect(f.links.find((l) => l.source === '0:nomina' && l.target === '1:gastos')!.value).toBeCloseTo(1200)
    const out = f.links.filter((l) => l.source.startsWith('0:')).reduce((a, l) => a + l.value, 0)
    expect(out).toBeCloseTo(2500)
  })

  it('si se gasta más de lo que entra, el hueco es una fuente; lo sacado del ahorro, también', () => {
    const ms = [mov('nomina', 'income', 1000), mov('super', 'expense', -1500), mov('ahorro', 'transfer', 300)]
    const f = moneyFlow(ms, cats, opts)
    const ids = f.nodes.map((n) => n.id)
    expect(ids).toContain('0:ahorro')
    expect(f.nodes.find((n) => n.id === '0:deficit')!.value).toBe(200)
    expect(ids).not.toContain('1:sobra')
  })

  it('desglose de gastos en una tercera columna', () => {
    const ms = [mov('nomina', 'income', 2000), mov('super', 'expense', -1000), mov('casa', 'expense', -500)]
    const f = moneyFlow(ms, cats, { ...opts, splitExpenses: true })
    expect(f.nodes.filter((n) => n.column === 2).map((n) => n.value)).toEqual([1000, 500])
  })
})

describe('geometría del Sankey', () => {
  it('apila los nodos, misma escala en todas las columnas, y las cintas encajan', () => {
    const nodes = [
      { id: 'a', column: 0, value: 30 },
      { id: 'b', column: 0, value: 10 },
      { id: 'x', column: 1, value: 40 },
    ]
    const links = [
      { source: 'a', target: 'x', value: 30 },
      { source: 'b', target: 'x', value: 10 },
    ]
    const l = sankeyLayout(nodes, links, { width: 400, height: 210, gap: 10, nodeWidth: 10 })
    const a = l.nodes.find((n) => n.data.id === 'a')!
    const b = l.nodes.find((n) => n.data.id === 'b')!
    const x = l.nodes.find((n) => n.data.id === 'x')!
    expect(a.h / b.h).toBeCloseTo(3)
    expect(x.h).toBeCloseTo(a.h + b.h)
    // La cinta de b llega justo debajo de la de a.
    const la = l.links.find((k) => k.data.source === 'a')!
    const lb = l.links.find((k) => k.data.source === 'b')!
    expect(lb.ty).toBeCloseTo(la.ty + la.width)
    expect(la.path.startsWith('M')).toBe(true)
  })
})
