import clsx from 'clsx'
import { ArrowUpLeft, ChevronRight, LogIn, Pencil } from 'lucide-react'
import { useMemo } from 'react'
import { useCategoryMap, useSettings } from '../../data/hooks'
import { withAlpha } from '../../lib/color'
import { ColumnChart } from '../../ui/charts/Charts'
import { fmtDate, fmtMoney, fmtMonth, fmtPercent } from '../../model/format'
import { movementsOf, type CityNode } from '../../model/hierarchy'
import { monthKey } from '../../model/period'
import { useUI } from '../../store/ui'
import { Button, CategoryChip, Money } from '../../ui/components/primitives'

const TYPE_LABEL: Record<CityNode['type'], string> = {
  root: 'Todo',
  category: 'Categoría',
  month: 'Mes',
  concept: 'Concepto',
  movement: 'Movimiento',
}

/** Meses consecutivos entre el primero y el último, con ceros en los huecos. */
function monthlySeries(node: CityNode) {
  const sums = new Map<string, number>()
  for (const m of movementsOf(node)) sums.set(monthKey(m.date), (sums.get(monthKey(m.date)) ?? 0) + Math.abs(m.amount))
  const keys = [...sums.keys()].sort()
  if (!keys.length) return []
  const out: { month: string; value: number }[] = []
  let [y, mo] = keys[0].split('-').map(Number)
  const last = keys[keys.length - 1]
  for (let guard = 0; guard < 240; guard++) {
    const k = `${y}-${String(mo).padStart(2, '0')}`
    out.push({ month: k, value: sums.get(k) ?? 0 })
    if (k === last) break
    mo++
    if (mo > 12) [y, mo] = [y + 1, 1]
  }
  return out
}

