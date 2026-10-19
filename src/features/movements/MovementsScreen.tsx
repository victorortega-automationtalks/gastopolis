import { shownDate } from '../../model/payday'
import { useVirtualizer } from '@tanstack/react-virtual'
import clsx from 'clsx'
import { ArrowDown, ArrowUp, FileSpreadsheet, Landmark, PenLine, Sparkles, Trash2, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useAccounts, useCategoryMap, useFilteredMovements, useSettings } from '../../data/hooks'
import { deleteMovements, recategorize, restoreMovements } from '../../data/repo'
import { totals } from '../../model/aggregate'
import { fmtDate, fmtMonth, savingsPhrase } from '../../model/format'
import { NEW_DAYS, NO_ACCOUNT, type Origin } from '../../model/period'
import type { Movement } from '../../model/types'
import { useUI } from '../../store/ui'
import { Button, Card, CategoryChip, Money, Stat } from '../../ui/components/primitives'
import { offerRule } from '../categories/offerRule'
import { CategorySelect } from '../categories/CategorySelect'
import { Welcome } from '../onboarding/Welcome'

type SortKey = 'date' | 'concept' | 'category' | 'amount'

export function MovementsScreen() {
  const { all, filtered } = useFilteredMovements()
  const catMap = useCategoryMap()
  const settings = useSettings()
  const editMovement = useUI((s) => s.editMovement)
  const resetFilters = useUI((s) => s.resetFilters)
  const toast = useUI((s) => s.toast)
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'date', dir: -1 })
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const rows = useMemo(() => {
    const name = (m: Movement) => catMap.get(m.categoryId)?.name ?? ''
    const cmp: Record<SortKey, (a: Movement, b: Movement) => number> = {
      date: (a, b) => shownDate(a).localeCompare(shownDate(b)) || a.createdAt - b.createdAt,
      concept: (a, b) => a.concept.localeCompare(b.concept, 'es'),
      category: (a, b) => name(a).localeCompare(name(b), 'es'),
      amount: (a, b) => a.amount - b.amount,
    }
    return [...filtered].sort((a, b) => cmp[sort.key](a, b) * sort.dir)
  }, [filtered, sort, catMap])

  const t = useMemo(() => totals(filtered), [filtered])
  const selectedRows = useMemo(() => filtered.filter((m) => selected.has(m.id)), [filtered, selected])
  const selTotal = selectedRows.reduce((a, m) => a + m.amount, 0)

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === 'date' || key === 'amount' ? -1 : 1 }))
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  if (all.length === 0) return <Welcome />

  const bulkRecategorize = async (categoryId: string) => {
    const kinds = new Set(selectedRows.map((m) => m.kind))
    const target = catMap.get(categoryId)
    await recategorize([...selected], categoryId)
    const message = `${selected.size} movimientos → ${target?.name}${target && (kinds.size > 1 || !kinds.has(target.kind)) ? ' (signo ajustado)' : ''}`
    // Si todos son el mismo concepto, ofrecer una regla para que los próximos lleguen ya clasificados.
    const concepts = new Set(selectedRows.map((m) => m.conceptKey))
    if (target && concepts.size === 1) offerRule(toast, selectedRows[0].concept, target.id, target.name, message)
    else toast(message)
    setSelected(new Set())
  }
  const bulkDelete = async () => {
    const backup = selectedRows
    await deleteMovements([...selected])
    setSelected(new Set())
    toast(`${backup.length} movimientos borrados`, 'info', { label: 'Deshacer', run: () => void restoreMovements(backup) })
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <Card className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-5 sm:p-5">
        <Stat label="Movimientos">
          <span className="num">{t.count.toLocaleString('es-ES')}</span>
        </Stat>
        <Stat label="Ingresos">
          <Money value={t.income} kind="income" />
        </Stat>
        <Stat label="Gastos">
          <Money value={-t.expense} kind="expense" />
        </Stat>
        <Stat label="Balance" sub={t.savingsRate != null ? savingsPhrase(t.savingsRate, settings.locale) : undefined}>
          <Money value={t.net} kind="auto" signed />
        </Stat>
        <Stat label="Transferencias" sub={t.transfer < 0 ? 'Apartado a ahorro/inversión' : t.transfer > 0 ? 'Retirado de ahorro' : undefined}>
          <Money value={t.transfer} kind="transfer" signed />
        </Stat>
      </Card>

      <AccountFilter />
      <OriginFilter all={all} />

      {selected.size > 0 && (
        <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-accent/40 bg-surface-solid px-3 py-2 shadow-lg">
          <button onClick={() => setSelected(new Set())} className="rounded p-1 text-ink-muted hover:text-ink" aria-label="Quitar selección">
            <X size={16} />
          </button>
          <span className="text-sm">
            {selected.size} seleccionados · <Money value={selTotal} kind="auto" />
          </span>
          <CategorySelect
            className="ml-auto w-56"
            value=""
            onChange={(id) => void bulkRecategorize(id)}
            placeholder="Mover a categoría…"
            aria-label="Mover a categoría"
          />
          <Button size="sm" variant="danger" onClick={bulkDelete}>
            <Trash2 size={14} /> Borrar
          </Button>
        </div>
      )}

      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <p className="text-ink-muted">Ningún movimiento coincide con los filtros.</p>
          <Button onClick={resetFilters}>Quitar filtros</Button>
        </Card>
      ) : (
        <MovementTable rows={rows} sort={sort} onSort={toggleSort} selected={selected} onToggle={toggle} onOpen={(id) => editMovement(id)} />
      )}
    </div>
  )
}

