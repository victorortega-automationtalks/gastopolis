import { normalizeKey } from '../lib/text'
import type { Category, Kind, Movement, Rule } from './types'

export const MATCH_LABEL: Record<Rule['matchType'], string> = {
  contains: 'contiene',
  equals: 'es exactamente',
  regex: 'expresión regular',
}

/** Compila la condición de una regla. Una expresión regular inválida no coincide con nada (y la UI lo avisa). */
export function ruleMatcher(rule: Pick<Rule, 'matchType' | 'pattern'>): (concept: string) => boolean {
  const key = normalizeKey(rule.pattern)
  if (!key) return () => false
  if (rule.matchType === 'equals') return (c) => normalizeKey(c) === key
  if (rule.matchType === 'contains') return (c) => normalizeKey(c).includes(key)
  try {
    const re = new RegExp(rule.pattern, 'i')
    return (c) => re.test(c) || re.test(normalizeKey(c))
  } catch {
    return () => false
  }
}

export function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern, 'i')
    return true
  } catch {
    return false
  }
}

/**
 * Una regla puede llevar un gasto a otra categoría de gasto o a una de transferencia, nunca un gasto a ingreso.
 * Una transferencia solo pasa a gasto si sale dinero, y a ingreso si entra: el signo no se da la vuelta.
 */
export function ruleAppliesTo(ruleKind: Kind, movementKind: Kind, amount: number): boolean {
  if (ruleKind === movementKind || ruleKind === 'transfer') return true
  if (movementKind !== 'transfer') return false
  return ruleKind === 'expense' ? amount < 0 : amount > 0
}

export interface CompiledRules {
  /** Categoría que asignan las reglas a un concepto (la primera activa por prioridad que coincide), o undefined. */
  categoryFor: (concept: string, kind: Kind, amount: number) => string | undefined
}

export function compileRules(rules: Rule[], categories: Pick<Category, 'id' | 'kind'>[]): CompiledRules {
  const kindOf = new Map(categories.map((c) => [c.id, c.kind]))
  const active = rules
    .filter((r) => r.enabled && r.set.categoryId && kindOf.has(r.set.categoryId))
    .sort((a, b) => a.priority - b.priority)
    .map((r) => ({ rule: r, test: ruleMatcher(r), kind: kindOf.get(r.set.categoryId!)! }))
  return {
    categoryFor: (concept, kind, amount) => active.find((a) => ruleAppliesTo(a.kind, kind, amount) && a.test(concept))?.rule.set.categoryId,
  }
}

export interface RuleChange {
  movement: Movement
  toCategoryId: string
}

/** Qué movimientos cambiarían de categoría si se aplicaran las reglas ahora. */
export function previewRules(rules: Rule[], categories: Category[], movements: Movement[]): RuleChange[] {
  const compiled = compileRules(rules, categories)
  const out: RuleChange[] = []
  for (const m of movements) {
    const to = compiled.categoryFor(m.concept, m.kind, m.amount)
    if (to && to !== m.categoryId) out.push({ movement: m, toCategoryId: to })
  }
  return out
}

/** Cuántos movimientos cumplen una condición (para la vista previa al escribirla). */
export function countMatches(rule: Pick<Rule, 'matchType' | 'pattern'>, movements: Movement[]): number {
  const test = ruleMatcher(rule)
  let n = 0
  for (const m of movements) if (test(m.concept)) n++
  return n
}
