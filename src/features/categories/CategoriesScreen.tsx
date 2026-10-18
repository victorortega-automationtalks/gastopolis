import clsx from 'clsx'
import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useCategories, useMovements, useRules, useSettings } from '../../data/hooks'
import { createCategory, deleteCategory, setCategoryKind, updateCategory } from '../../data/repo'
import { parseAmount } from '../../import/values'
import { SWATCHES } from '../../lib/color'
import { descendantIds } from '../../model/aggregate'
import { KIND_LABEL, KIND_LABEL_PLURAL } from '../../model/defaults'
import { fmtMoney } from '../../model/format'
import { KINDS, type Category, type Kind } from '../../model/types'
import { useUI } from '../../store/ui'
import { Button, Card, Field, Modal, Money, Segmented } from '../../ui/components/primitives'
import { CategoryIcon } from '../../ui/icons'
import { CATEGORY_ICONS } from '../../ui/iconRegistry'
import { RulesPanel } from './RulesPanel'
import { categoryLabel, flattenTree } from './tree'

interface CatStats {
  count: number
  total: number
  months: number
}

function CategoriesList() {
  const categories = useCategories()
  const { movements } = useMovements()
  const toast = useUI((s) => s.toast)
  const [kind, setKind] = useState<Kind>('expense')
  const [newName, setNewName] = useState('')
  const [deleting, setDeleting] = useState<Category | null>(null)

  const stats = useMemo(() => {
    const out = new Map<string, CatStats>()
    const months = new Map<string, Set<string>>()
    for (const m of movements) {
      const s = out.get(m.categoryId) ?? { count: 0, total: 0, months: 0 }
      s.count++
      s.total += m.amount
      out.set(m.categoryId, s)
      const ms = months.get(m.categoryId) ?? new Set()
      ms.add(m.date.slice(0, 7))
      months.set(m.categoryId, ms)
    }
    for (const [id, s] of out) s.months = months.get(id)?.size ?? 0
    return out
  }, [movements])

  const ofKind = useMemo(() => flattenTree(categories.filter((c) => c.kind === kind)), [categories, kind])
  const counts = useMemo(() => Object.fromEntries(KINDS.map((k) => [k, categories.filter((c) => c.kind === k).length])) as Record<Kind, number>, [categories])

  const add = async () => {
    if (!newName.trim()) return
    await createCategory({ name: newName, kind })
    setNewName('')
  }

  const run = async (fn: () => Promise<void>) => {
    try {
      await fn()
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented<Kind>
          value={kind}
          onChange={setKind}
          options={KINDS.map((k) => ({
            value: k,
            label: (
              <>
                {KIND_LABEL_PLURAL[k]} <span className="num ml-1 text-ink-faint">{counts[k]}</span>
              </>
            ),
          }))}
        />
        <form
          className="ml-auto flex w-full gap-2 sm:w-auto"
          onSubmit={(e) => {
            e.preventDefault()
            void add()
          }}
        >
          <input
            className="field h-9 sm:w-56"
            placeholder={`Nueva categoría de ${KIND_LABEL[kind].toLowerCase()}`}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Button type="submit" variant="primary" disabled={!newName.trim()}>
            <Plus size={15} /> Añadir
          </Button>
        </form>
      </div>

      {kind === 'transfer' && (
        <p className="text-sm text-ink-muted">
          Las transferencias son dinero que cambia de bolsillo (cuenta de ahorro, cripto, fondos). No cuentan como gasto ni como ingreso, pero sí en la Balanza
          y en tus objetivos.
        </p>
      )}

      <Card className="divide-y divide-line">
        {ofKind.length === 0 && <p className="px-5 py-10 text-center text-sm text-ink-muted">No hay categorías de este tipo todavía.</p>}
        {ofKind.map(({ category: c, depth }) => (
          <CategoryRow
            key={`${c.id}:${c.name}:${c.budgetMonthly ?? ''}`}
            category={c}
            depth={depth}
            all={categories}
            stats={stats.get(c.id)}
            onChange={(patch) => run(() => updateCategory(c.id, patch))}
            onKind={(k) => run(() => setCategoryKind(c.id, k))}
            onDelete={() => setDeleting(c)}
          />
        ))}
      </Card>

      {deleting && (
        <DeleteDialog
          category={deleting}
          all={categories}
          count={stats.get(deleting.id)?.count ?? 0}
          onClose={() => setDeleting(null)}
          onConfirm={(target) =>
            run(async () => {
              await deleteCategory(deleting.id, target)
              toast(target ? `«${deleting.name}» fusionada` : `«${deleting.name}» borrada`)
              setDeleting(null)
            })
          }
        />
      )}
    </div>
  )
}

function CategoryRow({
  category: c,
  depth,
  all,
  stats,
  onChange,
  onKind,
  onDelete,
}: {
  category: Category
  depth: number
  all: Category[]
  stats?: CatStats
  onChange: (patch: Partial<Category>) => void
  onKind: (k: Kind) => void
  onDelete: () => void
}) {
  const settings = useSettings()
  const [name, setName] = useState(c.name)
  const [budget, setBudget] = useState(c.budgetMonthly != null ? String(c.budgetMonthly) : '')

  const blocked = descendantIds([c.id], all)
  const parents = all.filter((p) => p.kind === c.kind && !blocked.has(p.id))
  const avg = stats && stats.months ? stats.total / stats.months : 0

  const saveBudget = () => {
    const n = budget.trim() ? parseAmount(budget) : null
    onChange({ budgetMonthly: n != null && n !== 0 ? Math.abs(n) : undefined })
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3" style={{ paddingLeft: `${1 + depth * 1.5}rem` }}>
      <div className="flex items-center gap-1">
        <Popover
          trigger={<span className="block h-7 w-7 rounded-lg ring-1 ring-white/10" style={{ background: c.color, boxShadow: `0 0 16px -4px ${c.color}` }} />}
          label="Color"
        >
          {(close) => (
            <div className="w-56">
              <div className="grid grid-cols-6 gap-1.5">
                {SWATCHES.map((s) => (
                  <button
                    key={s}
                    onClick={() => (onChange({ color: s }), close())}
                    className={clsx(
                      'h-7 w-7 rounded-md ring-offset-2 ring-offset-surface-solid transition hover:scale-110',
                      s === c.color && 'ring-2 ring-white',
                    )}
                    style={{ background: s }}
                    aria-label={s}
                  />
                ))}
              </div>
              <input
                type="color"
                value={c.color}
                onChange={(e) => onChange({ color: e.target.value })}
                className="mt-2 h-8 w-full cursor-pointer rounded bg-transparent"
              />
            </div>
          )}
        </Popover>
        <Popover trigger={<CategoryIcon name={c.icon} size={18} className="text-ink-muted" />} label="Icono">
          {(close) => (
            <div className="grid w-72 grid-cols-8 gap-1">
              {Object.keys(CATEGORY_ICONS).map((n) => (
                <button
                  key={n}
                  onClick={() => (onChange({ icon: n }), close())}
                  className={clsx('rounded-md p-1.5 hover:bg-surface-2', n === c.icon && 'bg-accent/20 ring-1 ring-accent/50')}
                  title={n}
                >
                  <CategoryIcon name={n} size={18} />
                </button>
              ))}
            </div>
          )}
        </Popover>
      </div>

      <input
        className="min-w-32 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-medium outline-none hover:border-line focus:border-accent"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== c.name && onChange({ name: name.trim() })}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        aria-label="Nombre"
      />

      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <span className="w-36 text-right text-xs whitespace-nowrap text-ink-muted">
          <span className="num">{stats?.count ?? 0}</span> mov. · <Money value={stats?.total ?? 0} compact />
        </span>
        <span className="hidden w-24 text-right text-xs whitespace-nowrap text-ink-faint lg:inline" title="Media por mes con movimientos">
          {avg ? `${fmtMoney(avg, { currency: settings.currency, locale: settings.locale, compact: true })}/mes` : ''}
        </span>
        <select
          className="field h-8 w-36 py-0 text-xs"
          value={c.parentId ?? ''}
          onChange={(e) => onChange({ parentId: e.target.value || null })}
          aria-label="Categoría padre"
          title="Agrupar dentro de otra categoría"
        >
          <option value="">Sin grupo</option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>
              {categoryLabel(p, all)}
            </option>
          ))}
        </select>
        {c.kind === 'expense' && (
          <input
            className="field num h-8 w-24 py-0 text-xs"
            title="Presupuesto mensual"
            placeholder="€/mes"
            inputMode="decimal"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            onBlur={saveBudget}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            aria-label="Presupuesto mensual"
          />
        )}
        <select className="field h-8 w-32 py-0 text-xs" value={c.kind} onChange={(e) => onKind(e.target.value as Kind)} aria-label="Tipo">
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <button onClick={onDelete} className="rounded-md p-1.5 text-ink-faint hover:bg-danger/10 hover:text-danger" aria-label={`Borrar ${c.name}`}>
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  )
}

