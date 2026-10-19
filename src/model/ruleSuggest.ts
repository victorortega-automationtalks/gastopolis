import { normalizeKey } from '../lib/text'
import { classify, findCategory, type AutoCategory } from './autocat'
import { ruleMatcher } from './rules'
import type { Category, Kind, Movement, Rule } from './types'

/**
 * Sugerencias de reglas: los conceptos que más se repiten y aún no cubre ninguna regla, con el texto que conviene
 * buscar («revolut» para «Revolut**1271* Dublin 0000» y «Revolut**6553* Dublin 0100») y una categoría propuesta.
 */

/** Palabras de relleno al principio de los conceptos del banco: no sirven para reconocer al comercio. */
const LEADING = new Set('compra compras en pago pagos www com at cargo recibo adeudo tarj tarjeta trf transf de del la el los las e s sp p n'.split(' '))
/** Primeras palabras demasiado genéricas para ir solas: se añade la siguiente («hotel at» no, «consulta psicologia» sí). */
const VAGUE = new Set(
  'real hotel hostal consulta viajes clinica clin farmacia restaurante bar cafeteria taberna tienda tiendas super supermercado gasolinera estacion banco dinero gasto interno interna trans traspaso'.split(
    ' ',
  ),
)
/** Bizum ya lo resuelve la clasificación automática por su concepto; una regla «bizum» lo metería todo en un saco. */
const SKIP = /\bbizum\b/

/**
 * El texto de la regla para un concepto: la primera palabra que identifica al comercio (4 letras o más, sin números)
 * o, si es genérica, esa y la siguiente. Siempre un trozo literal del concepto, para que «contiene» lo encuentre.
 */
export function rulePattern(concept: string): string | undefined {
  const key = normalizeKey(concept)
  if (SKIP.test(key)) return undefined
  const tokens = [...key.matchAll(/[a-z0-9ñ]+/g)].filter((t) => !/\d/.test(t[0]) && !LEADING.has(t[0]))
  const first = tokens[0]
  if (!first || first[0].length < 3) return undefined
  const second = tokens[1]
  if (first[0].length >= 4 && !VAGUE.has(first[0])) return first[0]
  if (!second) return first[0].length >= 4 ? first[0] : undefined
  return key.slice(first.index, second.index! + second[0].length)
}

export interface RuleSuggestion {
  pattern: string
  kind: Exclude<Kind, 'transfer'>
  count: number
  total: number
  /** Conceptos de ejemplo, los más repetidos. */
  samples: string[]
  /** Categoría propuesta: la que más tienen ya (si no es de reserva) o la de la clasificación automática. */
  categoryId?: string
  /** Si no existe aún, la que propone la clasificación automática (se crea al aceptar). */
  newCategory?: AutoCategory
}

export function suggestRules(
  movements: Pick<Movement, 'concept' | 'amount' | 'categoryId'>[],
  rules: Pick<Rule, 'matchType' | 'pattern' | 'enabled'>[],
  categories: Pick<Category, 'id' | 'name' | 'kind'>[],
  reserveIds: string[] = [],
  { min = 3, limit = 12 } = {},
): RuleSuggestion[] {
  const tests = rules.filter((r) => r.enabled).map(ruleMatcher)
  const reserve = new Set(reserveIds)
  const kindOf = new Map(categories.map((c) => [c.id, c.kind]))
  const groups = new Map<
    string,
    { pattern: string; kind: 'expense' | 'income'; count: number; total: number; concepts: Map<string, number>; cats: Map<string, number> }
  >()
  for (const m of movements) {
    if (!m.amount || tests.some((t) => t(m.concept))) continue
    const pattern = rulePattern(m.concept)
    if (!pattern) continue
    const kind = m.amount < 0 ? 'expense' : 'income'
    const k = `${kind}|${pattern}`
    const g = groups.get(k) ?? { pattern, kind, count: 0, total: 0, concepts: new Map(), cats: new Map() }
    g.count++
    g.total += m.amount
    g.concepts.set(m.concept, (g.concepts.get(m.concept) ?? 0) + 1)
    if (!reserve.has(m.categoryId)) g.cats.set(m.categoryId, (g.cats.get(m.categoryId) ?? 0) + 1)
    groups.set(k, g)
  }
  return [...groups.values()]
    .filter((g) => g.count >= min)
    .sort((a, b) => b.count - a.count || Math.abs(b.total) - Math.abs(a.total))
    .slice(0, limit)
    .map((g) => {
      const samples = [...g.concepts].sort((a, b) => b[1] - a[1]).map(([c]) => c)
      // La que más tienen ya, si encaja con el sentido del dinero (o es un traspaso).
      const usual = [...g.cats]
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id)
        .find((id) => kindOf.get(id) === g.kind || kindOf.get(id) === 'transfer')
      const auto = usual ? undefined : classify({ concept: samples[0], amount: g.kind === 'expense' ? -1 : 1 })
      const existing = usual ?? (auto && findCategory(auto, categories))
      return {
        pattern: g.pattern,
        kind: g.kind,
        count: g.count,
        total: Math.round(g.total * 100) / 100,
        samples: samples.slice(0, 3),
        categoryId: existing,
        newCategory: existing ? undefined : auto,
      }
    })
}
