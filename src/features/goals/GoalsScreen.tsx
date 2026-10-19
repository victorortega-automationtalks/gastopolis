import clsx from 'clsx'
import { Archive, ArchiveRestore, Check, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useCategories, useGoals, useMovements, useSettings } from '../../data/hooks'
import { addContribution, createCategory, createGoal, deleteGoal, removeContribution, updateGoal, type GoalInput } from '../../data/repo'
import { parseAmount } from '../../import/values'
import { CATEGORY_PALETTE, withAlpha } from '../../lib/color'
import { fmtDate, fmtMoney, fmtMonth, fmtPercent } from '../../model/format'
import { GOAL_STATUS_LABEL, goalProgress, suggestedEmergencyFund, type GoalProgress, type GoalStatus } from '../../model/goals'
import { dataAsOf } from '../../model/insights'
import { shiftDays, today } from '../../model/period'
import type { Goal } from '../../model/types'
import { useUI } from '../../store/ui'
import { Button, Card, Field, Modal } from '../../ui/components/primitives'
import { CategoryIcon } from '../../ui/icons'

const STATUS_TONE: Record<GoalStatus, string> = {
  done: 'bg-income/15 text-income',
  'on-track': 'bg-income/15 text-income',
  behind: 'bg-warn/15 text-warn',
  'no-deadline': 'bg-accent-2/15 text-accent-2',
  stalled: 'bg-surface-2 text-ink-muted',
  new: 'bg-accent/15 text-accent',
}

const GOAL_ICONS = ['House', 'Shield', 'Car', 'Plane', 'GraduationCap', 'Baby', 'Heart', 'Gift', 'Cpu', 'PiggyBank', 'TreePalm', 'Wrench']

interface Template {
  name: string
  icon: string
  target: (suggested: number) => number
  years: number | null
  hint: string
}

const TEMPLATES: Template[] = [
  { name: 'Entrada de la vivienda', icon: 'House', target: () => 40000, years: 4, hint: 'Normalmente el 20 % del precio más un 10 % de gastos' },
  { name: 'Colchón de emergencia', icon: 'Shield', target: (s) => s || 6000, years: 1, hint: '6 meses de tus gastos reales' },
  { name: 'Coche', icon: 'Car', target: () => 12000, years: 3, hint: 'Pagar al contado sale más barato que financiar' },
  { name: 'Viaje', icon: 'Plane', target: () => 2000, years: 1, hint: 'Ponle fecha y destino' },
]

type Editing = { goal?: Goal; template?: Template } | null

