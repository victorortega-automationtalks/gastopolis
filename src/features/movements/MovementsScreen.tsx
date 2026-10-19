import { useVirtualizer } from '@tanstack/react-virtual'
import clsx from 'clsx'
import { ArrowDown, ArrowUp, Trash2, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useCategories, useCategoryMap, useFilteredMovements, useSettings } from '../../data/hooks'
import { deleteMovements, recategorize, restoreMovements } from '../../data/repo'
import { totals } from '../../model/aggregate'
import { fmtDate, savingsPhrase } from '../../model/format'
import type { Movement } from '../../model/types'
import { useUI } from '../../store/ui'
import { Button, Card, CategoryChip, Money, Stat } from '../../ui/components/primitives'
import { offerRule } from '../categories/offerRule'
import { categoryLabel } from '../categories/tree'
import { Welcome } from '../onboarding/Welcome'

type SortKey = 'date' | 'concept' | 'category' | 'amount'

export function MovementsScreen() {
  const { all, filtered } = useFilteredMovements()
  const categories = useCategories()
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
      date: (a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt,
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

      {selected.size > 0 && (
        <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-accent/40 bg-surface-solid px-3 py-2 shadow-lg">
          <button onClick={() => setSelected(new Set())} className="rounded p-1 text-ink-muted hover:text-ink" aria-label="Quitar selección">
            <X size={16} />
          </button>
          <span className="text-sm">
            {selected.size} seleccionados · <Money value={selTotal} kind="auto" />
          </span>
          <select className="field ml-auto h-8 w-56 py-0 text-xs" value="" onChange={(e) => e.target.value && void bulkRecategorize(e.target.value)}>
            <option value="">Mover a categoría…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {categoryLabel(c, categories)}
              </option>
            ))}
          </select>
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
                <span className="num text-xs text-ink-muted">{fmtDate(m.date)}</span>
                <span className="min-w-0">
                  <span className="block truncate">{m.concept}</span>
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
