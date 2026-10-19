import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { applyFilters } from '../model/aggregate'
import { DEFAULT_SETTINGS } from '../model/defaults'
import { today } from '../model/period'
import type { Category, Goal, LeakDecision, Movement, Rule, Settings } from '../model/types'
import { useUI } from '../store/ui'
import { queries } from './queries'

const EMPTY_M: Movement[] = []
const EMPTY_C: Category[] = []
const EMPTY_R: Rule[] = []
const EMPTY_G: Goal[] = []
const EMPTY_D: LeakDecision[] = []

export function useMovements(): { movements: Movement[]; loading: boolean } {
  const ms = useLiveQuery(queries.movementsByDateDesc, [])
  return { movements: ms ?? EMPTY_M, loading: ms === undefined }
}

export function useCategories(): Category[] {
  return useLiveQuery(queries.categoriesInOrder, []) ?? EMPTY_C
}

export function useCategoryMap(): Map<string, Category> {
  const cats = useCategories()
  return useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats])
}

export function useSettings(): Settings {
  return useLiveQuery(queries.settings, []) ?? DEFAULT_SETTINGS
}

export function useRules() {
  return useLiveQuery(queries.rulesByPriority, []) ?? EMPTY_R
}

export function useGoals() {
  return useLiveQuery(queries.goals, []) ?? EMPTY_G
}

export function useDecisions() {
  return useLiveQuery(queries.decisions, []) ?? EMPTY_D
}

export function useBatches() {
  return useLiveQuery(queries.batchesNewestFirst, []) ?? []
}

/** Movimientos tras aplicar los filtros globales de la barra superior. */
export function useFilteredMovements(): { all: Movement[]; filtered: Movement[]; loading: boolean } {
  const { movements, loading } = useMovements()
  const categories = useCategories()
  const settings = useSettings()
  const filters = useUI((s) => s.filters)
  const filtered = useMemo(
    () => applyFilters(movements, filters, categories, today(), settings.fiscalYearStart),
    [movements, filters, categories, settings.fiscalYearStart],
  )
  return { all: movements, filtered, loading }
}
