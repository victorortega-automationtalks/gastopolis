import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Period } from '../../model/period'
import type { ReportFormat } from '../../model/reports/file'
import type { ReportId } from '../../model/reports/types'
import type { Kind } from '../../model/types'

/** `all` = informe completo (todos en un archivo). */
export type ReportChoice = ReportId | 'all'

interface ReportPrefs {
  report: ReportChoice
  format: ReportFormat
  period: Period
  categoryIds: string[]
  kinds: Kind[]
  set: (patch: Partial<Omit<ReportPrefs, 'set'>>) => void
}

/** Lo último elegido en Informes, por dispositivo: al volver, el mismo informe y formato. */
export const useReportPrefs = create<ReportPrefs>()(
  persist(
    (set) => ({
      report: 'summary',
      format: 'pdf',
      period: { preset: 'thisYear' },
      categoryIds: [],
      kinds: ['expense', 'income', 'transfer'],
      set: (patch) => set(patch),
    }),
    {
      name: 'gastopolis.reports',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
