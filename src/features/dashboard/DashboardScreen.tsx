import clsx from 'clsx'
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Gamepad2,
  Eye,
  EyeOff,
  Flame,
  RotateCcw,
  SlidersHorizontal,
  TriangleAlert,
  Upload,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react'
import { useCategories, useCategoryMap, useGoals, useMovements, useSettings, useUnclassifiedCount } from '../../data/hooks'
import { withAlpha } from '../../lib/color'
import { totals } from '../../model/aggregate'
import { fmtDate, fmtMoney, fmtMonth, fmtPercent } from '../../model/format'
import { buildHierarchy } from '../../model/hierarchy'
import { GOAL_STATUS_LABEL, goalProgress } from '../../model/goals'
import { budgetStatus, dataAsOf, monthEndOf, monthProjection, noSpendStreak, usualPace } from '../../model/insights'
import { LEAK_ICON } from '../../model/leaks'
import { monthKey, today } from '../../model/period'
import { CADENCE_LABEL, detectRecurring, upcomingCharges } from '../../model/recurring'
import { addMonths, monthlyByCategory, monthlyTotals, monthRange, monthsOf } from '../../model/series'
import type { Movement } from '../../model/types'
import { layoutCity } from '../../scenes/city/layout'
import { useSceneColors } from '../../scenes/common'
import { useUI } from '../../store/ui'
import { ColumnChart } from '../../ui/charts/Charts'
import { Button, Card } from '../../ui/components/primitives'
import { CategoryIcon } from '../../ui/icons'
import { useOpenInCity } from '../city/openInCity'
import { useLeaks } from '../leaks/useLeaks'
import { moneyFlow } from '../../model/flow'
import { RiverChart } from '../river/RiverChart'
import { Welcome } from '../onboarding/Welcome'
import { BankAlerts } from '../accounts/BankAlerts'
import { BackupReminder } from '../settings/backup'
import { CARD_LABEL, useDashboard, type CardId } from './store'
import { Delta, Meter, Sparkline } from './viz'

const MiniCity = lazy(() => import('../../scenes/city/MiniCity').then((m) => ({ default: m.MiniCity })))

/** Todo lo que necesitan las tarjetas, calculado una vez por mes elegido. */
function useDashboardData(movements: Movement[], month: string, asOf: string) {
  const categories = useCategories()
  return useMemo(() => {
    const inMonth = (k: string) => (m: Movement) => monthKey(m.date) === k
    const cur = movements.filter(inMonth(month))
    // Referencia dentro del mes: hoy si es el mes en curso, si no su último día.
    const ref = month === monthKey(asOf) ? asOf : monthEndOf(month)
    const inProgress = ref < monthEndOf(month)
    const day = +ref.slice(8, 10)
    const prevKey = addMonths(month, -1)
    // Un mes a medias se compara con el anterior hasta el mismo día: si no, la nómina que aún no ha llegado parece una caída.
    const prev = movements.filter((m) => inMonth(prevKey)(m) && (!inProgress || +m.date.slice(8, 10) <= day))
    const t = totals(cur)
    const p = totals(prev)
    const hasPrev = movements.some(inMonth(prevKey))
    const first = movements.reduce((min, m) => (m.date < min ? m.date : min), month + '-01')
    const window = monthRange([addMonths(month, -11), monthKey(first)].sort()[1], month)
    const flow = monthlyTotals(movements, window)
    const flow6 = monthlyTotals(movements, monthRange([addMonths(month, -5), monthKey(first)].sort()[1], month))
    const recurring = detectRecurring(
      movements.filter((m) => m.date <= ref),
      ref,
    )
    const top = monthlyByCategory(cur, categories, 'expense').rows.slice(0, 5)
    const yearStart = `${month.slice(0, 4)}-01`
    const ytd = totals(movements.filter((m) => monthKey(m.date) >= yearStart && monthKey(m.date) <= month))
    return {
      cur,
      t,
      p,
      hasPrev,
      inProgress,
      prevLabel: inProgress ? `vs mismo día de ${fmtMonth(prevKey).split(' ')[0]}` : 'vs mes anterior',
      flow,
      flow6,
      ref,
      pace: usualPace(movements, ref),
      ytd,
      top,
      projection: monthProjection(movements, ref),
      budgets: budgetStatus(movements, categories, ref),
      streak: noSpendStreak(movements, ref),
      recurring: recurring.filter((r) => r.active),
      upcoming: upcomingCharges(recurring, ref, 14),
      soon: inProgress ? upcomingCharges(recurring, ref, 7) : [],
      priceUps: recurring.filter((r) => r.active && r.priceChanges.some((c) => c.to > c.from)),
      cityLayout: layoutCity(
        buildHierarchy(
          cur.filter((m) => m.kind === 'expense'),
          categories,
          ['category', 'concept'],
          'Gastos',
        ),
        {
          depth: 2,
          heightBy: 'count',
          colorBy: 'category',
        },
      ),
    }
  }, [movements, month, asOf, categories])
}

