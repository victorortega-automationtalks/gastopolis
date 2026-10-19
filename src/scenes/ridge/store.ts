import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { BucketChoice } from '../../model/ridgeSeries'
import type { Kind } from '../../model/types'

interface RidgePrefs {
  kind: Kind
  /** Categorías raíz o todas (subcategorías como crestas propias). */
  level: 'root' | 'leaf'
  /** Un punto por día, semana o mes; «auto» según lo que abarquen los datos. */
  bucket: BucketChoice
  setPrefs: (p: Partial<Pick<RidgePrefs, 'kind' | 'level' | 'bucket'>>) => void
}

export const useRidge = create<RidgePrefs>()(
  persist((set) => ({ kind: 'expense', level: 'root', bucket: 'auto', setPrefs: (p) => set(p) }), {
    name: 'gastopolis.ridge',
    storage: createJSONStorage(() => localStorage),
    partialize: ({ kind, level, bucket }) => ({ kind, level, bucket }),
  }),
)
