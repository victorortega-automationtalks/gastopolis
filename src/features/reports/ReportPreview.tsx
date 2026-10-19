import clsx from 'clsx'
import { REPORT_COLOR } from '../../model/reports/build'
import { formatCell, isNumeric, type CellFormat } from '../../model/reports/cells'
import type { ReportDoc, Section, TableSection, Tone } from '../../model/reports/types'
import { ColumnChart } from '../../ui/charts/Charts'
import { Card } from '../../ui/components/primitives'

/**
 * Vista previa en pantalla de lo que llevará el archivo: los mismos indicadores, gráficos y tablas (estas, recortadas).
 * Los colores de ingresos y gastos del informe (pensados para papel) se cambian por los del tema.
 */

const TONE_CLASS: Record<Tone, string> = { income: 'text-income', expense: 'text-expense', transfer: 'text-transfer', neutral: 'text-ink' }
const THEMED: Record<string, string> = {
  [REPORT_COLOR.income]: 'var(--income)',
  [REPORT_COLOR.expense]: 'var(--expense)',
  [REPORT_COLOR.transfer]: 'var(--transfer)',
  [REPORT_COLOR.accent]: 'var(--accent)',
  [REPORT_COLOR.muted]: 'var(--ink-faint)',
}
const themed = (c: string) => THEMED[c] ?? c

export function ReportPreview({ docs, currency, locale }: { docs: ReportDoc[]; currency: string; locale: string }) {
  const fmt: CellFormat = { currency, locale }
  const maxRows = docs.length > 1 ? 6 : 14
  return (
    <div className="space-y-4">
      {docs.map((d) => (
        <Card key={d.id} className="space-y-5 p-5">
          <div>
            <div className="text-[11px] font-medium tracking-wider text-ink-faint uppercase">Vista previa</div>
            <h3 className="font-display text-xl font-semibold">{d.title}</h3>
            <p className="text-sm text-ink-muted">{d.period}</p>
          </div>
          {d.sections.map((s, i) => (
            <SectionView key={i} s={s} fmt={fmt} maxRows={maxRows} />
          ))}
        </Card>
      ))}
    </div>
  )
}

function SectionView({ s, fmt, maxRows }: { s: Section; fmt: CellFormat; maxRows: number }) {
  if (s.kind === 'text') return <p className="text-sm text-ink-muted">{s.text}</p>
  if (s.kind === 'kpis')
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
        {s.items.map((k) => (
          <div key={k.label} className="min-w-0 rounded-xl bg-surface-2 px-3 py-2.5">
            <div className="truncate text-[10px] font-medium tracking-wider text-ink-faint uppercase">{k.label}</div>
            <div className={clsx('num truncate text-lg font-semibold', TONE_CLASS[k.tone ?? 'neutral'])}>{formatCell(k.value, k.type, fmt)}</div>
            {k.sub && <div className="line-clamp-2 text-xs text-ink-muted">{k.sub}</div>}
          </div>
        ))}
      </div>
    )
  if (s.kind === 'columns')
    return (
      <div>
        <h4 className="mb-2 text-sm font-medium">{s.title}</h4>
        <ColumnChart
          labels={s.labels}
          series={s.series.map((x, i) => ({ id: String(i), label: x.label, color: themed(x.color), values: x.values }))}
          height={180}
          format={(v) => formatCell(v, 'money', fmt, { compact: true })}
          title={(i) => s.labels[i]}
          ariaLabel={s.title}
        />
      </div>
    )
  if (s.kind === 'ranking') {
    const max = Math.max(...s.items.map((i) => i.value), 1e-9)
    return (
      <div>
        <h4 className="mb-2 text-sm font-medium">{s.title}</h4>
        <div className="space-y-1.5">
          {s.items.map((it) => (
            <div key={it.label} className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] items-center gap-3 text-xs">
              <span className="truncate text-ink-muted">{it.label}</span>
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 rounded-r" style={{ width: `${(it.value / max) * 75}%`, background: it.color }} />
                <span className="num shrink-0 font-medium text-ink">{formatCell(it.value, 'money', fmt)}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }
  return <TableView t={s} fmt={fmt} maxRows={maxRows} />
}

function TableView({ t, fmt, maxRows }: { t: TableSection; fmt: CellFormat; maxRows: number }) {
  const rows = t.rows.slice(0, maxRows)
  const more = t.rows.length - rows.length
  const cell = (v: TableSection['rows'][number][number], j: number, i: number, bold = false) => {
    const c = t.columns[j]
    const num = isNumeric(c.type)
    return (
      <td
        key={j}
        className={clsx(
          'px-2 py-1.5 whitespace-nowrap',
          num && 'num text-right',
          num && typeof v === 'number' && v < 0 && c.type === 'money' ? 'text-expense' : t.indent?.[i] ? 'text-ink-muted' : 'text-ink',
          (bold || (t.indent?.some(Boolean) && !t.indent[i] && i >= 0)) && 'font-semibold',
          j === 0 && t.indent?.[i] && 'pl-6',
        )}
      >
        <span className="inline-flex max-w-72 items-center gap-1.5 truncate align-middle">
          {j === 0 && i >= 0 && t.colors?.[i] && <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: t.colors[i]! }} />}
          <span className="truncate">{formatCell(v, c.type, fmt)}</span>
        </span>
      </td>
    )
  }
  return (
    <div>
      <h4 className="mb-2 text-sm font-medium">{t.title}</h4>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-xs">
          <thead className="bg-surface-2 text-ink-muted">
            <tr>
              {t.columns.map((c, j) => (
                <th key={j} className={clsx('px-2 py-1.5 font-medium whitespace-nowrap', isNumeric(c.type) ? 'text-right' : 'text-left')}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-line">
                {r.map((v, j) => cell(v, j, i))}
              </tr>
            ))}
            {t.total && <tr className="border-t border-line-strong">{t.total.map((v, j) => cell(v, j, -1, true))}</tr>}
          </tbody>
        </table>
      </div>
      {more > 0 && <p className="mt-1.5 text-xs text-ink-faint">… y {more.toLocaleString('es-ES')} filas más en el archivo.</p>}
      {t.note && <p className="mt-1.5 text-xs text-ink-faint">{t.note}</p>}
    </div>
  )
}