export function DashboardScreen() {
  const { movements, loading } = useMovements()
  const settings = useSettings()
  const openImport = useUI((s) => s.openImport)
  const dash = useDashboard()
  const [editing, setEditing] = useState(false)
  const { asOf, stale } = useMemo(() => dataAsOf(movements, today()), [movements])
  const months = useMemo(() => monthsOf(movements), [movements])
  const [picked, setPicked] = useState<string | null>(null)
  const month = picked && months.includes(picked) ? picked : monthKey(asOf)
  const d = useDashboardData(movements, month, asOf)
  const goals = useGoals()
  const review = useReviewItems(d)
  const money = (v: number, o: { signed?: boolean; compact?: boolean } = {}) => fmtMoney(v, { currency: settings.currency, locale: settings.locale, ...o })

  if (loading) return null
  if (!movements.length) return <Welcome />

  const idx = months.indexOf(month)
  const cards: Record<CardId, ReactNode> = {
    hero: <HeroCard d={d} month={month} money={money} />,
    review: <ReviewCard items={review} />,
    city: <CityCard d={d} month={month} />,
    kpis: <KpiRow d={d} money={money} locale={settings.locale} />,
    flow: <FlowCard d={d} money={money} />,
    river: <RiverCard month={month} money={money} locale={settings.locale} />,
    top: <TopCard d={d} month={month} money={money} locale={settings.locale} />,
    budgets: <BudgetsCard d={d} money={money} />,
    upcoming: <UpcomingCard d={d} money={money} />,
    subscriptions: <SubscriptionsCard d={d} money={money} />,
    goals: <GoalsCard money={money} locale={settings.locale} asOf={asOf} />,
    leaks: <LeaksCard money={money} />,
    streak: <StreakCard d={d} money={money} />,
  }
  // Ancho de cada tarjeta en la rejilla de 12 columnas (escritorio).
  const span: Record<CardId, string> = {
    hero: 'lg:col-span-5',
    review: 'lg:col-span-5',
    city: 'lg:col-span-7',
    kpis: 'lg:col-span-12',
    flow: review.length ? 'lg:col-span-7' : 'lg:col-span-12',
    river: 'lg:col-span-12',
    top: 'lg:col-span-7',
    budgets: 'lg:col-span-4',
    upcoming: 'lg:col-span-4',
    subscriptions: 'lg:col-span-4',
    goals: 'lg:col-span-12',
    leaks: 'lg:col-span-5',
    streak: 'lg:col-span-12',
  }
  // Lo que no tiene nada que contar no ocupa sitio: sin avisos no hay «Para revisar», sin objetivos no hay tarjeta.
  const empty = (id: CardId) => (id === 'review' && review.length === 0) || (id === 'goals' && !goals.some((g) => !g.archived))
  const visible = dash.order.filter((id) => (editing || !dash.hidden.includes(id)) && (editing || !empty(id)))

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <BackupReminder />
      <BankAlerts />
      <div className="flex flex-wrap items-center gap-2">
        <div className="glass flex items-center rounded-xl p-0.5">
          <button
            onClick={() => setPicked(months[idx - 1])}
            disabled={idx <= 0}
            className="rounded-lg p-2 text-ink-muted hover:bg-surface-2 hover:text-ink disabled:opacity-30"
            aria-label="Mes anterior"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-36 px-2 text-center font-display font-semibold capitalize">{fmtMonth(month, true)}</span>
          <button
            onClick={() => setPicked(months[idx + 1])}
            disabled={idx < 0 || idx >= months.length - 1}
            className="rounded-lg p-2 text-ink-muted hover:bg-surface-2 hover:text-ink disabled:opacity-30"
            aria-label="Mes siguiente"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        {stale && (
          <div className="flex items-center gap-2 rounded-xl border border-warn/40 bg-warn/10 px-3 py-1.5 text-xs text-warn">
            <TriangleAlert size={14} />
            Tus datos llegan hasta el {fmtDate(asOf)}.
            <button onClick={() => openImport(true)} className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline">
              <Upload size={12} /> Importar lo nuevo
            </button>
          </div>
        )}
        <div className="ml-auto flex gap-2">
          {editing && (
            <Button size="sm" variant="ghost" onClick={dash.reset}>
              <RotateCcw size={13} /> Restablecer
            </Button>
          )}
          <Button size="sm" variant={editing ? 'primary' : 'ghost'} onClick={() => setEditing(!editing)} title="Elegir qué tarjetas ves">
            <SlidersHorizontal size={13} /> {editing ? 'Listo' : 'Personalizar'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {visible.map((id, i) => (
          <div key={id} className={clsx(span[id], 'relative min-w-0', editing && dash.hidden.includes(id) && 'opacity-40')}>
            {editing && (
              <div className="absolute -top-2 right-2 z-10 flex items-center gap-0.5 rounded-lg border border-line-strong bg-surface-solid p-0.5 shadow-lg">
                <span className="px-1.5 text-[11px] text-ink-muted">{CARD_LABEL[id]}</span>
                <button onClick={() => dash.move(id, -1)} disabled={i === 0} className="rounded p-1 hover:bg-surface-2 disabled:opacity-30" aria-label="Subir">
                  <ArrowUp size={13} />
                </button>
                <button
                  onClick={() => dash.move(id, 1)}
                  disabled={i === visible.length - 1}
                  className="rounded p-1 hover:bg-surface-2 disabled:opacity-30"
                  aria-label="Bajar"
                >
                  <ArrowDown size={13} />
                </button>
                <button
                  onClick={() => dash.toggle(id)}
                  className="rounded p-1 hover:bg-surface-2"
                  aria-label={dash.hidden.includes(id) ? 'Mostrar' : 'Ocultar'}
                >
                  {dash.hidden.includes(id) ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            )}
            {cards[id]}
          </div>
        ))}
      </div>
    </div>
  )
}

type Data = ReturnType<typeof useDashboardData>
type MoneyFn = (v: number, o?: { signed?: boolean; compact?: boolean }) => string

function CardHead({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-sm font-medium text-ink-muted">{title}</h2>
      {action}
    </div>
  )
}

/** Lo primero que se ve: cuánto llevas gastado y si es más o menos de lo normal, en una frase. */
function HeroCard({ d, month, money }: { d: Data; month: string; money: MoneyFn }) {
  const { spent, usual } = d.pace
  const diff = usual == null ? null : spent - usual
  const day = +d.ref.slice(8, 10)
  const days = +monthEndOf(month).slice(8, 10)
  const calm = diff != null && Math.abs(diff) < Math.max(5, (usual ?? 0) * 0.03)
  return (
    <Card className="flex h-full flex-col p-6">
      <div className="text-sm text-ink-muted">
        {d.inProgress ? (
          <>
            Llevas gastado este mes{' '}
            <span className="text-ink-faint">
              · día {day} de {days}
            </span>
          </>
        ) : (
          <>Gastaste en {fmtMonth(month, true)}</>
        )}
      </div>
      {/* Cifra principal: la única de este tamaño en la vista. */}
      <div className="mt-1 text-5xl font-semibold tracking-tight">{money(spent)}</div>
      {diff != null && (
        <div
          className={clsx(
            'mt-3 inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium',
            calm ? 'bg-surface-2 text-ink-muted' : diff < 0 ? 'bg-income/12 text-income' : 'bg-expense/12 text-expense',
          )}
        >
          {calm ? (
            <>Como sueles {d.inProgress ? 'a estas alturas' : 'al mes'}</>
          ) : (
            <>
              {diff < 0 ? <ArrowDown size={14} /> : <ArrowUp size={14} />}
              {money(Math.abs(diff))} {diff < 0 ? 'menos' : 'más'} de lo normal{d.inProgress ? ` a día ${day}` : ''}
            </>
          )}
        </div>
      )}
      <div className="min-h-5 flex-1" />
      <div className="grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
        <div>
          <div className="text-xs text-ink-muted">Ha entrado</div>
          <div className="font-semibold">{money(d.t.income)}</div>
        </div>
        <div>
          <div className="text-xs text-ink-muted">{d.t.net >= 0 ? (d.inProgress ? 'Te queda' : 'Ahorraste') : 'Te falta'}</div>
          <div className={clsx('font-semibold', d.t.net >= 0 ? 'text-income' : 'text-expense')}>{money(Math.abs(d.t.net))}</div>
        </div>
      </div>
      {d.inProgress && d.projection.daysLeft > 0 && (
        <div className="mt-3 text-xs text-ink-muted">
          A este ritmo cerrarás el mes en unos <b className="font-semibold text-ink">{money(d.projection.projected, { compact: true })}</b> de gasto.
        </div>
      )}
    </Card>
  )
}

interface ReviewItem {
  id: string
  icon: LucideIcon
  text: string
  detail?: string
  tone: 'warn' | 'info'
  onClick?: () => void
}

/** Avisos que piden hacer algo, uno por línea. Si no hay ninguno, la tarjeta no aparece. */
function useReviewItems(d: Data): ReviewItem[] {
  const unclassified = useUnclassifiedCount()
  const leaks = useLeaks()
  const navigate = useUI((s) => s.navigate)
  const settings = useSettings()
  const money = (v: number) => fmtMoney(v, { currency: settings.currency, locale: settings.locale })
  const items: ReviewItem[] = []
  if (unclassified > 0)
    items.push({
      id: 'sort',
      icon: Gamepad2,
      text: `${unclassified} ${unclassified === 1 ? 'movimiento' : 'movimientos'} sin clasificar`,
      detail: 'Clasifícalos jugando',
      tone: 'info',
      onClick: () => navigate('clasificar'),
    })
  const over = d.budgets.filter((b) => b.ratio >= 1)
  if (over.length)
    items.push({
      id: 'budgets',
      icon: TriangleAlert,
      text: over.length === 1 ? `Te has pasado del presupuesto de ${over[0].category.name}` : `Te has pasado en ${over.length} presupuestos`,
      tone: 'warn',
      onClick: () => navigate('categorias'),
    })
  if (d.soon.length) {
    const total = d.soon.reduce((a, r) => a + r.amount, 0)
    items.push({
      id: 'soon',
      icon: CalendarClock,
      text: `${money(total)} en cargos fijos esta semana`,
      detail: d.soon
        .slice(0, 3)
        .map((r) => `${r.label} (${+r.nextDate.slice(8, 10)})`)
        .join(', '),
      tone: 'info',
    })
  }
  for (const r of d.priceUps.slice(0, 1)) {
    const c = r.priceChanges[r.priceChanges.length - 1]
    items.push({
      id: `up-${r.conceptKey}`,
      icon: TriangleAlert,
      text: `${r.label} ha subido de precio`,
      detail: `${money(c.from)} → ${money(c.to)}`,
      tone: 'warn',
    })
  }
  if (leaks.open.length)
    items.push({
      id: 'leaks',
      icon: Wallet,
      text: `${leaks.open.length} ${leaks.open.length === 1 ? 'gasto' : 'gastos'} que podrías recortar`,
      detail: leaks.openYearly > 0 ? `hasta ${money(leaks.openYearly)} al año` : undefined,
      tone: 'info',
      onClick: () => navigate('fugas'),
    })
  return items
}

function ReviewCard({ items }: { items: ReviewItem[] }) {
  return (
    <Card className="h-full p-5">
      <CardHead title="Para revisar" />
      {items.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Check size={15} className="text-income" /> Nada pendiente.
        </p>
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {items.map((it) => {
            const Icon = it.icon
            const body = (
              <>
                <span
                  className={clsx(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                    it.tone === 'warn' ? 'bg-warn/12 text-warn' : 'bg-accent/12 text-accent-2',
                  )}
                >
                  <Icon size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{it.text}</span>
                  {it.detail && <span className="block truncate text-xs text-ink-muted">{it.detail}</span>}
                </span>
                {it.onClick && <ChevronRight size={15} className="shrink-0 text-ink-faint" />}
              </>
            )
            return (
              <li key={it.id}>
                {it.onClick ? (
                  <button onClick={it.onClick} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface-2">
                    {body}
                  </button>
                ) : (
                  <div className="flex items-center gap-3 px-2 py-2">{body}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function CityCard({ d, month }: { d: Data; month: string }) {
  const navigate = useUI((s) => s.navigate)
  const setFilters = useUI((s) => s.setFilters)
  const colors = useSceneColors()
  const open = () => {
    setFilters({ period: { preset: 'custom', from: `${month}-01`, to: monthEndOf(month) } })
    navigate('ciudad')
  }
  return (
    <Card className="group relative h-full min-h-72 overflow-hidden">
      {d.cityLayout.buildings.length > 0 ? (
        <Suspense fallback={null}>
          <div className="absolute inset-0">
            <MiniCity layout={d.cityLayout} colors={colors} />
          </div>
        </Suspense>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-muted">Sin gastos este mes</div>
      )}
      <button onClick={open} className="absolute inset-0 flex flex-col justify-between p-5 text-left" aria-label="Abrir la Ciudad de este mes">
        <div>
          <div className="text-sm font-medium text-white/80 drop-shadow">Tu ciudad en {fmtMonth(month, true)}</div>
          <div className="text-xs text-white/60 drop-shadow">Cada barrio es una categoría de gasto</div>
        </div>
        <span className="self-end rounded-lg border border-white/15 bg-black/50 px-3 py-1.5 text-xs font-medium text-white backdrop-blur transition group-hover:bg-black/70">
          Explorar la Ciudad →
        </span>
      </button>
    </Card>
  )
}

function KpiRow({ d, money, locale }: { d: Data; money: MoneyFn; locale: string }) {
  const rel = (a: number, b: number) => (d.hasPrev && b > 0 ? (a - b) / b : null)
  const rate = d.t.income > 0 ? d.t.net / d.t.income : null
  const prevRate = d.p.income > 0 ? d.p.net / d.p.income : null
  const flowIncome = d.flow.map((f) => f.income)
  const flowExpense = d.flow.map((f) => f.expense)
  const flowRate = d.flow.map((f) => (f.income > 0 ? Math.max(f.net / f.income, 0) : 0))
  const noPrev = d.hasPrev ? 'sin datos que comparar' : 'sin mes anterior'
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Kpi label="Ingresos" value={money(d.t.income)} trend={flowIncome}>
        <Delta value={rel(d.t.income, d.p.income)} goodWhenUp empty={d.t.income === 0 && d.inProgress ? 'aún no ha entrado nada' : noPrev}>
          {fmtPercent(Math.abs(rel(d.t.income, d.p.income) ?? 0), locale)} {d.prevLabel}
        </Delta>
      </Kpi>
      <Kpi label="Gastos" value={money(d.t.expense)} trend={flowExpense}>
        <Delta value={rel(d.t.expense, d.p.expense)} goodWhenUp={false} empty={noPrev}>
          {fmtPercent(Math.abs(rel(d.t.expense, d.p.expense) ?? 0), locale)} {d.prevLabel}
        </Delta>
      </Kpi>
      <Kpi label="Tasa de ahorro" value={rate == null ? '—' : fmtPercent(rate, locale)} trend={flowRate}>
        <Delta value={rate != null && prevRate != null && d.hasPrev ? rate - prevRate : null} goodWhenUp empty={rate == null ? 'sin ingresos todavía' : noPrev}>
          {rate != null && prevRate != null ? `${Math.abs(Math.round((rate - prevRate) * 100))} pp ${d.prevLabel}` : ''}
        </Delta>
      </Kpi>
      {d.inProgress ? (
        <Kpi label="Cierre de mes previsto" value={money(d.projection.projected)} trend={flowExpense}>
          <span className="text-xs text-ink-muted">
            Llevas {money(d.projection.spent)} · quedan {d.projection.daysLeft} días
          </span>
        </Kpi>
      ) : (
        <Kpi label="Gasto medio al día" value={money(d.t.expense / Math.max(1, +d.ref.slice(8, 10)))} trend={flowExpense}>
          <span className="text-xs text-ink-muted">{d.cur.filter((m) => m.kind === 'expense').length} gastos en el mes</span>
        </Kpi>
      )}
    </div>
  )
}

function Kpi({ label, value, trend, children }: { label: string; value: string; trend: number[]; children: ReactNode }) {
  return (
    <Card className="flex h-full flex-col p-4">
      <div className="text-sm text-ink-muted">{label}</div>
      <div className="mt-1 truncate text-2xl font-semibold">{value}</div>
      <div className="mt-0.5 min-h-4">{children}</div>
      <Sparkline values={trend} className="mt-auto pt-3" label={`${label}: últimos 12 meses`} />
    </Card>
  )
}

function FlowCard({ d, money }: { d: Data; money: MoneyFn }) {
  const colors = useSceneColors()
  return (
    <Card className="h-full p-5">
      <CardHead title="Últimos meses" />
      <ColumnChart
        labels={d.flow6.map((f) => fmtMonth(f.month).split(' ')[0])}
        series={[
          { id: 'income', label: 'Entra', color: colors.income, values: d.flow6.map((f) => f.income) },
          { id: 'expense', label: 'Sale', color: colors.expense, values: d.flow6.map((f) => f.expense) },
        ]}
        height={200}
        format={(v) => money(v, { compact: true })}
        title={(i) => fmtMonth(d.flow6[i].month, true)}
        ariaLabel="Lo que entra y lo que sale en los últimos meses"
      />
    </Card>
  )
}

function TopCard({ d, month, money, locale }: { d: Data; month: string; money: MoneyFn; locale: string }) {
  const openInCity = useOpenInCity()
  const max = Math.max(1e-9, ...d.top.map((r) => r.total))
  return (
    <Card className="h-full p-5">
      <CardHead title="En qué se va" />
      {d.top.length === 0 ? (
        <p className="text-sm text-ink-faint">Sin gastos este mes.</p>
      ) : (
        <ul className="space-y-3">
          {d.top.map((r) => (
            <li key={r.categoryId}>
              <button onClick={() => openInCity(r.categoryId, 'expense', month)} className="group w-full text-left">
                <div className="mb-1 flex items-center gap-2 text-sm">
                  <span
                    className="chip-ink flex h-6 w-6 items-center justify-center rounded-md"
                    style={{ '--c': r.color, background: withAlpha(r.color, 0.15) } as React.CSSProperties}
                  >
                    <CategoryIcon name={r.icon} size={13} />
                  </span>
                  <span className="min-w-0 flex-1 truncate group-hover:text-ink">{r.name}</span>
                  <span className="font-semibold">{money(r.total)}</span>
                  <span className="w-10 text-right text-xs text-ink-faint">{fmtPercent(r.total / Math.max(d.t.expense, 1e-9), locale)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full transition-[width] group-hover:brightness-125"
                    style={{ width: `${(r.total / max) * 100}%`, background: r.color }}
                  />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function BudgetsCard({ d, money }: { d: Data; money: MoneyFn }) {
  const navigate = useUI((s) => s.navigate)
  return (
    <Card className="h-full p-5">
      <CardHead title="Presupuestos del mes" />
      {d.budgets.length === 0 ? (
        <div className="text-sm text-ink-faint">
          Aún no tienes presupuestos.{' '}
          <button onClick={() => navigate('categorias')} className="font-medium text-accent-2 hover:underline">
            Ponlos en Categorías
          </button>
          .
        </div>
      ) : (
        <ul className="space-y-3.5">
          {d.budgets.slice(0, 6).map((b) => (
            <li key={b.category.id}>
              <div className="mb-1 flex items-center gap-2 text-sm">
                <CategoryIcon name={b.category.icon} size={14} className="text-ink-muted" />
                <span className="min-w-0 flex-1 truncate">{b.category.name}</span>
                <span className={clsx('font-semibold', b.ratio >= 1 && 'text-expense')}>{money(b.spent)}</span>
                <span className="text-xs text-ink-faint">/ {money(b.budget, { compact: true })}</span>
              </div>
              <Meter ratio={b.ratio} pace={b.pace} label={`Presupuesto de ${b.category.name}`} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function UpcomingCard({ d, money }: { d: Data; money: MoneyFn }) {
  const catMap = useCategoryMap()
  const total = d.upcoming.reduce((a, r) => a + r.amount, 0)
  return (
    <Card className="h-full p-5">
      <CardHead title="Próximos cargos · 14 días" action={d.upcoming.length > 0 && <span className="text-sm font-semibold">{money(total)}</span>} />
      {d.upcoming.length === 0 ? (
        <p className="text-sm text-ink-faint">Ningún cargo recurrente a la vista.</p>
      ) : (
        <ul className="space-y-2">
          {d.upcoming.slice(0, 7).map((r) => (
            <li key={r.conceptKey} className="flex items-center gap-3 text-sm">
              <span className="flex w-12 shrink-0 flex-col items-center rounded-lg bg-surface-2 py-1 leading-tight">
                <span className="text-[10px] text-ink-faint uppercase">{fmtDate(r.nextDate, false).split(' ')[1]}</span>
                <span className="font-semibold">{+r.nextDate.slice(8, 10)}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{r.label}</span>
                <span className="block text-xs text-ink-faint">
                  {catMap.get(r.categoryId)?.name} · {CADENCE_LABEL[r.cadence]}
                </span>
              </span>
              <span className="font-semibold">{money(r.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function SubscriptionsCard({ d, money }: { d: Data; money: MoneyFn }) {
  const yearly = d.recurring.reduce((a, r) => a + r.yearly, 0)
  return (
    <Card className="h-full p-5">
      <CardHead title="Suscripciones y recibos" action={<CalendarClock size={15} className="text-ink-faint" />} />
      <div className="text-3xl font-semibold">
        {money(yearly)}
        <span className="ml-1 text-sm font-normal text-ink-muted">al año</span>
      </div>
      <div className="mt-0.5 text-xs text-ink-muted">
        {d.recurring.length} cargos fijos activos · {money(yearly / 12)} al mes
      </div>
      {d.priceUps.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="text-xs font-medium text-warn">Han subido de precio</div>
          {d.priceUps.slice(0, 3).map((r) => {
            const c = r.priceChanges[r.priceChanges.length - 1]
            return (
              <div key={r.conceptKey} className="flex items-center gap-2 rounded-lg border border-warn/25 bg-warn/5 px-2.5 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{r.label}</span>
                <span className="text-xs text-ink-muted">
                  {money(c.from)} → <b className="text-ink">{money(c.to)}</b>
                </span>
              </div>
            )
          })}
        </div>
      )}
      <ul className="mt-4 space-y-1 text-sm">
        {d.recurring.slice(0, 4).map((r) => (
          <li key={r.conceptKey} className="flex justify-between gap-2 text-ink-muted">
            <span className="truncate">{r.label}</span>
            <span className="shrink-0">{money(r.yearly, { compact: true })}/año</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function StreakCard({ d, money }: { d: Data; money: MoneyFn }) {
  return (
    <Card className="grid h-full grid-cols-1 gap-4 p-5 sm:grid-cols-3">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-transfer/15 text-transfer">
          <Flame size={20} />
        </span>
        <div>
          <div className="text-2xl font-semibold">
            {d.streak} {d.streak === 1 ? 'día' : 'días'}
          </div>
          <div className="text-xs text-ink-muted">seguidos sin gastar a {fmtDate(d.ref)}</div>
        </div>
      </div>
      <div>
        <div className="text-2xl font-semibold">{money(d.projection.dailyAvg)}</div>
        <div className="text-xs text-ink-muted">gasto medio al día (últimos 90 días)</div>
      </div>
      <div>
        <div className="text-2xl font-semibold">{money(d.projection.dailyAvg * 30.4)}</div>
        <div className="text-xs text-ink-muted">a ese ritmo, al mes</div>
      </div>
    </Card>
  )
}

function GoalsCard({ money, locale, asOf }: { money: MoneyFn; locale: string; asOf: string }) {
  const goals = useGoals()
  const { movements } = useMovements()
  const navigate = useUI((s) => s.navigate)
  const rows = useMemo(
    () =>
      goals
        .filter((g) => !g.archived)
        .sort((a, b) => a.priority - b.priority)
        .slice(0, 4)
        .map((g) => ({ g, p: goalProgress(g, movements, asOf) })),
    [goals, movements, asOf],
  )
  return (
    <Card className="h-full p-5">
      <CardHead
        title="Objetivos"
        action={
          <button onClick={() => navigate('objetivos')} className="text-xs font-medium text-accent-2 hover:underline">
            {rows.length ? 'Ver todos' : 'Crear uno'}
          </button>
        }
      />
      {rows.length === 0 ? (
        <p className="text-sm text-ink-faint">
          Ponle meta y fecha a lo que ahorras (la entrada de la casa, un colchón, un viaje) y aquí verás si llegas a tiempo.
        </p>
      ) : (
        <ul className="space-y-4">
          {rows.map(({ g, p }) => (
            <li key={g.id}>
              <div className="mb-1 flex items-center gap-2 text-sm">
                <CategoryIcon name={g.icon} size={14} className="text-ink-muted" />
                <span className="min-w-0 flex-1 truncate">{g.name}</span>
                <span className="font-semibold">{money(p.saved, { compact: true })}</span>
                <span className="text-xs text-ink-faint">/ {money(g.target, { compact: true })}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full" style={{ background: withAlpha(g.color, 0.18) }}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, p.ratio * 100)}%`, background: g.color }} />
              </div>
              <div className="mt-1 text-xs text-ink-muted">
                {fmtPercent(Math.min(p.ratio, 1), locale)} · {GOAL_STATUS_LABEL[p.status]}
                {p.status !== 'done' && p.eta && <> · llegas en {fmtMonth(p.eta.slice(0, 7))}</>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function LeaksCard({ money }: { money: MoneyFn }) {
  const data = useLeaks()
  const navigate = useUI((s) => s.navigate)
  return (
    <Card className="h-full p-5">
      <CardHead
        title="Fugas de dinero"
        action={
          <button onClick={() => navigate('fugas')} className="text-xs font-medium text-accent-2 hover:underline">
            Revisar
          </button>
        }
      />
      <div className="text-3xl font-semibold">
        {money(data.openYearly)}
        <span className="ml-1 text-sm font-normal text-ink-muted">al año por revisar</span>
      </div>
      {data.openOnce > 0 && <div className="text-xs text-ink-muted">+ {money(data.openOnce)} en cargos duplicados</div>}
      <ul className="mt-4 space-y-2">
        {data.open.slice(0, 4).map((l) => (
          <li key={l.id} className="flex items-center gap-2 text-sm">
            <CategoryIcon name={LEAK_ICON[l.type]} size={14} className="shrink-0 text-ink-muted" />
            <span className="min-w-0 flex-1 truncate">{l.title}</span>
            <span className="shrink-0 text-xs text-ink-muted">
              {money(l.amount)}
              {l.period === 'year' ? '/año' : ''}
            </span>
          </li>
        ))}
        {data.open.length === 0 && <li className="text-sm text-ink-faint">Nada por revisar.</li>}
      </ul>
      {data.cancelYearly > 0 && <div className="mt-3 text-xs text-income">Cancelando lo marcado ahorras {money(data.cancelYearly)} al año</div>}
    </Card>
  )
}

/** El Río del mes en pequeño: de dónde vino el dinero y a dónde fue. */
function RiverCard({ month, money, locale }: { month: string; money: MoneyFn; locale: string }) {
  const { movements } = useMovements()
  const categories = useCategories()
  const colors = useSceneColors()
  const navigate = useUI((s) => s.navigate)
  const flow = useMemo(
    () =>
      moneyFlow(
        movements.filter((m) => monthKey(m.date) === month),
        categories,
        { splitExpenses: true, maxSources: 4, maxExpenses: 5, expenseColor: colors.expense, leftoverColor: colors.income, deficitColor: colors.transfer },
      ),
    [movements, categories, month, colors],
  )
  return (
    <Card className="h-full p-5">
      <CardHead
        title={`Río de ${fmtMonth(month, true)}`}
        action={
          <button onClick={() => navigate('rio')} className="text-xs font-medium text-accent-2 hover:underline">
            Abrir el Río
          </button>
        }
      />
      {flow.nodes.length ? (
        <RiverChart flow={flow} money={(v) => money(v)} locale={locale} height={250} compact />
      ) : (
        <p className="py-10 text-center text-sm text-ink-muted">Sin ingresos ni gastos este mes.</p>
      )}
    </Card>
  )
}
