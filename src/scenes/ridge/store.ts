import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Kind } from '../../model/types'

interface RidgePrefs {
  kind: Kind
  /** Categorías raíz o todas (subcategorías como crestas propias). */
  level: 'root' | 'leaf'
  setPrefs: (p: Partial<Pick<RidgePrefs, 'kind' | 'level'>>) => void
}

export const useRidge = create<RidgePrefs>()(
  persist((set) => ({ kind: 'expense', level: 'root', setPrefs: (p) => set(p) }), {
    name: 'gastopolis.ridge',
    storage: createJSONStorage(() => localStorage),
    partialize: ({ kind, level }) => ({ kind, level }),
  }),
)
