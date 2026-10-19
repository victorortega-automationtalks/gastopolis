import { liveQuery } from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useSyncExternalStore } from 'react'
import { applyFilters } from '../model/aggregate'
import { DEFAULT_SETTINGS } from '../model/defaults'
import { bookMovements } from '../model/payday'
import { today } from '../model/period'
import type { Account, Category, Goal, LeakDecision, Movement, Rule, Scenario, Settings } from '../model/types'
import { useUI } from '../store/ui'
import { queries } from './queries'

const EMPTY_M: Movement[] = []
const EMPTY_C: Category[] = []
const EMPTY_R: Rule[] = []
const EMPTY_G: Goal[] = []
const EMPTY_D: LeakDecision[] = []

/**
 * Movimientos: una sola suscripción para toda la app, que se abre con el primer uso y se queda. Antes cada componente
 * abría la suya y cada cambio de pantalla volvía a leer toda la tabla.
 */
const movementsStore = (() => {
  let value: Movement[] | undefined
  let started = false
  const listeners = new Set<() => void>()
  const start = () => {
    if (started) return
    started = true
    liveQuery(queries.movementsByDateDesc).subscribe({
      next: (v) => {
        value = v
        listeners.forEach((l) => l())
      },
      error: (e) => console.error(e),
    })
  }
  return {
    subscribe: (l: () => void) => {
      start()
      listeners.add(l)
      return () => listeners.delete(l)
    },
    get: () => value,
  }
})()

/** Movimientos contables, calculados una vez por cambio de datos para toda la app (no uno por componente). */
let booked: { raw: Movement[]; on: boolean; out: Movement[] } | null = null
function bookedOf(raw: Movement[], on: boolean): Movement[] {
  if (!on) return raw
  if (!booked || booked.raw !== raw || booked.on !== on) booked = { raw, on, out: bookMovements(raw) }
  return booked.out
}

/**
 * Movimientos para analizar: con la nómina inteligente activada, los cobros que pagan el mes siguiente llevan ya la
 * fecha de ese mes (y la real en `realDate`). Para enseñar fechas, `shownDate(m)`; para editar, `useRawMovements`.
 */
export function useMovements(): { movements: Movement[]; loading: boolean } {
  const ms = useSyncExternalStore(movementsStore.subscribe, movementsStore.get)
  const { paydayShift } = useSettings()
  return { movements: ms ? bookedOf(ms, paydayShift !== false) : EMPTY_M, loading: ms === undefined }
}

/** Movimientos tal cual están guardados (fechas reales). */
export function useRawMovements(): { movements: Movement[]; loading: boolean } {
  const ms = useSyncExternalStore(movementsStore.subscribe, movementsStore.get)
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

const EMPTY_S: Scenario[] = []
export function useScenarios() {
  return useLiveQuery(queries.scenarios, []) ?? EMPTY_S
}

const EMPTY_A: Account[] = []
export function useAccounts(): Account[] {
  return useLiveQuery(queries.accountsInOrder, []) ?? EMPTY_A
}

/** La credencial de Enable Banking (undefined si no hay; null mientras carga). */
export function useBankSecret() {
  return useLiveQuery(async () => (await queries.bankSecret()) ?? undefined, [], null)
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