function MovementTable({
  rows,
  sort,
  onSort,
  selected,
  onToggle,
  onOpen,
}: {
  rows: Movement[]
  sort: { key: SortKey; dir: 1 | -1 }
  onSort: (k: SortKey) => void
  selected: Set<string>
  onToggle: (id: string) => void
  onOpen: (id: string) => void
}) {
  const catMap = useCategoryMap()
  const parent = useRef<HTMLDivElement>(null)
  const [freshSince] = useState(() => Date.now() - NEW_DAYS * 86_400_000)
  const v = useVirtualizer({ count: rows.length, getScrollElement: () => parent.current, estimateSize: () => 52, overscan: 12 })

  const Head = ({ k, children, className }: { k: SortKey; children: string; className?: string }) => (
    <button
      onClick={() => onSort(k)}
      className={clsx(
        'flex items-center gap-1 text-[11px] font-medium tracking-wider uppercase hover:text-ink',
        className,
        sort.key === k ? 'text-ink' : 'text-ink-faint',
      )}
    >
      {children}
      {sort.key === k && (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
    </button>
  )

  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-[2rem_6.5rem_1fr_auto] items-center gap-3 border-b border-line px-3 py-2.5 sm:grid-cols-[2rem_6.5rem_1fr_13rem_8rem]">
        <span />
        <Head k="date">Fecha</Head>
        <Head k="concept">Concepto</Head>
        <Head k="category" className="hidden sm:flex">
          Categoría
        </Head>
        <Head k="amount" className="justify-end">
          Importe
        </Head>
      </div>
      <div ref={parent} className="h-[calc(100dvh-22rem)] min-h-80 overflow-y-auto">
        <div style={{ height: v.getTotalSize(), position: 'relative' }}>
          {v.getVirtualItems().map((item) => {
            const m = rows[item.index]
            const cat = catMap.get(m.categoryId)
            const isSel = selected.has(m.id)
            return (
              <div
                key={m.id}
                onClick={() => onOpen(m.id)}
                className={clsx(
                  'absolute inset-x-0 grid cursor-pointer grid-cols-[2rem_6.5rem_1fr_auto] items-center gap-3 border-b border-line/60 px-3 text-sm transition hover:bg-surface-2 sm:grid-cols-[2rem_6.5rem_1fr_13rem_8rem]',
                  isSel && 'bg-accent/10',
                )}
                style={{ top: item.start, height: item.size }}
              >
                <input
                  type="checkbox"
                  checked={isSel}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => onToggle(m.id)}
                  className="h-4 w-4 accent-[var(--accent)]"
                  aria-label={`Seleccionar ${m.concept}`}
                />
                <span className="num text-xs text-ink-muted">{fmtDate(shownDate(m))}</span>
                {m.realDate && (
                  <span className="block text-[10px] text-accent-2" title="Nómina inteligente: este cobro paga el mes siguiente">
                    cuenta en {fmtMonth(m.date.slice(0, 7)).split(' ')[0]}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <OriginIcon m={m} />
                    <span className="truncate">{m.concept}</span>
                    {m.source === 'bank' && m.createdAt >= freshSince && (
                      <span className="shrink-0 rounded-full bg-accent-2/15 px-1.5 text-[10px] font-semibold text-accent-2 uppercase">nuevo</span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-ink-faint sm:hidden">{cat?.name}</span>
                  {m.notes && <span className="hidden truncate text-xs text-ink-faint sm:block">{m.notes}</span>}
                </span>
                <span className="hidden min-w-0 sm:block">
                  <CategoryChip category={cat} />
                </span>
                <Money value={m.amount} kind={m.kind} signed={m.kind !== 'expense'} className="text-right" />
              </div>
            )
          })}
        </div>
      </div>
    </Card>
  )
}

const ORIGIN_ICON = { bank: Landmark, manual: PenLine, import: FileSpreadsheet, sample: FileSpreadsheet } as const
const ORIGIN_TITLE = { bank: 'Del banco', manual: 'Apuntado a mano', import: 'Importado', sample: 'Ejemplo' } as const

/** De dónde viene cada movimiento, de un vistazo: banco, a mano o importado. */
function OriginIcon({ m }: { m: Movement }) {
  const Icon = ORIGIN_ICON[m.source]
  return (
    <span title={ORIGIN_TITLE[m.source]} className="shrink-0 text-ink-faint">
      <Icon size={13} />
    </span>
  )
}

/** Filtro por origen: lo nuevo que ha traído el banco, lo del banco, lo apuntado a mano o lo importado. */
function OriginFilter({ all }: { all: Movement[] }) {
  const origin = useUI((s) => s.filters.origin) ?? 'all'
  const setFilters = useUI((s) => s.setFilters)
  const [since] = useState(() => Date.now() - NEW_DAYS * 86_400_000)
  const counts = useMemo(() => {
    const c = { bank: 0, manual: 0, import: 0, new: 0 }
    for (const m of all) {
      if (m.source === 'bank') {
        c.bank++
        if (m.createdAt >= since) c.new++
      } else if (m.source === 'manual') c.manual++
      else c.import++
    }
    return c
  }, [all, since])
  if (!counts.bank && !counts.manual) return null
  const chip = (value: Origin, label: string, n?: number, Icon?: typeof Landmark) => (
    <button
      key={value}
      onClick={() => setFilters({ origin: value })}
      aria-pressed={origin === value}
      className={clsx(
        'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition',
        origin === value ? 'border-accent-2 bg-accent-2/10 text-ink' : 'border-line text-ink-muted hover:text-ink',
      )}
    >
      {Icon && <Icon size={12} />}
      {label}
      {n !== undefined && <span className="num text-ink-faint">{n}</span>}
    </button>
  )
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar por origen">
      <span className="mr-1 text-xs text-ink-faint">Origen</span>
      {chip('all', 'Todo')}
      {counts.new > 0 && chip('new', 'Nuevo del banco', counts.new, Sparkles)}
      {counts.bank > 0 && chip('bank', 'Banco', counts.bank, Landmark)}
      {counts.manual > 0 && chip('manual', 'A mano', counts.manual, PenLine)}
      {counts.import > 0 && chip('import', 'Importado', counts.import, FileSpreadsheet)}
    </div>
  )
}

/** Filtro por cuenta (si hay cuentas): todas, una o varias, o las que no tienen cuenta. */
function AccountFilter() {
  const accounts = useAccounts()
  const ids = useUI((s) => s.filters.accountIds) ?? []
  const setFilters = useUI((s) => s.setFilters)
  if (!accounts.length) return null
  const toggle = (id: string) => setFilters({ accountIds: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] })
  const chip = (id: string | null, label: string, color?: string) => {
    const on = id === null ? !ids.length : ids.includes(id)
    return (
      <button
        key={id ?? 'todas'}
        onClick={() => (id === null ? setFilters({ accountIds: [] }) : toggle(id))}
        aria-pressed={on}
        className={clsx(
          'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition',
          on ? 'border-accent-2 bg-accent-2/10 text-ink' : 'border-line text-ink-muted hover:text-ink',
        )}
      >
        {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
        {label}
      </button>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar por cuenta">
      <span className="mr-1 text-xs text-ink-faint">Cuenta</span>
      {chip(null, 'Todas')}
      {accounts.filter((a) => !a.archived).map((a) => chip(a.id, a.name, a.color))}
      {chip(NO_ACCOUNT, 'Sin cuenta')}
    </div>
  )
}
