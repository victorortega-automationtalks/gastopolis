import { fmtDate, fmtMoney, fmtMonth, fmtPercent } from '../format'
import type { Cell, ColumnsSection, RankingSection, TableSection, ValueType } from './types'

export interface CellFormat {
  currency: string
  locale: string
}

/** Texto de una celda para leer (PDF y pantalla). Vacío se ve como «—». */
export function formatCell(v: Cell, type: ValueType, f: CellFormat, opts: { compact?: boolean } = {}): string {
  if (v == null || v === '') return type === 'text' ? '' : '—'
  if (typeof v === 'string') {
    if (type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return fmtDate(v)
    if (type === 'month' && /^\d{4}-\d{2}$/.test(v)) return fmtMonth(v)
    return v
  }
  switch (type) {
    case 'money':
      return fmtMoney(v, { currency: f.currency, locale: f.locale, compact: opts.compact })
    case 'percent':
      return fmtPercent(v, f.locale, Math.abs(v) < 0.1 ? 1 : 0)
    case 'int':
      return v.toLocaleString(f.locale)
    default:
      return String(v)
  }
}

/** Las columnas de números se alinean a la derecha. */
export const isNumeric = (t: ValueType) => t === 'money' || t === 'percent' || t === 'int'

/** Las salidas de hoja de cálculo no dibujan gráficos: van como la tabla de datos que hay detrás. */
export function asTable(s: ColumnsSection | RankingSection): TableSection {
  if (s.kind === 'ranking')
    return {
      kind: 'table',
      title: s.title,
      columns: [
        { label: 'Categoría', type: 'text' },
        { label: 'Importe', type: 'money' },
      ],
      rows: s.items.map((i) => [i.label, i.value]),
      colors: s.items.map((i) => i.color),
    }
  return {
    kind: 'table',
    title: s.title,
    columns: [{ label: '', type: 'text' }, ...s.series.map((x) => ({ label: x.label, type: 'money' as const }))],
    rows: s.labels.map((l, i) => [l, ...s.series.map((x) => x.values[i] ?? 0)]),
  }
}
