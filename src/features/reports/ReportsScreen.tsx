import clsx from 'clsx'
import {
  ArrowLeftRight,
  ChartColumn,
  Download,
  FileSpreadsheet,
  FileText,
  FileType,
  FlaskConical,
  Gauge,
  Grid3x3,
  LayoutDashboard,
  Library,
  ListOrdered,
  Radar,
  Repeat,
  Shapes,
  Store,
  Target,
  type LucideIcon,
} from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { useCategories, useDecisions, useGoals, useMovements, useScenarios, useSettings } from '../../data/hooks'
import { today } from '../../model/period'
import { buildReports } from '../../model/reports/build'
import { REPORTS, reportInfo } from '../../model/reports/catalog'
import { FORMAT_INFO, reportFileName, type ReportFormat } from '../../model/reports/file'
import type { ReportBundle, ReportId } from '../../model/reports/types'
import type { Kind } from '../../model/types'
import { saveFile } from '../../platform'
import { useUI } from '../../store/ui'
import { Button, Card, Field, Segmented } from '../../ui/components/primitives'
import { PeriodPicker } from '../../ui/PeriodPicker'
import { periodLabel } from '../../ui/periodLabel'
import { ReportPreview } from './ReportPreview'
import { useReportPrefs, type ReportChoice } from './store'

const ICON: Record<ReportId, LucideIcon> = {
  summary: LayoutDashboard,
  monthly: ChartColumn,
  categories: Shapes,
  matrix: Grid3x3,
  concepts: Store,
  compare: ArrowLeftRight,
  budgets: Gauge,
  recurring: Repeat,
  goals: Target,
  leaks: Radar,
  lab: FlaskConical,
  movements: ListOrdered,
}

const FORMAT_ICON: Record<ReportFormat, LucideIcon> = { pdf: FileText, xlsx: FileSpreadsheet, csv: FileType }

const KIND_LABEL: Record<Kind, string> = { expense: 'Gastos', income: 'Ingresos', transfer: 'Transferencias' }

