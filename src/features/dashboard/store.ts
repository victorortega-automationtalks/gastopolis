import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type CardId = 'hero' | 'review' | 'city' | 'kpis' | 'flow' | 'river' | 'top' | 'goals' | 'leaks' | 'budgets' | 'upcoming' | 'subscriptions' | 'streak'

export const CARD_LABEL: Record<CardId, string> = {
  hero: 'Este mes',
  review: 'Para revisar',
  city: 'Mini-ciudad',
  kpis: 'Indicadores',
  flow: 'Últimos meses',
  river: 'Río del mes',
  top: 'En qué se va',
  goals: 'Objetivos',
  leaks: 'Fugas',
  budgets: 'Presupuestos',
  upcoming: 'Próximos cargos',
  subscriptions: 'Suscripciones y recibos',
  streak: 'Racha y ritmo',
}

export const DEFAULT_ORDER: CardId[] = [
  'hero',
  'top',
  'flow',
  'review',
  'goals',
  'city',
  'kpis',
  'river',
  'leaks',
  'budgets',
  'upcoming',
  'subscriptions',
  'streak',
]

/**
 * Para no abrumar, de entrada solo el resumen: cuánto llevas, en qué, cómo van los meses y lo que pide atención
 * («Para revisar» ya avisa de fugas, cargos y presupuestos). El resto se enseña desde «Personalizar».
 */
export const DEFAULT_HIDDEN: CardId[] = ['city', 'kpis', 'river', 'leaks', 'budgets', 'upcoming', 'subscriptions', 'streak']

interface DashboardPrefs {
  order: CardId[]
  hidden: CardId[]
  move: (id: CardId, dir: -1 | 1) => void
  toggle: (id: CardId) => void
  reset: () => void
}

/** Orden y visibilidad de las tarjetas del Inicio, por dispositivo. */
export const useDashboard = create<DashboardPrefs>()(
  persist(
    (set, get) => ({
      order: DEFAULT_ORDER,
      hidden: DEFAULT_HIDDEN,
      move: (id, dir) => {
        const order = [...get().order]
        const i = order.indexOf(id)
        const j = i + dir
        if (i < 0 || j < 0 || j >= order.length) return
        ;[order[i], order[j]] = [order[j], order[i]]
        set({ order })
      },
      toggle: (id) => set((s) => ({ hidden: s.hidden.includes(id) ? s.hidden.filter((h) => h !== id) : [...s.hidden, id] })),
      reset: () => set({ order: DEFAULT_ORDER, hidden: DEFAULT_HIDDEN }),
    }),
    {
      name: 'gastopolis.dashboard',
      // v1: Inicio simplificado. A quien venía de antes se le ocultan también las tarjetas secundarias (se recuperan en
      // «Personalizar»).
      // v2: Inicio como resumen. Se vuelve al orden y las tarjetas por defecto (lo demás sigue en «Personalizar»).
      version: 2,
      migrate: (saved, version) => {
        const s = saved as Partial<DashboardPrefs>
        return version < 2 ? { ...s, order: DEFAULT_ORDER, hidden: DEFAULT_HIDDEN } : s
      },
      storage: createJSONStorage(() => localStorage),
      partialize: ({ order, hidden }) => ({ order, hidden }),
      // Tarjetas nuevas en versiones futuras aparecen al final aunque el orden guardado no las tenga.
      merge: (saved, current) => {
        const s = saved as Partial<DashboardPrefs> | undefined
        const order = (s?.order ?? []).filter((id) => DEFAULT_ORDER.includes(id))
        return { ...current, order: [...order, ...DEFAULT_ORDER.filter((id) => !order.includes(id))], hidden: s?.hidden ?? DEFAULT_HIDDEN }
      },
    },
  ),
)
