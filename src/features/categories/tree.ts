import type { Category } from '../../model/types'

/** "Ocio › Restaurantes" cuando tiene padre. */
export function categoryLabel(c: Category, all: Category[]): string {
  const parent = c.parentId ? all.find((p) => p.id === c.parentId) : undefined
  return parent ? `${parent.name} › ${c.name}` : c.name
}

/** Lista plana en orden de árbol con su profundidad, para pintar la jerarquía indentada. */
export function flattenTree(categories: Category[]): { category: Category; depth: number }[] {
  const ids = new Set(categories.map((c) => c.id))
  const children = new Map<string | null, Category[]>()
  for (const c of categories) {
    const parent = c.parentId && ids.has(c.parentId) ? c.parentId : null
    const list = children.get(parent) ?? []
    list.push(c)
    children.set(parent, list)
  }
  for (const list of children.values()) list.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
  const out: { category: Category; depth: number }[] = []
  const visit = (parent: string | null, depth: number) => {
    for (const c of children.get(parent) ?? []) {
      out.push({ category: c, depth })
      visit(c.id, depth + 1)
    }
  }
  visit(null, 0)
  return out
}
