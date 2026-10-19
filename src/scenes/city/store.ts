import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Kind } from '../../model/types'
import type { ColorBy, HeightBy } from './layout'

interface CityPrefs {
  /** Ciudad 3D o vista WinDirStat (árbol + treemap con relieve). */
  mode: 'city' | 'dirstat'
  kind: Kind
  preset: string
  heightBy: HeightBy
  colorBy: ColorBy
  depth: 1 | 2
}

interface CityState extends CityPrefs {
  /** Ids de nodo desde la raíz hasta el que se está viendo. */
  path: string[]
  selectedId: string | null
  hoveredId: string | null
  setPrefs: (p: Partial<CityPrefs>) => void
  setPath: (path: string[]) => void
  select: (id: string | null) => void
  hover: (id: string | null) => void
}

/** Preferencias de la Ciudad: por dispositivo, en localStorage. La ruta y la selección no se guardan. */
export const useCity = create<CityState>()(
  persist(
    (set) => ({
      mode: 'city',
      kind: 'expense',
      preset: 'cat-concept',
      heightBy: 'count',
      colorBy: 'category',
      depth: 2,
      path: [],
      selectedId: null,
      hoveredId: null,
      // Cambiar cómo se agrupa invalida la ruta.
      setPrefs: (p) =>
        set((s) => {
          const regroup = (p.kind !== undefined && p.kind !== s.kind) || (p.preset !== undefined && p.preset !== s.preset)
          return regroup ? { ...p, path: [], selectedId: null } : p
        }),
      setPath: (path) => set({ path, selectedId: null, hoveredId: null }),
      select: (selectedId) => set({ selectedId }),
      hover: (hoveredId) => set({ hoveredId }),
    }),
    {
      name: 'gastopolis.city',
      storage: createJSONStorage(() => localStorage),
      partialize: ({ mode, kind, preset, heightBy, colorBy, depth }) => ({ mode, kind, preset, heightBy, colorBy, depth }),
    },
  ),
)
