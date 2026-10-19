import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type CardId = 'hero' | 'city' | 'kpis' | 'flow' | 'river' | 'top' | 'goals' | 'leaks' | 'budgets' | 'upcoming' | 'subscriptions' | 'streak'

export const CARD_LABEL: Record<CardId, string> = {
  hero: 'Balance del mes',
  city: 'Mini-ciudad',
  kpis: 'Indicadores',
  flow: 'Flujo mensual',
  river: 'Río del mes',
  top: 'Dónde se va el dinero',
  goals: 'Objetivos',
  leaks: 'Fugas',
  budgets: 'Presupuestos',
  upcoming: 'Próximos cargos',
  subscriptions: 'Suscripciones y recibos',
  streak: 'Racha y ritmo',
}

export const DEFAULT_ORDER: CardId[] = ['hero', 'city', 'kpis', 'flow', 'top', 'river', 'goals', 'leaks', 'budgets', 'upcoming', 'subscriptions', 'streak']

/** Para no abrumar, de entrada solo lo esencial; el resto se enseña desde «Personalizar». */
export const DEFAULT_HIDDEN: CardId[] = ['kpis', 'river', 'budgets', 'upcoming', 'subscriptions', 'streak']

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
      version: 1,
      migrate: (saved, version) => {
        const s = saved as Partial<DashboardPrefs>
        return version < 1 ? { ...s, hidden: [...new Set([...(s.hidden ?? []), ...DEFAULT_HIDDEN])] } : s
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
