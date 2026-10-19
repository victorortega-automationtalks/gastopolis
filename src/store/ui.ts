import type { Lever } from '../model/lab'
import { create } from 'zustand'
import { DEFAULT_FILTERS, type Filters } from '../model/period'

export type Route =
  | 'inicio'
  | 'ciudad'
  | 'calendario'
  | 'cordillera'
  | 'balanza'
  | 'rio'
  | 'movimientos'
  | 'clasificar'
  | 'cuentas'
  | 'objetivos'
  | 'fugas'
  | 'laboratorio'
  | 'categorias'
  | 'informes'
  | 'ajustes'

export const ROUTES: Route[] = [
  'inicio',
  'ciudad',
  'calendario',
  'cordillera',
  'balanza',
  'rio',
  'movimientos',
  'clasificar',
  'cuentas',
  'objetivos',
  'fugas',
  'laboratorio',
  'categorias',
  'informes',
  'ajustes',
]

function routeFromHash(): Route {
  const h = (typeof location !== 'undefined' ? location.hash : '').replace(/^#\/?/, '') as Route
  return ROUTES.includes(h) ? h : 'inicio'
}

export interface Toast {
  id: number
  text: string
  tone: 'ok' | 'error' | 'info'
  action?: { label: string; run: () => void }
}

interface UIState {
  route: Route
  filters: Filters
  importOpen: boolean
  /** null = cerrado; '' = nuevo; id = editar. */
  editing: string | null
  /** Fecha con la que abrir un movimiento nuevo (p. ej. desde un día del calendario). */
  draftDate: string | null
  toasts: Toast[]
  navigate: (r: Route) => void
  setFilters: (patch: Partial<Filters>) => void
  resetFilters: () => void
  openImport: (open: boolean) => void
  editMovement: (id: string | null, opts?: { date?: string }) => void
  toast: (text: string, tone?: Toast['tone'], action?: Toast['action']) => void
  dismissToast: (id: number) => void
  /** Palanca que otra pantalla manda al Laboratorio (p. ej., «Simular» una suscripción desde Fugas). */
  labSeed: Lever | null
  seedLab: (lever: Lever) => void
  clearLabSeed: () => void
}

let toastSeq = 0

export const useUI = create<UIState>((set, get) => ({
  route: routeFromHash(),
  filters: DEFAULT_FILTERS,
  importOpen: false,
  editing: null,
  draftDate: null,
  toasts: [],
  navigate: (route) => {
    if (location.hash !== `#/${route}`) location.hash = `/${route}`
    set({ route })
  },
  setFilters: (patch) => set({ filters: { ...get().filters, ...patch } }),
  resetFilters: () => set({ filters: DEFAULT_FILTERS }),
  openImport: (importOpen) => set({ importOpen }),
  editMovement: (editing, opts) => set({ editing, draftDate: opts?.date ?? null }),
  toast: (text, tone = 'ok', action) => {
    const id = ++toastSeq
    set({ toasts: [...get().toasts, { id, text, tone, action }] })
    setTimeout(() => get().dismissToast(id), action ? 7000 : 3500)
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  labSeed: null,
  seedLab: (labSeed) => {
    set({ labSeed })
    get().navigate('laboratorio')
  },
  clearLabSeed: () => set({ labSeed: null }),
}))

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => useUI.setState({ route: routeFromHash() }))
}
