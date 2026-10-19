import { autoContext, classify, findCategory, words, type AutoCategory, type AutoContext } from './autocat'
import { rulePattern } from './ruleSuggest'
import type { Category, Movement, Rule } from './types'

/**
 * El Clasificador: un minijuego para dejar «Sin clasificar» a cero. Cada carta es un grupo de movimientos parecidos
 * (el mismo comercio escrito de varias formas) que se clasifican de una vez; al elegir, se crea una regla para que los
 * que lleguen después ya vengan clasificados. Las cartas que más movimientos arreglan salen primero.
 */

type Mv = Pick<Movement, 'id' | 'concept' | 'amount' | 'date' | 'categoryId'>

/** Clave que agrupa conceptos parecidos: el texto de la regla si lo hay; si no, el concepto sin números ni símbolos. */
export function groupKey(concept: string): string {
  return (
    rulePattern(concept) ??
    words(concept)
      .replace(/\b\w*\d\w*\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

export interface SortCard {
  key: string
  kind: 'expense' | 'income'
  ids: string[]
  total: number
  /** Conceptos tal cual, los más repetidos primero. */
  samples: string[]
  from: string
  to: string
  /** La regla que se crea al clasificar, para los que lleguen después (si hay un texto fiable). */
  rule?: Pick<Rule, 'matchType' | 'pattern'>
}

/** El mazo: lo que sigue en las categorías de reserva, agrupado y ordenado por cuántos movimientos arregla cada carta. */
export function buildDeck(movements: Mv[], reserveIds: string[]): SortCard[] {
  const reserve = new Set(reserveIds)
  const groups = new Map<string, SortCard & { counts: Map<string, number> }>()
  for (const m of movements) {
    if (!reserve.has(m.categoryId) || !m.amount) continue
    const kind = m.amount < 0 ? 'expense' : 'income'
    const key = groupKey(m.concept)
    if (!key) continue
    const k = `${kind}|${key}`
    const g = groups.get(k) ?? {
      key,
      kind,
      ids: [] as string[],
      total: 0,
      samples: [] as string[],
      from: m.date,
      to: m.date,
      counts: new Map<string, number>(),
    }
    g.ids.push(m.id)
    g.total += m.amount
    g.counts.set(m.concept, (g.counts.get(m.concept) ?? 0) + 1)
    if (m.date < g.from) g.from = m.date
    if (m.date > g.to) g.to = m.date
    groups.set(k, g)
  }
  return [...groups.values()]
    .map(({ counts, ...g }) => {
      const samples = [...counts].sort((a, b) => b[1] - a[1]).map(([c]) => c)
      const pattern = rulePattern(samples[0])
      const rule: SortCard['rule'] = pattern
        ? { matchType: 'contains', pattern }
        : samples.length === 1
          ? { matchType: 'equals', pattern: samples[0] }
          : undefined
      return { ...g, total: Math.round(g.total * 100) / 100, samples, rule }
    })
    .sort((a, b) => b.ids.length - a.ids.length || Math.abs(b.total) - Math.abs(a.total))
}

export interface SortOption {
  /** Categoría que ya existe, o nada si hay que crearla (`auto`). */
  categoryId?: string
  auto?: AutoCategory
  name: string
  /** Por qué se propone: lo dice el catálogo, la tienen gastos parecidos, o es de las que más usas. */
  reason: 'catalog' | 'similar' | 'frequent'
}

/**
 * Opciones para una carta, de la más probable a la menos: lo que tienen ya los movimientos parecidos (mismo comercio o
 * misma primera palabra), lo que dice el catálogo de comercios y, para completar, tus categorías más usadas de ese tipo.
 * Siempre del sentido del dinero de la carta (o traspasos), nunca las de reserva.
 */
export function cardOptions(
  card: SortCard,
  movements: Mv[],
  categories: Pick<Category, 'id' | 'name' | 'kind'>[],
  reserveIds: string[],
  ctx: AutoContext = autoContext([]),
  max = 6,
): SortOption[] {
  const reserve = new Set(reserveIds)
  const byId = new Map(categories.map((c) => [c.id, c]))
  const fits = (id: string) => {
    const c = byId.get(id)
    return !!c && !reserve.has(id) && (c.kind === card.kind || c.kind === 'transfer')
  }
  const out: SortOption[] = []
  const seen = new Set<string>()
  const push = (o: SortOption) => {
    const k = o.categoryId ?? `auto:${o.auto!.key}`
    if (seen.has(k) || out.length >= max) return
    seen.add(k)
    out.push(o)
  }
  const sign = card.kind === 'expense' ? -1 : 1
  const first = card.key.split(' ')[0]
  const similar = new Map<string, number>()
  const frequent = new Map<string, number>()
  for (const m of movements) {
    if (Math.sign(m.amount) !== sign || !fits(m.categoryId)) continue
    frequent.set(m.categoryId, (frequent.get(m.categoryId) ?? 0) + 1)
    const k = groupKey(m.concept)
    // El mismo comercio pesa mucho más que compartir la primera palabra.
    const w = k === card.key ? 10 : first.length >= 4 && k.split(' ')[0] === first ? 1 : 0
    if (w) similar.set(m.categoryId, (similar.get(m.categoryId) ?? 0) + w)
  }
  for (const [id] of [...similar].sort((a, b) => b[1] - a[1])) push({ categoryId: id, name: byId.get(id)!.name, reason: 'similar' })
  const auto = classify({ concept: card.samples[0], amount: sign }, ctx)
  if (auto) {
    const id = findCategory(auto, categories)
    if (id && fits(id)) push({ categoryId: id, name: byId.get(id)!.name, reason: 'catalog' })
    else if (!id) push({ auto, name: auto.name, reason: 'catalog' })
  }
  for (const [id] of [...frequent].sort((a, b) => b[1] - a[1])) push({ categoryId: id, name: byId.get(id)!.name, reason: 'frequent' })
  return out
}

/** Puntos de una carta: más cuantos más movimientos arregla, y la racha multiplica (hasta ×3). */
export function cardPoints(count: number, streak: number): number {
  return Math.round((10 + 5 * Math.min(count, 20)) * Math.min(3, 1 + streak * 0.25))
}