export function ReportsScreen() {
  const { movements, loading } = useMovements()
  const categories = useCategories()
  const goals = useGoals()
  const decisions = useDecisions()
  const scenarios = useScenarios()
  const settings = useSettings()
  const prefs = useReportPrefs()
  const toast = useUI((s) => s.toast)
  const [busy, setBusy] = useState(false)

  const ids = useMemo(() => (prefs.report === 'all' ? REPORTS.map((r) => r.id) : [prefs.report]), [prefs.report])
  const label = periodLabel(prefs.period, settings.fiscalYearStart)
  const roots = useMemo(() => categories.filter((c) => !c.parentId), [categories])
  // Solo cuentan las categorías que siguen existiendo (las borradas se olvidan solas).
  const categoryIds = useMemo(() => prefs.categoryIds.filter((id) => roots.some((c) => c.id === id)), [prefs.categoryIds, roots])
  const input = useMemo(
    () => ({
      movements,
      categories,
      goals,
      decisions,
      scenarios,
      settings,
      period: prefs.period,
      periodLabel: label,
      categoryIds,
      kinds: prefs.kinds,
      today: today(),
    }),
    [movements, categories, goals, decisions, scenarios, settings, prefs.period, label, categoryIds, prefs.kinds],
  )
  // La vista previa puede tardar un poco con muchos movimientos: que no frene los clics.
  const deferred = useDeferredValue(input)
  const built = useMemo(() => buildReports(ids, deferred), [ids, deferred])
  const stale = deferred !== input

  const usesCategories = ids.some((id) => reportInfo(id).categories)
  const usesKinds = ids.includes('movements')
  const title = prefs.report === 'all' ? 'Informe completo' : reportInfo(prefs.report).title

  const generate = async () => {
    setBusy(true)
    try {
      const { docs, period } = buildReports(ids, input)
      const bundle: ReportBundle = { title, period, generatedAt: new Date(), currency: settings.currency, locale: settings.locale, docs }
      const info = FORMAT_INFO[prefs.format]
      let content: string | Uint8Array
      if (prefs.format === 'pdf') {
        const { reportsToPdf } = await import('../../model/reports/pdf')
        content = await reportsToPdf(bundle)
      } else if (prefs.format === 'xlsx') {
        const { reportsToXlsx } = await import('../../model/reports/sheet')
        content = reportsToXlsx(bundle)
      } else {
        const { reportsToCsv } = await import('../../model/reports/sheet')
        content = reportsToCsv(bundle)
      }
      const r = await saveFile(reportFileName(title, label, prefs.format, bundle.generatedAt), content, info.mime)
      if (r !== 'cancelled') toast(r === 'shared' ? `${info.label} listo para compartir` : `${info.label} guardado`)
    } catch (e) {
      toast(`No se pudo generar el informe: ${(e as Error).message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const toggleCategory = (id: string) => prefs.set({ categoryIds: categoryIds.includes(id) ? categoryIds.filter((x) => x !== id) : [...categoryIds, id] })
  const toggleKind = (k: Kind) => {
    const next = prefs.kinds.includes(k) ? prefs.kinds.filter((x) => x !== k) : [...prefs.kinds, k]
    if (next.length) prefs.set({ kinds: next })
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <Card className="hidden h-fit p-2 lg:block">
        <ReportItem
          active={prefs.report === 'all'}
          icon={Library}
          title="Informe completo"
          blurb="Todos los informes en un solo archivo, con portada e índice."
          onClick={() => prefs.set({ report: 'all' })}
        />
        <div className="mx-3 my-1.5 border-t border-line" />
        {REPORTS.map((r) => (
          <ReportItem
            key={r.id}
            active={prefs.report === r.id}
            icon={ICON[r.id]}
            title={r.title}
            blurb={r.blurb}
            onClick={() => prefs.set({ report: r.id as ReportChoice })}
          />
        ))}
      </Card>

      <div className="min-w-0 space-y-4">
        <Card className="space-y-4 p-5">
          {/* En móvil, la lista larga de informes empujaría las opciones hacia abajo: un selector. */}
          <Field label="Informe" className="lg:hidden">
            <select className="field" value={prefs.report} onChange={(e) => prefs.set({ report: e.target.value as ReportChoice })}>
              <option value="all">Informe completo</option>
              {REPORTS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          </Field>
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-sm text-ink-muted">
              {prefs.report === 'all' ? 'Los doce informes del periodo, uno detrás de otro.' : reportInfo(prefs.report).blurb}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Periodo" group>
              <PeriodPicker value={prefs.period} onChange={(period) => prefs.set({ period })} />
            </Field>
            <Field label="Formato" group>
              <Segmented<ReportFormat>
                value={prefs.format}
                onChange={(format) => prefs.set({ format })}
                options={(['pdf', 'xlsx', 'csv'] as ReportFormat[]).map((f) => {
                  const Icon = FORMAT_ICON[f]
                  return {
                    value: f,
                    label: (
                      <span className="flex items-center gap-1.5">
                        <Icon size={14} />
                        {FORMAT_INFO[f].label}
                      </span>
                    ),
                  }
                })}
              />
            </Field>
            <Button variant="primary" className="w-full sm:ml-auto sm:w-auto" disabled={busy || loading || !movements.length} onClick={() => void generate()}>
              <Download size={15} />
              {busy ? 'Generando…' : `Descargar ${FORMAT_INFO[prefs.format].label}`}
            </Button>
          </div>
          <p className="text-xs text-ink-faint">{FORMAT_INFO[prefs.format].blurb} Se genera en tu dispositivo, sin conexión.</p>

          {usesCategories && roots.length > 0 && (
            <Field label="Categorías" group hint={ids.some((id) => !reportInfo(id).categories) ? 'Objetivos y Laboratorio miran siempre todo.' : undefined}>
              <div className="flex flex-wrap gap-1.5">
                <Chip active={!categoryIds.length} onClick={() => prefs.set({ categoryIds: [] })}>
                  Todas
                </Chip>
                {roots.map((c) => (
                  <Chip key={c.id} active={categoryIds.includes(c.id)} color={c.color} onClick={() => toggleCategory(c.id)}>
                    {c.name}
                  </Chip>
                ))}
              </div>
            </Field>
          )}
          {usesKinds && (
            <Field label="Movimientos del listado" group>
              <div className="flex flex-wrap gap-1.5">
                {(['expense', 'income', 'transfer'] as Kind[]).map((k) => (
                  <Chip key={k} active={prefs.kinds.includes(k)} onClick={() => toggleKind(k)}>
                    {KIND_LABEL[k]}
                  </Chip>
                ))}
              </div>
            </Field>
          )}
        </Card>

        <div className={clsx('transition-opacity', stale && 'opacity-60')}>
          {loading ? null : !movements.length ? (
            <Card className="px-6 py-14 text-center text-sm text-ink-muted">Importa o apunta movimientos y aquí podrás sacar informes de ellos.</Card>
          ) : (
            <ReportPreview docs={built.docs} currency={settings.currency} locale={settings.locale} />
          )}
        </div>
      </div>
    </div>
  )
}

function ReportItem({ active, icon: Icon, title, blurb, onClick }: { active: boolean; icon: LucideIcon; title: string; blurb: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition',
        active ? 'bg-accent/12 ring-1 ring-accent/40' : 'hover:bg-surface-2',
      )}
    >
      <Icon size={17} className={clsx('mt-0.5 shrink-0', active ? 'text-accent-2' : 'text-ink-faint')} />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="block text-xs text-ink-muted">{blurb}</span>
      </span>
    </button>
  )
}

function Chip({ active, color, onClick, children }: { active: boolean; color?: string; onClick: () => void; children: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition',
        active ? 'border-accent-2 bg-accent-2/10 text-ink' : 'border-line text-ink-muted hover:text-ink',
      )}
    >
      {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
      {children}
    </button>
  )
}