function Popover({ trigger, label, children }: { trigger: ReactNode; label: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [open])
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-surface-2" aria-label={label}>
        {trigger}
      </button>
      {open && (
        <div className="absolute top-10 left-0 z-40 rounded-xl border border-line-strong bg-surface-solid p-3 shadow-2xl">{children(() => setOpen(false))}</div>
      )}
    </div>
  )
}

function DeleteDialog({
  category,
  all,
  count,
  onClose,
  onConfirm,
}: {
  category: Category
  all: Category[]
  count: number
  onClose: () => void
  onConfirm: (target: string | null) => void
}) {
  const options = all.filter((c) => c.id !== category.id)
  const sameKind = options.filter((c) => c.kind === category.kind)
  const [target, setTarget] = useState(sameKind[0]?.id ?? options[0]?.id ?? '')
  return (
    <Modal
      open
      onClose={onClose}
      title={`Borrar «${category.name}»`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" disabled={count > 0 && !target} onClick={() => onConfirm(count > 0 ? target : null)}>
            {count > 0 ? 'Fusionar y borrar' : 'Borrar'}
          </Button>
        </>
      }
    >
      {count > 0 ? (
        <Field label={`Tiene ${count} movimientos. ¿A qué categoría los paso?`} hint="Si eliges una de otro tipo, el signo de los importes se ajusta.">
          <select className="field" value={target} onChange={(e) => setTarget(e.target.value)}>
            {[...sameKind, ...options.filter((c) => c.kind !== category.kind)].map((c) => (
              <option key={c.id} value={c.id}>
                {categoryLabel(c, all)} · {KIND_LABEL[c.kind]}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <p className="text-sm text-ink-muted">No tiene movimientos. Sus subcategorías, si las hay, suben un nivel.</p>
      )}
    </Modal>
  )
}

/** Categorías y, en otra pestaña, las reglas que clasifican solas. */
export function CategoriesScreen() {
  const [tab, setTab] = useState<'categories' | 'rules'>('categories')
  const rules = useRules()
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <Segmented<'categories' | 'rules'>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'categories', label: 'Categorías' },
          {
            value: 'rules',
            label: (
              <>
                Reglas <span className="num ml-1 text-ink-faint">{rules.length}</span>
              </>
            ),
          },
        ]}
        className="self-start"
      />
      {tab === 'categories' ? <CategoriesList /> : <RulesPanel />}
    </div>
  )
}
