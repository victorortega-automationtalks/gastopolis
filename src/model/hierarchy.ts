import { preferredSpelling } from '../lib/text'
import { fmtMonth } from './format'
import { monthKey } from './period'
import type { Category, Movement } from './types'

/** Dimensiones por las que se puede bajar en la Ciudad. Siempre se termina en movimientos sueltos. */
export type Dim = 'category' | 'month' | 'concept'

export type NodeType = 'root' | 'category' | 'month' | 'concept' | 'movement'

export interface CityNode {
  /** Ruta desde la raíz: estable mientras no cambien los datos, sirve de clave de navegación. */
  id: string
  type: NodeType
  label: string
  /** Suma de importes en valor absoluto. */
  value: number
  count: number
  color: string
  categoryId?: string
  month?: string
  movement?: Movement
  children?: CityNode[]
}

export const DRILL_PRESETS: { id: string; label: string; dims: Dim[] }[] = [
  { id: 'cat-concept', label: 'Categoría → Concepto', dims: ['category', 'concept'] },
  { id: 'cat-month-concept', label: 'Categoría → Mes → Concepto', dims: ['category', 'month', 'concept'] },
  { id: 'month-cat-concept', label: 'Mes → Categoría → Concepto', dims: ['month', 'category', 'concept'] },
  { id: 'cat-month', label: 'Categoría → Mes', dims: ['category', 'month'] },
  { id: 'concept', label: 'Concepto', dims: ['concept'] },
]

const NEUTRAL = '#8b8fa8'

export function buildHierarchy(movements: Movement[], categories: Category[], dims: Dim[], rootLabel: string): CityNode {
  const byId = new Map(categories.map((c) => [c.id, c]))
  // Cadena de antepasados de cada categoría, de la raíz a ella misma.
  const chains = new Map<string, string[]>()
  const chainOf = (id: string): string[] => {
    const cached = chains.get(id)
    if (cached) return cached
    const out: string[] = []
    const seen = new Set<string>()
    for (let c = byId.get(id); c && !seen.has(c.id); c = c.parentId ? byId.get(c.parentId) : undefined) {
      seen.add(c.id)
      out.unshift(c.id)
    }
    if (!out.length) out.push(id)
    chains.set(id, out)
    return out
  }

  const dominantColor = (ms: Movement[]): string => {
    const sums = new Map<string, number>()
    for (const m of ms) sums.set(m.categoryId, (sums.get(m.categoryId) ?? 0) + Math.abs(m.amount))
    let best: string | null = null
    let max = -1
    for (const [id, v] of sums) if (v > max) [best, max] = [id, v]
    return (best && byId.get(best)?.color) || NEUTRAL
  }

  const stats = (ms: Movement[]) => ({ value: ms.reduce((a, m) => a + Math.abs(m.amount), 0), count: ms.length })

  const build = (ms: Movement[], rest: Dim[], path: string, inherited: string | null, catParent: string | null): CityNode[] => {
    if (!rest.length) {
      return ms.map((m) => ({
        id: `${path}/m:${m.id}`,
        type: 'movement',
        label: m.concept,
        value: Math.abs(m.amount),
        count: 1,
        color: inherited ?? byId.get(m.categoryId)?.color ?? NEUTRAL,
        categoryId: m.categoryId,
        month: monthKey(m.date),
        movement: m,
      }))
    }
    const [dim, ...next] = rest
    const groups = new Map<string, Movement[]>()
    const push = (k: string, m: Movement) => {
      const g = groups.get(k)
      if (g) g.push(m)
      else groups.set(k, [m])
    }

    if (dim === 'category') {
      for (const m of ms) {
        const chain = chainOf(m.categoryId)
        const at = catParent ? chain.indexOf(catParent) : -1
        push(chain[at + 1] ?? `${catParent}:direct`, m)
      }
      return [...groups].map(([key, gms]) => {
        const direct = key.endsWith(':direct')
        const catId = direct ? catParent! : key
        const cat = byId.get(catId)
        const color = cat?.color ?? NEUTRAL
        const id = `${path}/c:${key}`
        // Si dentro hay subcategorías, se sigue bajando por categoría antes de pasar a la siguiente dimensión.
        const hasSub = !direct && gms.some((m) => m.categoryId !== catId)
        return {
          id,
          type: 'category' as const,
          label: direct ? `${cat?.name ?? '?'} (directo)` : (cat?.name ?? 'Sin categoría'),
          color,
          categoryId: catId,
          ...stats(gms),
          children: hasSub ? build(gms, rest, id, color, catId) : build(gms, next, id, color, catId),
        }
      })
    }

    if (dim === 'month') {
      for (const m of ms) push(monthKey(m.date), m)
      return [...groups].map(([key, gms]) => {
        const id = `${path}/t:${key}`
        const color = inherited ?? dominantColor(gms)
        return { id, type: 'month' as const, label: fmtMonth(key), month: key, color, ...stats(gms), children: build(gms, next, id, inherited, catParent) }
      })
    }

    for (const m of ms) push(m.conceptKey, m)
    return [...groups].map(([key, gms]) => {
      const id = `${path}/k:${key}`
      const color = inherited ?? dominantColor(gms)
      return {
        id,
        type: 'concept' as const,
        label: preferredSpelling(gms.map((m) => m.concept)),
        color,
        ...stats(gms),
        children: build(gms, next, id, inherited, catParent),
      }
    })
  }

  const sortDeep = (nodes: CityNode[]) => {
    nodes.sort((a, b) => b.value - a.value)
    for (const n of nodes) if (n.children) sortDeep(n.children)
    return nodes
  }

  return { id: 'root', type: 'root', label: rootLabel, color: NEUTRAL, ...stats(movements), children: sortDeep(build(movements, dims, 'root', null, null)) }
}

/** Recorre la ruta guardada; si algún tramo ya no existe (cambió el filtro), se queda en el último que sí. */
export function resolvePath(root: CityNode, path: string[]): CityNode[] {
  const out = [root]
  for (const id of path) {
    const next = out[out.length - 1].children?.find((c) => c.id === id)
    if (!next) break
    out.push(next)
  }
  return out
}

export function findById(root: CityNode, id: string): CityNode | null {
  if (root.id === id) return root
  if (!id.startsWith(root.id + '/')) return null
  for (const c of root.children ?? []) {
    const hit = findById(c, id)
    if (hit) return hit
  }
  return null
}

/** Todos los movimientos bajo un nodo. */
export function movementsOf(node: CityNode): Movement[] {
  if (node.movement) return [node.movement]
  return (node.children ?? []).flatMap(movementsOf)
}
