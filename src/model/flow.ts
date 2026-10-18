import { rootIndex } from './series'
import type { Category, Movement } from './types'

export interface FlowNode {
  id: string
  label: string
  color: string
  icon: string
  value: number
  /** 0 = de dónde viene, 1 = a dónde va, 2 = desglose de los gastos. */
  column: 0 | 1 | 2
  /** Para abrir la categoría en la Ciudad (los nodos sintéticos no tienen). */
  categoryId?: string
  kind?: 'income' | 'expense' | 'transfer'
}

export interface FlowLink {
  source: string
  target: string
  value: number
}

export interface MoneyFlow {
  nodes: FlowNode[]
  links: FlowLink[]
  /** Lo que entra (ingresos + lo sacado de ahorros + lo gastado de más). */
  total: number
}

export interface FlowOptions {
  /** Tercera columna con los gastos por categoría. */
  splitExpenses?: boolean
  maxSources?: number
  maxExpenses?: number
  expenseColor: string
  leftoverColor: string
  deficitColor: string
}

const OTHER = '#8b8fa8'

/**
 * El río del dinero: de dónde viene (ingresos por categoría, y lo sacado de ahorros) y a dónde va (gastos, cada
 * categoría de ahorro o inversión, y lo que sobra). El dinero no lleva etiqueta: cada fuente se reparte entre los
 * destinos en proporción a lo que pesa cada destino. Si se gasta más de lo que entra, el hueco aparece como fuente
 * («Gastado de más»).
 */
export function moneyFlow(movements: Movement[], categories: Category[], opts: FlowOptions): MoneyFlow {
  const { splitExpenses = false, maxSources = 5, maxExpenses = 6 } = opts
  const root = rootIndex(categories)
  const byId = new Map(categories.map((c) => [c.id, c]))
  const income = new Map<string, number>()
  const expense = new Map<string, number>()
  const transfer = new Map<string, number>()
  for (const m of movements) {
    const id = root(m.categoryId)
    if (m.kind === 'income') income.set(id, (income.get(id) ?? 0) + Math.abs(m.amount))
    else if (m.kind === 'expense') expense.set(id, (expense.get(id) ?? 0) + Math.abs(m.amount))
    // Transferencia negativa = dinero apartado (destino); positiva = sacado de ahí (fuente).
    else transfer.set(id, (transfer.get(id) ?? 0) - m.amount)
  }

  const node = (id: string, value: number, column: FlowNode['column'], kind: FlowNode['kind']): FlowNode => {
    const c = byId.get(id)
    return {
      id: `${column}:${id}`,
      label: c?.name ?? 'Sin categoría',
      color: c?.color ?? OTHER,
      icon: c?.icon ?? 'CircleDashed',
      value,
      column,
      categoryId: id,
      kind,
    }
  }
  /** Las más grandes y el resto en «Otros». */
  const top = (nodes: FlowNode[], max: number, column: FlowNode['column'], label: string): FlowNode[] => {
    nodes.sort((a, b) => b.value - a.value)
    if (nodes.length <= max) return nodes
    const rest = nodes.slice(max - 1)
    const value = rest.reduce((a, n) => a + n.value, 0)
    return [...nodes.slice(0, max - 1), { id: `${column}:otros`, label: `${label} (${rest.length})`, color: OTHER, icon: 'CircleDashed', value, column }]
  }

  const sources = top(
    [
      ...[...income].filter(([, v]) => v > 0).map(([id, v]) => node(id, v, 0, 'income')),
      ...[...transfer].filter(([, v]) => v < 0).map(([id, v]) => ({ ...node(id, -v, 0, 'transfer'), label: `De ${byId.get(id)?.name ?? 'ahorros'}` })),
    ],
    maxSources,
    0,
    'Otros',
  )
  const expenseTotal = [...expense.values()].reduce((a, b) => a + b, 0)
  const dests: FlowNode[] = [...transfer].filter(([, v]) => v > 0).map(([id, v]) => node(id, v, 1, 'transfer'))
  if (expenseTotal > 0)
    dests.unshift({ id: '1:gastos', label: 'Gastos', color: opts.expenseColor, icon: 'Receipt', value: expenseTotal, column: 1, kind: 'expense' })

  const inTotal = sources.reduce((a, n) => a + n.value, 0)
  const outTotal = dests.reduce((a, n) => a + n.value, 0)
  if (inTotal > outTotal + 0.005)
    dests.push({ id: '1:sobra', label: 'Sin gastar', color: opts.leftoverColor, icon: 'Wallet', value: inTotal - outTotal, column: 1 })
  if (outTotal > inTotal + 0.005)
    sources.push({ id: '0:deficit', label: 'Gastado de más', color: opts.deficitColor, icon: 'TriangleAlert', value: outTotal - inTotal, column: 0 })
  const total = Math.max(inTotal, outTotal)

  const links: FlowLink[] = []
  if (total > 0) for (const s of sources) for (const d of dests) links.push({ source: s.id, target: d.id, value: (s.value * d.value) / total })

  const nodes = [...sources, ...dests]
  if (splitExpenses && expenseTotal > 0) {
    const cats = top(
      [...expense].filter(([, v]) => v > 0).map(([id, v]) => node(id, v, 2, 'expense')),
      maxExpenses,
      2,
      'Otras',
    )
    nodes.push(...cats)
    for (const c of cats) links.push({ source: '1:gastos', target: c.id, value: c.value })
  }
  return { nodes, links, total }
}