export function GoalsScreen() {
  const goals = useGoals()
  const { movements } = useMovements()
  const settings = useSettings()
  const [editing, setEditing] = useState<Editing>(null)
  const [contributing, setContributing] = useState<Goal | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const { asOf } = useMemo(() => dataAsOf(movements, today()), [movements])
  const suggested = useMemo(() => suggestedEmergencyFund(movements, asOf), [movements, asOf])
  const money = (v: number, compact = false) => fmtMoney(v, { currency: settings.currency, locale: settings.locale, compact })

  const progress = useMemo(() => new Map(goals.map((g) => [g.id, goalProgress(g, movements, asOf)])), [goals, movements, asOf])
  const active = goals.filter((g) => !g.archived).sort((a, b) => a.priority - b.priority)
  const archived = goals.filter((g) => g.archived)
  const totals = active.reduce(
    (acc, g) => {
      const p = progress.get(g.id)!
      return { saved: acc.saved + p.saved, target: acc.target + g.target, pace: acc.pace + p.monthlyPace }
    },
    { saved: 0, target: 0, pace: 0 },
  )

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      {active.length > 0 && (
        <Card className="flex flex-wrap items-center gap-x-8 gap-y-3 p-5">
          <div>
            <div className="text-sm text-ink-muted">Ahorrado para tus objetivos</div>
            <div className="text-3xl font-semibold">
              {money(totals.saved)} <span className="text-base font-normal text-ink-muted">de {money(totals.target)}</span>
            </div>
          </div>
          <div className="min-w-48 flex-1">
            <div className="h-2.5 overflow-hidden rounded-full bg-accent-2/15">
              <div className="h-full rounded-full bg-accent-2" style={{ width: `${Math.min(100, (totals.saved / Math.max(totals.target, 1)) * 100)}%` }} />
            </div>
          </div>
          <div className="text-sm text-ink-muted">
            Aportas <b className="text-ink">{money(totals.pace)}</b> al mes de media
          </div>
          <Button variant="primary" onClick={() => setEditing({})}>
            <Plus size={15} /> Nuevo objetivo
          </Button>
        </Card>
      )}

      {active.length === 0 && (
        <div className="py-6 text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight">¿Para qué ahorras?</h2>
          <p className="mx-auto mt-2 max-w-xl text-ink-muted">
            Ponle nombre, cantidad y fecha. Gastópolis cuenta lo que vas apartando y te dice si llegas a tiempo y cuánto te falta al mes.
          </p>
        </div>
      )}

      {active.length === 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TEMPLATES.map((t) => (
            <button
              key={t.name}
              onClick={() => setEditing({ template: t })}
              className="glass group rounded-2xl p-5 text-left transition hover:border-accent/50"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 text-accent-2">
                <CategoryIcon name={t.icon} size={20} />
              </span>
              <div className="mt-3 font-display font-semibold">{t.name}</div>
              <div className="mt-0.5 text-sm text-ink-muted">{money(t.target(suggested))}</div>
              <div className="mt-2 text-xs text-ink-faint">{t.hint}</div>
            </button>
          ))}
          <button
            onClick={() => setEditing({})}
            className="glass rounded-2xl border-dashed p-5 text-left text-ink-muted transition hover:text-ink sm:col-span-2 lg:col-span-4"
          >
            <Plus size={16} className="mr-1 inline" /> Otro objetivo
          </button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {active.map((g) => (
          <GoalCard
            key={g.id}
            goal={g}
            p={progress.get(g.id)!}
            asOf={asOf}
            money={money}
            locale={settings.locale}
            onEdit={() => setEditing({ goal: g })}
            onContribute={() => setContributing(g)}
          />
        ))}
      </div>

      {archived.length > 0 && (
        <div>
          <button onClick={() => setShowArchived(!showArchived)} className="text-sm text-ink-muted hover:text-ink">
            {showArchived ? 'Ocultar' : 'Ver'} {archived.length} archivados
          </button>
          {showArchived && (
            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              {archived.map((g) => (
                <GoalCard
                  key={g.id}
                  goal={g}
                  p={progress.get(g.id)!}
                  asOf={asOf}
                  money={money}
                  locale={settings.locale}
                  onEdit={() => setEditing({ goal: g })}
                  onContribute={() => setContributing(g)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {editing && <GoalForm editing={editing} suggested={suggested} onClose={() => setEditing(null)} />}
      {contributing && <ContributionForm goal={contributing} p={progress.get(contributing.id)!} money={money} onClose={() => setContributing(null)} />}
    </div>
  )
}

function Ring({ ratio, color, size = 112 }: { ratio: number; color: string; size?: number }) {
  const r = size / 2 - 8
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={withAlpha(color, 0.18)} strokeWidth={9} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={9}
        strokeLinecap="round"
        strokeDasharray={`${Math.min(1, ratio) * c} ${c}`}
        style={{ filter: `drop-shadow(0 0 6px ${withAlpha(color, 0.6)})`, transition: 'stroke-dasharray .6s' }}
      />
    </svg>
  )
}

function GoalCard({
  goal: g,
  p,
  asOf,
  money,
  locale,
  onEdit,
  onContribute,
}: {
  goal: Goal
  p: GoalProgress
  asOf: string
  money: (v: number, compact?: boolean) => string
  locale: string
  onEdit: () => void
  onContribute: () => void
}) {
  const toast = useUI((s) => s.toast)
  // Hito reciente (últimas dos semanas): se celebra.
  const recent = p.milestones.filter((m) => m.reachedAt && m.reachedAt >= shiftDays(asOf, 14)).pop()
  const maxH = Math.max(g.target, ...p.history.map((h) => h.saved), 1)
  return (
    <Card className={clsx('relative overflow-hidden p-5', g.archived && 'opacity-60')}>
      <div className="absolute -top-16 -right-16 h-48 w-48 rounded-full blur-3xl" style={{ background: withAlpha(g.color, 0.18) }} />
      <div className="relative flex gap-5">
        <div className="relative">
          <Ring ratio={p.ratio} color={g.color} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <CategoryIcon name={g.icon} size={20} className="chip-ink" />
            <span className="mt-0.5 text-lg font-semibold">{fmtPercent(Math.min(p.ratio, 9.99), locale)}</span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 truncate font-display text-lg font-semibold">{g.name}</h3>
            <span className={clsx('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium', STATUS_TONE[p.status])}>{GOAL_STATUS_LABEL[p.status]}</span>
          </div>
          <div className="mt-1 text-2xl font-semibold">
            {money(p.saved)} <span className="text-sm font-normal text-ink-muted">de {money(g.target)}</span>
          </div>
          <p className="mt-1.5 text-sm text-ink-muted">
            {p.status === 'done' ? (
              <>¡Conseguido! Puedes archivarlo o subir la meta.</>
            ) : p.monthlyPace > 0 ? (
              <>
                Faltan <b className="text-ink">{money(p.remaining)}</b>. A tu ritmo ({money(p.monthlyPace)}/mes) llegas en{' '}
                <b className="text-ink">{fmtMonth(p.eta!.slice(0, 7), true)}</b>
                {g.deadline && p.eta && <>{p.eta <= g.deadline ? ', a tiempo' : `, ${lateBy(g.deadline, p.eta)} tarde`}</>}.
              </>
            ) : p.status === 'new' ? (
              <>
                Faltan <b className="text-ink">{money(p.remaining)}</b>. En unas semanas de aportaciones sabré tu ritmo.
              </>
            ) : (
              <>
                Faltan <b className="text-ink">{money(p.remaining)}</b>. Aún no hay aportaciones recientes.
              </>
            )}
            {p.status !== 'done' && g.deadline && p.monthlyNeeded != null && (
              <>
                {' '}
                Para llegar en {fmtMonth(g.deadline.slice(0, 7), true)} hacen falta <b className="text-ink">{money(p.monthlyNeeded)}/mes</b>.
              </>
            )}
          </p>
        </div>
      </div>

      {/* Evolución: área de lo ahorrado contra la línea de la meta. */}
      {p.history.length > 1 && (
        <svg
          viewBox={`0 0 ${p.history.length - 1} 40`}
          preserveAspectRatio="none"
          className="relative mt-4 h-14 w-full"
          role="img"
          aria-label={`Evolución de ${g.name}`}
        >
          <line
            x1={0}
            x2={p.history.length - 1}
            y1={40 - (g.target / maxH) * 38}
            y2={40 - (g.target / maxH) * 38}
            stroke={g.color}
            strokeOpacity={0.5}
            strokeDasharray="0.6 0.6"
            strokeWidth={0.15}
          />
          <path
            d={`M0,40 ${p.history.map((h, i) => `L${i},${40 - (Math.max(h.saved, 0) / maxH) * 38}`).join(' ')} L${p.history.length - 1},40 Z`}
            fill={withAlpha(g.color, 0.22)}
          />
          <path
            d={p.history.map((h, i) => `${i ? 'L' : 'M'}${i},${40 - (Math.max(h.saved, 0) / maxH) * 38}`).join(' ')}
            fill="none"
            stroke={g.color}
            strokeWidth={0.25}
            vectorEffect="non-scaling-stroke"
            style={{ strokeWidth: 2 }}
          />
        </svg>
      )}

      <div className="relative mt-4 flex flex-wrap items-center gap-2">
        {p.milestones.map((m) => (
          <span
            key={m.pct}
            title={m.reachedAt ? `Alcanzado el ${fmtDate(m.reachedAt)}` : 'Pendiente'}
            className={clsx(
              'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]',
              m.reachedAt ? 'border-transparent text-ink' : 'border-line text-ink-faint',
            )}
            style={m.reachedAt ? { background: withAlpha(g.color, 0.2) } : undefined}
          >
            {m.reachedAt && <Check size={11} />}
            {m.pct} %
          </span>
        ))}
        {recent && (
          <span className="flex animate-pulse items-center gap-1 text-xs font-medium text-transfer">
            <Sparkles size={13} /> ¡{recent.pct} % alcanzado!
          </span>
        )}
        <span className="ml-auto flex gap-1.5">
          <Button size="sm" variant="primary" onClick={onContribute}>
            <Plus size={13} /> Aportar
          </Button>
          <Button size="sm" variant="ghost" onClick={onEdit} aria-label="Editar">
            <Pencil size={13} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              await updateGoal(g.id, { archived: !g.archived })
              toast(g.archived ? 'Objetivo recuperado' : 'Objetivo archivado')
            }}
            aria-label={g.archived ? 'Recuperar' : 'Archivar'}
          >
            {g.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
          </Button>
        </span>
      </div>
      {g.linkedCategoryIds.length === 0 && g.contributions.length === 0 && (
        <p className="relative mt-3 text-xs text-ink-faint">Consejo: vincula una categoría de ahorro (Editar) y todo lo que apartes ahí contará solo.</p>
      )}
    </Card>
  )
}

/** «3 meses», «1 mes», «4 años»: por encima de dos años, en años. */
function lateBy(deadline: string, eta: string): string {
  const months = Math.max(1, (+eta.slice(0, 4) - +deadline.slice(0, 4)) * 12 + (+eta.slice(5, 7) - +deadline.slice(5, 7)))
  if (months >= 24) return `${Math.round(months / 12)} años`
  return months === 1 ? '1 mes' : `${months} meses`
}

function GoalForm({ editing, suggested, onClose }: { editing: NonNullable<Editing>; suggested: number; onClose: () => void }) {
  const categories = useCategories()
  const goals = useGoals()
  const { movements } = useMovements()
  const settings = useSettings()
  const toast = useUI((s) => s.toast)
  const g = editing.goal
  const t = editing.template
  const inYears = (y: number) => `${+today().slice(0, 4) + y}-12-31`
  const [name, setName] = useState(g?.name ?? t?.name ?? '')
  const [icon, setIcon] = useState(g?.icon ?? t?.icon ?? 'PiggyBank')
  const [color, setColor] = useState(g?.color ?? CATEGORY_PALETTE[goals.length % CATEGORY_PALETTE.length])
  const [target, setTarget] = useState(String(g?.target ?? (t ? t.target(suggested) : '')))
  const [deadline, setDeadline] = useState(g?.deadline ?? (t?.years ? inYears(t.years) : ''))
  const [initial, setInitial] = useState(String(g?.initial ?? 0))
  const [linked, setLinked] = useState<string[]>(g?.linkedCategoryIds ?? [])
  const [startDate, setStartDate] = useState(g?.startDate ?? today())
  const [error, setError] = useState<string | null>(null)
  const transfers = categories.filter((c) => c.kind === 'transfer')
  const ownerOf = (catId: string) => goals.find((x) => x.id !== g?.id && x.linkedCategoryIds.includes(catId))
  // Lo apartado en las categorías vinculadas antes de la fecha de inicio: se puede contar moviendo la fecha atrás.
  const before = useMemo(() => {
    const set = new Set(linked)
    let sum = 0
    let first = ''
    for (const m of movements) {
      if (!set.has(m.categoryId) || m.date >= startDate) continue
      sum -= m.amount
      if (!first || m.date < first) first = m.date
    }
    return { sum, first }
  }, [movements, linked, startDate])

  const save = async () => {
    const tgt = parseAmount(target)
    if (!name.trim()) return setError('Ponle un nombre')
    if (!tgt || tgt <= 0) return setError('La meta tiene que ser mayor que cero')
    const input: GoalInput = {
      name: name.trim(),
      icon,
      color,
      target: Math.abs(tgt),
      deadline: deadline || undefined,
      initial: Math.abs(parseAmount(initial) ?? 0),
      startDate: startDate || today(),
      linkedCategoryIds: linked,
    }
    if (g) await updateGoal(g.id, input)
    else await createGoal(input)
    toast(g ? 'Objetivo actualizado' : 'Objetivo creado')
    onClose()
  }

  const newSavingsCategory = async () => {
    const id = await createCategory({ name: `Ahorro ${name.trim() || 'objetivo'}`.slice(0, 40), kind: 'transfer', icon: 'PiggyBank' })
    setLinked((l) => [...l, id])
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={g ? 'Editar objetivo' : 'Nuevo objetivo'}
      footer={
        <>
          {g && (
            <Button
              variant="danger"
              className="mr-auto"
              onClick={async () => {
                await deleteGoal(g.id)
                toast('Objetivo borrado')
                onClose()
              }}
            >
              <Trash2 size={14} /> Borrar
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nombre">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Entrada de la vivienda" autoFocus />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {GOAL_ICONS.map((n) => (
            <button
              type="button"
              key={n}
              onClick={() => setIcon(n)}
              className={clsx('rounded-lg p-2 transition', n === icon ? 'bg-accent/20 ring-1 ring-accent/50' : 'hover:bg-surface-2')}
              aria-label={n}
            >
              <CategoryIcon name={n} size={18} />
            </button>
          ))}
          <span className="mx-1 w-px bg-line" />
          {CATEGORY_PALETTE.map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => setColor(c)}
              className={clsx('h-8 w-8 rounded-lg transition', c === color && 'ring-2 ring-ink ring-offset-2 ring-offset-surface-solid')}
              style={{ background: c }}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Meta">
            <input className="field num" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="40.000" />
          </Field>
          <Field label="Fecha límite (opcional)">
            <input type="date" className="field" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Field>
        </div>
        <Field label="Ya tengo ahorrado" hint="Lo que ya habías apartado para esto antes de empezar a contarlo aquí.">
          <input className="field num" inputMode="decimal" value={initial} onChange={(e) => setInitial(e.target.value)} />
        </Field>
        <Field
          group
          label="Categorías de ahorro que cuentan"
          hint="Lo que muevas a estas categorías de transferencia suma al objetivo (y lo que saques, resta). Cada categoría alimenta un solo objetivo."
        >
          <div className="space-y-1.5">
            {transfers.map((c) => {
              const owner = ownerOf(c.id)
              const on = linked.includes(c.id)
              return (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => setLinked((l) => (e.target.checked ? [...l, c.id] : l.filter((x) => x !== c.id)))}
                    className="accent-[var(--accent)]"
                  />
                  <CategoryIcon name={c.icon} size={14} className="text-ink-muted" />
                  {c.name}
                  {owner && !on && <span className="text-xs text-ink-faint">· ahora en «{owner.name}»</span>}
                </label>
              )
            })}
            <button type="button" onClick={newSavingsCategory} className="text-sm font-medium text-accent-2 hover:underline">
              + Crear categoría «Ahorro {name.trim() || 'objetivo'}»
            </button>
          </div>
        </Field>
        {linked.length > 0 && (
          <Field
            label="Contar lo apartado desde"
            hint={
              before.sum > 0 ? (
                <>
                  Antes de esa fecha ya hay {fmtMoney(before.sum, { currency: settings.currency, locale: settings.locale })} en estas categorías.{' '}
                  <button type="button" onClick={() => setStartDate(before.first)} className="font-medium text-accent-2 hover:underline">
                    Contarlo también
                  </button>
                </>
              ) : undefined
            }
          >
            <input type="date" className="field" value={startDate} max={today()} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  )
}

function ContributionForm({ goal, p, money, onClose }: { goal: Goal; p: GoalProgress; money: (v: number) => string; onClose: () => void }) {
  const toast = useUI((s) => s.toast)
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const save = async () => {
    const n = parseAmount(amount)
    if (!n) return
    await addContribution(goal.id, { amount: n, date, note: note.trim() || undefined })
    toast(n > 0 ? `+${money(n)} para «${goal.name}»` : 'Retirada apuntada')
    onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={`Aportar a «${goal.name}»`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
          <Button variant="primary" onClick={save} disabled={!parseAmount(amount)}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Importe" hint="En negativo si sacas dinero.">
            <input
              className="field num h-12 text-xl"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
              autoFocus
            />
          </Field>
          <Field label="Fecha">
            <input type="date" className="field h-12" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Nota">
          <input className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Paga extra, regalo…" />
        </Field>
        {p.entries.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-xs font-medium text-ink-muted">Historial</h3>
            <ul className="max-h-52 divide-y divide-line overflow-y-auto text-sm">
              {[...p.entries].reverse().map((e, i) => {
                const manual = e.source === 'manual' ? goal.contributions.find((c) => c.date === e.date && c.amount === e.amount) : undefined
                return (
                  <li key={i} className="flex items-center gap-2 py-1.5">
                    <span className="num w-20 shrink-0 text-xs text-ink-faint">{fmtDate(e.date)}</span>
                    <span className="min-w-0 flex-1 truncate text-ink-muted">{e.label}</span>
                    <span className={clsx('font-medium', e.amount < 0 && 'text-expense')}>{money(e.amount)}</span>
                    {manual ? (
                      <button
                        onClick={() => removeContribution(goal.id, manual.id)}
                        className="rounded p-1 text-ink-faint hover:text-danger"
                        aria-label="Quitar aportación"
                      >
                        <Trash2 size={13} />
                      </button>
                    ) : (
                      <span className="w-6" />
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  )
}
