import { fmtDate } from '../model/format'
import { resolvePeriod, today, type Period, type PeriodPreset } from '../model/period'

export const PRESETS: { preset: PeriodPreset; label: string }[] = [
  { preset: 'all', label: 'Todo' },
  { preset: 'thisMonth', label: 'Este mes' },
  { preset: 'lastMonth', label: 'Mes pasado' },
  { preset: 'last3', label: 'Últimos 3 meses' },
  { preset: 'last12', label: 'Últimos 12 meses' },
  { preset: 'thisYear', label: 'Este año' },
  { preset: 'lastYear', label: 'Año pasado' },
]

export function periodLabel(p: Period, fiscalYearStart: number): string {
  if (p.preset === 'year') return fiscalYearStart > 1 ? `${p.year}/${String((p.year ?? 0) + 1).slice(2)}` : String(p.year)
  if (p.preset === 'custom') {
    const r = resolvePeriod(p, today(), fiscalYearStart)
    if (!r) return 'Todo'
    if (!p.from) return `Hasta ${fmtDate(r.to)}`
    if (!p.to) return `Desde ${fmtDate(r.from)}`
    return `${fmtDate(r.from)} – ${fmtDate(r.to)}`
  }
  return PRESETS.find((x) => x.preset === p.preset)?.label ?? 'Todo'
}