export function CityPanel({
  node,
  parent,
  isView,
  hoveredId,
  onHover,
  onEnter,
  onUp,
  canGoUp,
}: {
  node: CityNode
  parent: CityNode | null
  isView: boolean
  hoveredId: string | null
  onHover: (id: string | null) => void
  onEnter: (n: CityNode) => void
  onUp: () => void
  canGoUp: boolean
}) {
  const settings = useSettings()
  const catMap = useCategoryMap()
  const editMovement = useUI((s) => s.editMovement)
  const series = useMemo(() => monthlySeries(node), [node])
  const recent = useMemo(
    () =>
      movementsOf(node)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 40),
    [node],
  )
  const children = node.children ?? []
  const maxChild = Math.max(1e-9, ...children.map((c) => c.value))
  const money = (v: number, compact = false) => fmtMoney(v, { currency: settings.currency, locale: settings.locale, compact })
  const months = series.length || 1
  const share = parent && parent.value > 0 ? node.value / parent.value : null

  if (node.movement) {
    const m = node.movement
    return (
      <div className="space-y-4 p-4">
        <Header node={node} />
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs text-ink-faint">Fecha</div>
            {fmtDate(m.date)}
          </div>
          <div>
            <div className="text-xs text-ink-faint">Importe</div>
            <Money value={m.amount} kind={m.kind} className="text-lg font-semibold" />
          </div>
        </div>
        <CategoryChip category={catMap.get(m.categoryId)} />
        {m.notes && <p className="text-sm text-ink-muted">{m.notes}</p>}
        <Button onClick={() => editMovement(m.id)}>
          <Pencil size={14} /> Editar movimiento
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-5 p-4">
      <Header node={node} />

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div className="col-span-2">
          <div className="text-[11px] tracking-wider text-ink-faint uppercase">Total</div>
          <div className="num text-2xl font-semibold">{money(node.value)}</div>
        </div>
        <div>
          <div className="text-[11px] tracking-wider text-ink-faint uppercase">Movimientos</div>
          <div className="num text-lg font-semibold">{node.count}</div>
        </div>
        <div>
          <div className="truncate text-[11px] tracking-wider text-ink-faint uppercase">{share != null ? `De ${parent!.label}` : 'Media al mes'}</div>
          <div className="num text-lg font-semibold">{share != null ? fmtPercent(share, settings.locale, 1) : money(node.value / months, true)}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {!isView && children.length > 0 && (
          <Button size="sm" variant="primary" onClick={() => onEnter(node)}>
            <LogIn size={14} /> Entrar
          </Button>
        )}
        {canGoUp && (
          <Button size="sm" onClick={onUp}>
            <ArrowUpLeft size={14} /> Subir
          </Button>
        )}
      </div>

      {series.length > 1 && (
        <section>
          <h3 className="mb-1 text-xs font-medium text-ink-muted">Por mes · media {money(node.value / months, true)}</h3>
          <ColumnChart
            labels={series.map((p) => fmtMonth(p.month).split(' ')[0])}
            series={[{ id: 'v', label: node.label, color: node.color, values: series.map((p) => p.value) }]}
            height={112}
            yAxis={false}
            format={(v) => money(v)}
            title={(i) => fmtMonth(series[i].month, true)}
            ariaLabel={`${node.label} por mes`}
          />
        </section>
      )}

      {children.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-medium text-ink-muted">
            Dentro · {children.length} {children.length === 1 ? 'bloque' : 'bloques'}
          </h3>
          <ul className="space-y-0.5">
            {children.slice(0, 60).map((c) => (
              <li key={c.id}>
                <button
                  onMouseEnter={() => onHover(c.id)}
                  onMouseLeave={() => onHover(null)}
                  // En la lista, un clic navega: entra en el bloque o abre el movimiento. Seleccionar es cosa de la escena.
                  onClick={() => (c.children?.length ? onEnter(c) : c.movement && editMovement(c.movement.id))}
                  className={clsx(
                    'group relative flex w-full items-center gap-2 overflow-hidden rounded-md px-2 py-1.5 text-left text-sm transition',
                    hoveredId === c.id ? 'bg-surface-2' : 'hover:bg-surface-2',
                  )}
                >
                  <span
                    className="absolute inset-y-0 left-0 rounded-md"
                    style={{ width: `${(c.value / maxChild) * 100}%`, background: withAlpha(c.color, 0.14) }}
                  />
                  <span className="relative h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: c.color }} />
                  <span className="relative min-w-0 flex-1 truncate">
                    {c.movement && <span className="num mr-1.5 text-xs text-ink-faint">{fmtDate(c.movement.date, false)}</span>}
                    {c.label}
                  </span>
                  <span className="num relative text-xs text-ink-muted">{money(c.value)}</span>
                  {c.children?.length ? <ChevronRight size={14} className="relative text-ink-faint" /> : null}
                </button>
              </li>
            ))}
          </ul>
          {children.length > 60 && <p className="mt-1 text-xs text-ink-faint">… y {children.length - 60} más</p>}
        </section>
      )}

      <section>
        <h3 className="mb-2 text-xs font-medium text-ink-muted">Últimos movimientos</h3>
        <ul className="divide-y divide-line">
          {recent.map((m) => (
            <li key={m.id}>
              <button onClick={() => editMovement(m.id)} className="flex w-full items-center gap-2 py-1.5 text-left text-sm hover:text-ink">
                <span className="num w-16 shrink-0 text-xs text-ink-faint">{fmtDate(m.date, false)}</span>
                <span className="min-w-0 flex-1 truncate text-ink-muted">{m.concept}</span>
                <Money value={m.amount} kind={m.kind} className="text-xs" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

/** En móvil la fila de la hoja inferior ya hace de cabecera. */
function Header({ node }: { node: CityNode }) {
  return (
    <div className="hidden items-start gap-3 lg:flex">
      <span className="mt-1 h-4 w-4 shrink-0 rounded" style={{ background: node.color, boxShadow: `0 0 18px -2px ${node.color}` }} />
      <div className="min-w-0">
        <div className="text-[11px] font-medium tracking-wider text-ink-faint uppercase">{TYPE_LABEL[node.type]}</div>
        <h2 className="truncate font-display text-xl leading-tight font-semibold">{node.label}</h2>
      </div>
    </div>
  )
}
