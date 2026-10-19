import clsx from 'clsx'
import { ChevronRight, FileSpreadsheet, TriangleAlert, Upload } from 'lucide-react'
import { useMemo, useRef, useState, type DragEvent } from 'react'
import { useCategories, useMovements, useRules } from '../../data/hooks'
import { applyImport } from '../../data/repo'
import { columnLetter, detectTables, headerOptions, ROLE_LABEL, ROLES, type DetectedTable, type Role } from '../../import/detect'
import { buildPlan, defaultTableConfig, type ImportPlan, type SignMode, type TableConfig } from '../../import/plan'
import type { SourceFile } from '../../import/read'
import { KIND_LABEL } from '../../model/defaults'
import { fmtDate } from '../../model/format'
import { KINDS, type Kind } from '../../model/types'
import { useUI } from '../../store/ui'
import { Button, Modal, Money, Segmented } from '../../ui/components/primitives'

export function ImportWizard() {
  const open = useUI((s) => s.importOpen)
  const openImport = useUI((s) => s.openImport)
  const toast = useUI((s) => s.toast)
  const navigate = useUI((s) => s.navigate)
  const { movements } = useMovements()
  const categories = useCategories()
  const rules = useRules()

  const [source, setSource] = useState<SourceFile | null>(null)
  const [tables, setTables] = useState<TableConfig[]>([])
  const [overrides, setOverrides] = useState<Record<string, Kind>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const close = () => {
    openImport(false)
    setSource(null)
    setTables([])
    setOverrides({})
    setError(null)
  }

  const load = async (file: File) => {
    setError(null)
    setBusy(true)
    try {
      const { readFile } = await import('../../import/read')
      const src = await readFile(file)
      setSource(src)
      setTables(src.sheets.flatMap(detectTables).map(defaultTableConfig))
    } catch (e) {
      setError(`No he podido leer "${file.name}": ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  // Se recalcula en cada cambio de mapeo: el usuario ve el efecto al momento.
  const plan = useMemo<ImportPlan | null>(
    () => (source ? buildPlan(source, tables, { movements, categories, rules }, overrides) : null),
    [source, tables, movements, categories, rules, overrides],
  )

  const commit = async () => {
    if (!plan) return
    setBusy(true)
    try {
      const r = await applyImport(plan)
      toast(`Importados ${r.movements} movimientos${r.categories ? ` y ${r.categories} categorías nuevas` : ''}`)
      close()
      navigate('inicio')
    } catch (e) {
      setError(`Falló la importación: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const updateTable = (id: string, patch: Partial<TableConfig>) => setTables((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)))

  const fresh = plan?.stats.fresh ?? 0
  const footer = source ? (
    <>
      <span className="mr-auto text-xs text-ink-muted">
        {plan && (
          <>
            <b className="text-ink">{fresh}</b> nuevos · {plan.stats.duplicates} ya estaban · {plan.stats.skipped} saltados · {plan.stats.newCategories}{' '}
            categorías nuevas{plan.stats.ruled > 0 && <> · {plan.stats.ruled} clasificados por tus reglas</>}
          </>
        )}
      </span>
      <Button variant="ghost" onClick={() => (setSource(null), setTables([]))}>
        Otro archivo
      </Button>
      <Button variant="primary" disabled={busy || fresh === 0} onClick={commit}>
        Importar {fresh} movimientos
      </Button>
    </>
  ) : undefined

  return (
    <Modal open={open} onClose={close} title={source ? `Importar · ${source.fileName}` : 'Importar movimientos'} wide footer={footer}>
      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}
      {!source ? (
        <DropZone onFile={load} busy={busy} />
      ) : (
        <div className="space-y-6">
          {tables.length === 0 && <ManualTable source={source} onCreate={(t) => setTables([t])} />}
          {tables.map((t) => (
            <TableCard key={t.id} source={source} table={t} plan={plan} onChange={(patch) => updateTable(t.id, patch)} />
          ))}
          {plan && plan.categories.some((c) => c.count > 0) && <CategoriesReview plan={plan} overrides={overrides} setOverrides={setOverrides} />}
          {plan && plan.skipped.length > 0 && (
            <details className="rounded-xl border border-line bg-surface p-4">
              <summary className="cursor-pointer text-sm font-medium">
                {plan.skipped.length} filas saltadas <span className="text-ink-muted">— no se importan</span>
              </summary>
              <ul className="mt-3 space-y-1 text-xs">
                {plan.skipped.slice(0, 200).map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="num w-28 shrink-0 text-ink-faint">
                      {s.sheet} · fila {s.rowNumber}
                    </span>
                    <span className="w-48 shrink-0 text-warn">{s.reason}</span>
                    <span className="truncate text-ink-muted">{s.preview}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </Modal>
  )
}

function DropZone({ onFile, busy }: { onFile: (f: File) => void; busy: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }
  return (
    <div
      onDragOver={(e) => (e.preventDefault(), setOver(true))}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      onClick={() => input.current?.click()}
      className={clsx(
        'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-16 text-center transition',
        over ? 'border-accent bg-accent/10' : 'border-line-strong hover:border-accent/60 hover:bg-surface',
      )}
    >
      <div className="rounded-2xl bg-gradient-to-br from-accent/30 to-accent-2/20 p-4">
        <FileSpreadsheet size={32} className="text-accent-2" />
      </div>
      <div className="font-display text-lg font-semibold">{busy ? 'Leyendo…' : 'Arrastra tu Excel o CSV'}</div>
      <p className="max-w-sm text-sm text-ink-muted">
        .xlsx, .xlsm, .xls o .csv. Detecto las tablas aunque estén una al lado de otra (gastos | ingresos) y no hace falta tocar el formato.
      </p>
      <Button variant="subtle" className="mt-2" onClick={(e) => (e.stopPropagation(), input.current?.click())}>
        <Upload size={15} /> Elegir archivo
      </Button>
      <p className="text-xs text-ink-faint">El archivo se lee en tu dispositivo; no sale de aquí.</p>
      <input
        ref={input}
        type="file"
        accept=".xlsx,.xlsm,.xls,.csv,.tsv,.txt"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}

function TableCard({
  source,
  table,
  plan,
  onChange,
}: {
  source: SourceFile
  table: TableConfig
  plan: ImportPlan | null
  onChange: (p: Partial<TableConfig>) => void
}) {
  const sheet = source.sheets.find((s) => s.name === table.sheet)!
  const options = headerOptions(sheet, table)
  const rows = plan?.rows.filter((r) => r.tableId === table.id) ?? []
  const catName = new Map(plan?.categories.map((c) => [c.sourceKey, c.name]))
  const missing = table.columns.date == null || table.columns.amount == null
  const setRole = (role: Role, col: number | undefined) => {
    const columns = { ...table.columns }
    if (col == null) delete columns[role]
    else columns[role] = col
    onChange({ columns })
  }
  return (
    <section className={clsx('rounded-xl border p-4 transition', table.include ? 'border-line-strong bg-surface' : 'border-line opacity-60')}>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={table.include} onChange={(e) => onChange({ include: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
          Hoja «{table.sheet}» · fila {table.headerRow + sheet.rowOffset + 1}
        </label>
        {table.label && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold tracking-wide">{table.label}</span>}
        <span className="text-xs text-ink-muted">{rows.length} filas válidas</span>
        <div className="ml-auto flex items-center gap-2 text-xs text-ink-muted">
          Signo
          <Segmented<SignMode>
            value={table.signMode}
            onChange={(signMode) => onChange({ signMode })}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'asis', label: 'Tal cual' },
              { value: 'invert', label: 'Invertir' },
            ]}
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {ROLES.map((role) => (
          <label key={role} className="block">
            <span className="mb-1 block text-[11px] font-medium text-ink-faint">{ROLE_LABEL[role]}</span>
            <select
              className={clsx('field h-8 py-0 text-xs', (role === 'date' || role === 'amount') && table.columns[role] == null && 'border-danger')}
              value={table.columns[role] ?? ''}
              onChange={(e) => setRole(role, e.target.value === '' ? undefined : Number(e.target.value))}
            >
              <option value="">—</option>
              {options.map((o) => (
                <option key={o.col} value={o.col}>
                  {columnLetter(o.col + sheet.colOffset)} · {o.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {missing && <p className="mt-2 text-xs text-danger">Necesito al menos la columna de fecha y la de importe.</p>}

      {rows.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs">
            <tbody>
              {rows.slice(0, 5).map((r, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="num py-1.5 pr-3 text-ink-faint">{r.rowNumber}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{fmtDate(r.date)}</td>
                  <td className="w-full py-1.5 pr-3">{r.concept}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap text-ink-muted">{catName.get(r.categorySourceKey)}</td>
                  <td className="py-1.5 text-right whitespace-nowrap">
                    <Money value={r.amount} kind="auto" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 5 && <p className="mt-1 text-xs text-ink-faint">… y {rows.length - 5} más</p>}
        </div>
      )}
    </section>
  )
}

function CategoriesReview({
  plan,
  overrides,
  setOverrides,
}: {
  plan: ImportPlan
  overrides: Record<string, Kind>
  setOverrides: (o: Record<string, Kind>) => void
}) {
  const cats = plan.categories.filter((c) => c.count > 0)
  return (
    <section className="rounded-xl border border-line-strong bg-surface p-4">
      <h3 className="font-display font-semibold">Categorías</h3>
      <p className="mt-1 text-xs text-ink-muted">
        Revisa el tipo. Lo que es mover dinero entre tus bolsillos (ahorro, cripto, inversión) es <b className="text-transfer">transferencia</b>: no cuenta como
        gasto ni como ingreso.
      </p>
      <div className="mt-3 grid gap-x-6 sm:grid-cols-2">
        {cats.map((c) => (
          <div key={c.sourceKey} className="flex items-center gap-2 border-t border-line py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">
              {c.name}
              {c.existingId ? (
                <span className="ml-2 text-[10px] text-ink-faint">existente</span>
              ) : (
                <span className="ml-2 text-[10px] text-accent-2">nueva</span>
              )}
            </span>
            <span className="num text-xs text-ink-faint">{c.count}</span>
            <Money value={c.total} kind="auto" className="w-24 text-right text-xs" />
            <select
              value={c.kind}
              onChange={(e) => setOverrides({ ...overrides, [c.sourceKey]: e.target.value as Kind })}
              className={clsx('field h-7 w-32 py-0 text-xs', c.kind !== c.sourceKind && 'border-transfer/60')}
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </section>
  )
}

/** Si no se detecta ninguna tabla, se elige hoja y fila de cabecera a mano y luego se mapean columnas. */
function ManualTable({ source, onCreate }: { source: SourceFile; onCreate: (t: TableConfig) => void }) {
  const [sheetName, setSheetName] = useState(source.sheets[0]?.name ?? '')
  const [row, setRow] = useState(1)
  const sheet = source.sheets.find((s) => s.name === sheetName)
  const create = () => {
    if (!sheet) return
    const headerRow = Math.max(0, row - 1 - sheet.rowOffset)
    const width = Math.max(1, ...sheet.rows.slice(headerRow, headerRow + 20).map((r) => r.length))
    const t: DetectedTable = {
      id: `${sheet.name}!${headerRow}:manual`,
      sheet: sheet.name,
      headerRow,
      firstCol: 0,
      lastCol: width - 1,
      label: null,
      kindHint: null,
      columns: {},
      bodyStart: headerRow + 1,
      bodyEnd: sheet.rows.length,
    }
    onCreate(defaultTableConfig(t))
  }
  return (
    <div className="rounded-xl border border-warn/40 bg-warn/5 p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-warn">
        <TriangleAlert size={16} /> No he reconocido ninguna tabla de movimientos.
      </p>
      <p className="mt-1 text-xs text-ink-muted">Indica dónde están las cabeceras y te dejo elegir qué columna es cada cosa.</p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <select className="field h-9 w-48" value={sheetName} onChange={(e) => setSheetName(e.target.value)}>
          {source.sheets.map((s) => (
            <option key={s.name}>{s.name}</option>
          ))}
        </select>
        <input type="number" min={1} className="field h-9 w-28" value={row} onChange={(e) => setRow(Number(e.target.value))} aria-label="Fila de cabecera" />
        <Button onClick={create}>
          Usar fila {row} <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  )
}
