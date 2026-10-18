import clsx from 'clsx'
import { FlaskConical, Plus, Save, Trash2, X } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useCategories, useGoals, useMovements, useScenarios, useSettings } from '../../data/hooks'
import { deleteScenario, saveScenario } from '../../data/repo'
import { CATEGORY_PALETTE } from '../../lib/color'
import { newId } from '../../lib/id'
import { fmtMoney, fmtMonth } from '../../model/format'
import { goalProgress } from '../../model/goals'
import { dataAsOf } from '../../model/insights'
import {
  atHorizons,
  baselineFrom,
  DEFAULT_ASSUMPTIONS,
  goalSooner,
  LEVER_LABEL,
  leverMonthly,
  monthAfter,
  project,
  type Assumptions,
  type Baseline,
  type Lever,
  type LeverType,
} from '../../model/lab'
import { today } from '../../model/period'
import { detectRecurring } from '../../model/recurring'
import { useQuality, useSceneColors } from '../../scenes/common'
import { layoutHorizon } from '../../scenes/horizon/layout'
import { useUI } from '../../store/ui'
import { Button, Card, Field, Segmented } from '../../ui/components/primitives'
import { CategoryIcon } from '../../ui/icons'

const HorizonCanvas = lazy(() => import('../../scenes/horizon/HorizonCanvas').then((m) => ({ default: m.HorizonCanvas })))
const LabChart = lazy(() => import('./LabChart').then((m) => ({ default: m.LabChart })))

type View = 'horizonte' | 'grafico'
type Money = (v: number, signed?: boolean) => string

export function LabScreen() {
  const { movements } = useMovements()
  const categories = useCategories()
  const goals = useGoals()
  const scenarios = useScenarios()
  const settings = useSettings()
  const colors = useSceneColors()
  const quality = useQuality()
  const toast = useUI((s) => s.toast)
  const clearLabSeed = useUI((s) => s.clearLabSeed)
  // Si se llega desde «Simular» en Fugas, se empieza con esa palanca puesta.
  const [levers, setLevers] = useState<Lever[]>(() => {
    const seed = useUI.getState().labSeed
    return seed ? [seed] : []
  })
  useEffect(() => clearLabSeed(), [clearLabSeed])
  const [assumptions, setAssumptions] = useState<Assumptions>(DEFAULT_ASSUMPTIONS)
  const [view, setView] = useState<View>('horizonte')
  const [current, setCurrent] = useState<{ id?: string; name: string }>({ name: '' })
  const [compare, setCompare] = useState<string[]>([])
  const [target, setTarget] = useState<string | null>(null)

  const { asOf } = useMemo(() => dataAsOf(movements, today()), [movements])
  const base = useMemo(() => baselineFrom(movements, categories, asOf), [movements, categories, asOf])
  const proj = useMemo(() => project(base, levers, assumptions), [base, levers, assumptions])
  const recurring = useMemo(() => detectRecurring(movements, asOf).filter((r) => r.active), [movements, asOf])
  const money: Money = (v, signed = false) => fmtMoney(v, { currency: settings.currency, locale: settings.locale, signed })
  const startMonth = asOf.slice(0, 7)
  const extra = proj.monthlyScenario - proj.monthlyBase
  const activeGoals = useMemo(() => goals.filter((g) => !g.archived).sort((a, b) => a.priority - b.priority), [goals])
  const destination = activeGoals.find((g) => g.id === target) ?? activeGoals[0]
  // Cuándo llega cada objetivo: el extra va al elegido. La lista y los pórticos del Horizonte usan este mismo dato.
  const goalRows = useMemo(
    () =>
      activeGoals.map((g) => {
        const p = goalProgress(g, movements, asOf)
        return { g, p, r: goalSooner(p.remaining, p.monthlyPace, g.id === destination?.id ? Math.max(0, extra) : 0) }
      }),
    [activeGoals, movements, asOf, destination?.id, extra],
  )

  // Escenarios guardados que se comparan: misma línea base y mismo horizonte que el actual.
  const compared = useMemo(
    () =>
      scenarios
        .filter((s) => compare.includes(s.id))
        .map((s, i) => ({
          s,
          color: CATEGORY_PALETTE[(i + 3) % CATEGORY_PALETTE.length],
          values: project(base, s.levers, { ...s.assumptions, years: assumptions.years }).scenario,
        })),
    [scenarios, compare, base, assumptions.years],
  )
  const horizon = useMemo(
    () =>
      layoutHorizon(
        [
          { id: 'esc', label: levers.length ? 'Con tus cambios' : 'Tal cual', color: colors.accent2, values: proj.scenario },
          ...(levers.length ? [{ id: 'base', label: 'Sin cambios', color: '#8b8fa8', values: proj.baseline }] : []),
          ...compared.map((c) => ({ id: c.s.id, label: c.s.name, color: c.color, values: c.values })),
        ],
        goalRows.map(({ g, r }) => ({ id: g.id, name: g.name, color: g.color, icon: g.icon, target: g.target, month: r.after, sooner: r.sooner })),
      ),
    [proj, levers.length, compared, goalRows, colors.accent2],
  )

  if (!movements.length) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-3 py-16 text-center">
        <FlaskConical size={32} className="text-accent-2" />
        <h2 className="font-display text-2xl font-semibold">El laboratorio necesita tus números</h2>
        <p className="text-ink-muted">
          Con unos meses de movimientos, aquí podrás probar decisiones —recortar, cancelar, invertir— y ver cómo cambian tu futuro y tus objetivos.
        </p>
      </div>
    )
  }

  const add = (type: LeverType) => setLevers((ls) => [...ls, defaultLever(type, base, recurring)])
  const update = (id: string, patch: Partial<Lever>) => setLevers((ls) => ls.map((l) => (l.id === id ? ({ ...l, ...patch } as Lever) : l)))
  const horizons = atHorizons(proj.scenario)
  const end = proj.scenario[proj.scenario.length - 1]
  const endBase = proj.baseline[proj.baseline.length - 1]

  const save = async () => {
    const id = await saveScenario({ id: current.id, name: current.name || `Escenario ${scenarios.length + 1}`, levers, assumptions })
    setCurrent((c) => ({ id, name: c.name || `Escenario ${scenarios.length + 1}` }))
    toast('Escenario guardado')
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      {/* Resultado en titulares */}
      <div className="grid gap-3 md:grid-cols-3">
        <Card className="relative overflow-hidden p-5 md:col-span-2">
          <div className="absolute -top-20 -right-10 h-56 w-56 rounded-full bg-accent-2/15 blur-3xl" />
          <div className="relative">
            <div className="text-sm text-ink-muted">
              En {assumptions.years} {assumptions.years === 1 ? 'año' : 'años'} tendrías
            </div>
            <div className="num mt-1 text-4xl font-semibold tracking-tight sm:text-5xl">{money(end)}</div>
            <div className={clsx('mt-1 text-sm', end - endBase >= 0 ? 'text-income' : 'text-expense')}>
              {levers.length
                ? `${money(end - endBase, true)} frente a seguir igual (${money(endBase)})`
                : 'Siguiendo como hasta ahora. Añade palancas para probar cambios.'}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-muted">
              {horizons.map((h) => (
                <span key={h.years}>
                  {h.years} {h.years === 1 ? 'año' : 'años'}: <b className="num text-ink">{money(h.value)}</b>
                </span>
              ))}
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-ink-muted">Te sobra al mes</div>
          <div className="num mt-1 text-3xl font-semibold">{money(proj.monthlyScenario)}</div>
          <div className="text-sm text-ink-muted">
            {levers.length ? (
              <>
                ahora <span className="num">{money(proj.monthlyBase)}</span> ·{' '}
                <span className={extra >= 0 ? 'text-income' : 'text-expense'}>{money(extra, true)}</span>
              </>
            ) : (
              `media de ${base.months.length} ${base.months.length === 1 ? 'mes' : 'meses'} (${base.months.length ? fmtMonth(base.months[0]) : ''}${base.months.length > 1 ? ` – ${fmtMonth(base.months[base.months.length - 1])}` : ''})`
            )}
          </div>
          <div className="mt-2 text-xs text-ink-faint">
            Entra <span className="num">{money(base.income)}</span> · sale <span className="num">{money(base.expenses)}</span> al mes
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        {/* Palancas y supuestos */}
        <div className="flex flex-col gap-4 lg:col-span-4">
          <Card className="p-4">
            <h2 className="font-display text-lg font-semibold">Palancas</h2>
            <p className="mb-3 text-xs text-ink-muted">Lo que cambiarías. Cada palanca dice cuánto suma al mes.</p>
            <div className="space-y-3">
              {levers.map((l) => (
                <LeverEditor
                  key={l.id}
                  lever={l}
                  base={base}
                  categories={categories}
                  recurring={recurring}
                  money={money}
                  months={assumptions.years * 12}
                  onChange={(p) => update(l.id, p)}
                  onRemove={() => setLevers((ls) => ls.filter((x) => x.id !== l.id))}
                />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(Object.keys(LEVER_LABEL) as LeverType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => add(t)}
                  disabled={t === 'cancel' && !recurring.length}
                  className="flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs text-ink-muted transition hover:border-accent-2/60 hover:text-ink disabled:opacity-40"
                >
                  <Plus size={12} /> {LEVER_LABEL[t]}
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 font-display text-lg font-semibold">Supuestos</h2>
            <div className="space-y-3">
              <Field group label="Horizonte">
                <Segmented<string>
                  value={String(assumptions.years)}
                  onChange={(v) => setAssumptions((a) => ({ ...a, years: Number(v) }))}
                  options={['1', '3', '5', '10'].map((y) => ({ value: y, label: `${y} ${y === '1' ? 'año' : 'años'}` }))}
                  className="w-full [&>button]:flex-1"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <PercentField label="Inflación (gastos)" value={assumptions.inflation} onChange={(inflation) => setAssumptions((a) => ({ ...a, inflation }))} />
                <PercentField
                  label="Subida de ingresos"
                  value={assumptions.incomeGrowth}
                  onChange={(incomeGrowth) => setAssumptions((a) => ({ ...a, incomeGrowth }))}
                />
              </div>
              <Field label="Lo que tienes hoy" hint="Ahorros y cuentas: el punto de partida.">
                <input
                  className="field num"
                  inputMode="decimal"
                  value={assumptions.startBalance || ''}
                  placeholder="0"
                  onChange={(e) => setAssumptions((a) => ({ ...a, startBalance: Number(e.target.value.replace(/\./g, '').replace(',', '.')) || 0 }))}
                />
              </Field>
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 font-display text-lg font-semibold">Escenarios</h2>
            <div className="flex gap-2">
              <input
                className="field"
                placeholder="Nombre del escenario"
                value={current.name}
                onChange={(e) => setCurrent((c) => ({ ...c, name: e.target.value }))}
              />
              <Button variant="primary" onClick={save} disabled={!levers.length} title="Guardar palancas y supuestos">
                <Save size={14} />
              </Button>
            </div>
            {scenarios.length > 0 && (
              <ul className="mt-3 divide-y divide-line">
                {scenarios.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 py-2 text-sm">
                    <label className="flex min-w-0 flex-1 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={compare.includes(s.id)}
                        onChange={(e) => setCompare((c) => (e.target.checked ? [...c, s.id] : c.filter((x) => x !== s.id)))}
                        className="accent-[var(--accent)]"
                      />
                      <span className="truncate">{s.name}</span>
                    </label>
                    <span className="text-xs text-ink-faint">{s.levers.length} palancas</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setLevers(s.levers)
                        setAssumptions(s.assumptions)
                        setCurrent({ id: s.id, name: s.name })
                      }}
                    >
                      Abrir
                    </Button>
                    <Button size="sm" variant="ghost" aria-label={`Borrar ${s.name}`} onClick={() => deleteScenario(s.id)}>
                      <Trash2 size={13} />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-ink-faint">Marca escenarios guardados para verlos a la vez en el Horizonte.</p>
          </Card>
        </div>

        {/* Visualización y objetivos */}
        <div className="flex flex-col gap-4 lg:col-span-8">
          <Card className="relative overflow-hidden p-0">
            <div className="absolute inset-x-0 top-0 z-10 flex flex-wrap items-center gap-2 p-3">
              <div className="glass rounded-xl px-3 py-1.5 text-sm font-semibold">{view === 'horizonte' ? 'Horizonte' : 'Proyección'}</div>
              <Segmented<View>
                value={view}
                onChange={setView}
                options={[
                  { value: 'horizonte', label: 'Horizonte 3D' },
                  { value: 'grafico', label: 'Gráfico' },
                ]}
                className="glass ml-auto"
              />
            </div>
            <div className="relative h-[460px] sm:h-[520px]">
              <Suspense fallback={<div className="flex h-full items-center justify-center text-ink-muted">Cargando…</div>}>
                {view === 'horizonte' ? (
                  <HorizonCanvas
                    layout={horizon}
                    colors={colors}
                    quality={quality}
                    currency={settings.currency}
                    locale={settings.locale}
                    startMonth={startMonth}
                    animKey={`${assumptions.years}|${levers.length}|${compare.join(',')}`}
                  />
                ) : (
                  <div className="absolute inset-0 px-2 pt-16 pb-3">
                    <LabChart
                      startMonth={startMonth}
                      series={horizon.series.map((s) => ({ id: s.id, label: s.label, color: s.color, values: s.values }))}
                      goals={goalRows.map(({ g, r }) => ({ name: g.name, color: g.color, month: r.after }))}
                      money={(v) => fmtMoney(v, { currency: settings.currency, locale: settings.locale, compact: true })}
                    />
                  </div>
                )}
              </Suspense>
            </div>
          </Card>

          {activeGoals.length > 0 && (
            <Card className="p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h2 className="min-w-0 flex-1 font-display text-lg font-semibold">Tus objetivos</h2>
                {extra > 0 && destination && (
                  <label className="flex items-center gap-2 text-xs text-ink-muted">
                    El extra ({money(extra)}/mes) va a
                    <select className="field h-8 w-auto py-0 text-xs" value={destination.id} onChange={(e) => setTarget(e.target.value)}>
                      {activeGoals.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <ul className="space-y-2">
                {goalRows.map(({ g, p, r }) => {
                  return (
                    <li key={g.id} className="flex items-center gap-3 rounded-lg bg-surface-2/50 px-3 py-2 text-sm">
                      <span
                        className="chip-ink flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                        style={{ '--c': g.color, background: `${g.color}22` } as React.CSSProperties}
                      >
                        <CategoryIcon name={g.icon} size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{g.name}</span>
                        <span className="block text-xs text-ink-muted">
                          Faltan <span className="num">{money(p.remaining)}</span> · ahora aportas <span className="num">{money(p.monthlyPace)}</span>/mes
                        </span>
                      </span>
                      <span className="text-right text-xs">
                        {p.remaining <= 0 ? (
                          <span className="text-income">Conseguido</span>
                        ) : r.after == null ? (
                          <span className="text-ink-muted">Sin ritmo de ahorro todavía</span>
                        ) : (
                          <>
                            <span className="block font-medium">{fmtMonth(monthAfter(startMonth, r.after), true)}</span>
                            {r.sooner != null && r.sooner > 0 ? (
                              <span className="block text-income">{r.sooner} meses antes</span>
                            ) : r.before == null ? (
                              <span className="block text-income">gracias al extra</span>
                            ) : (
                              <span className="block text-ink-faint">al ritmo actual</span>
                            )}
                          </>
                        )}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function defaultLever(type: LeverType, base: Baseline, recurring: { conceptKey: string; label: string; yearly: number }[]): Lever {
  const id = newId()
  const topCat = [...base.expenseByCat].sort((a, b) => b[1] - a[1])[0]
  switch (type) {
    case 'cut':
      return { id, type, categoryId: topCat?.[0] ?? '', pct: 0.15 }
    case 'cap':
      return { id, type, categoryId: topCat?.[0] ?? '', amount: Math.round((topCat?.[1] ?? 0) * 0.8) }
    case 'cancel': {
      const r = recurring[0]
      return { id, type, conceptKey: r?.conceptKey ?? '', label: r?.label ?? '', monthly: r ? r.yearly / 12 : 0 }
    }
    case 'income':
      return { id, type, monthly: 150, fromMonth: 0 }
    case 'oneoff':
      return { id, type, amount: -3000, atMonth: 6, label: 'Gasto grande' }
    case 'invest':
      return { id, type, share: 0.5, rate: 0.05 }
  }
}

function LeverEditor({
  lever: l,
  base,
  categories,
  recurring,
  money,
  months,
  onChange,
  onRemove,
}: {
  lever: Lever
  base: Baseline
  categories: { id: string; name: string; kind: string }[]
  recurring: { conceptKey: string; label: string; yearly: number }[]
  money: Money
  months: number
  onChange: (p: Partial<Lever>) => void
  onRemove: () => void
}) {
  const expenseCats = [...base.expenseByCat]
    .sort((a, b) => b[1] - a[1])
    .map(([id, v]) => ({ id, v, name: categories.find((c) => c.id === id)?.name ?? 'Sin categoría' }))
  const monthly = leverMonthly(base, l)
  let body: ReactNode = null
  if (l.type === 'cut' || l.type === 'cap') {
    body = (
      <>
        <select className="field h-9" value={l.categoryId} onChange={(e) => onChange({ categoryId: e.target.value })} aria-label="Categoría">
          {expenseCats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {money(c.v)}/mes
            </option>
          ))}
        </select>
        {l.type === 'cut' ? (
          <label className="mt-2 flex items-center gap-2 text-xs text-ink-muted">
            <input
              type="range"
              min={5}
              max={100}
              step={5}
              value={Math.round(l.pct * 100)}
              onChange={(e) => onChange({ pct: Number(e.target.value) / 100 })}
              className="flex-1 accent-[var(--accent-2)]"
              aria-label="Recorte"
            />
            <span className="num w-10 text-right text-ink">{Math.round(l.pct * 100)} %</span>
          </label>
        ) : (
          <label className="mt-2 flex items-center gap-2 text-xs text-ink-muted">
            Como mucho
            <input
              className="field num h-8 flex-1"
              inputMode="decimal"
              value={l.amount}
              onChange={(e) => onChange({ amount: Number(e.target.value) || 0 })}
              aria-label="Tope al mes"
            />
            €/mes
          </label>
        )}
      </>
    )
  } else if (l.type === 'cancel') {
    body = (
      <select
        className="field h-9"
        value={l.conceptKey}
        onChange={(e) => {
          const r = recurring.find((x) => x.conceptKey === e.target.value)
          if (r) onChange({ conceptKey: r.conceptKey, label: r.label, monthly: r.yearly / 12 })
        }}
        aria-label="Cargo fijo"
      >
        {!recurring.some((r) => r.conceptKey === l.conceptKey) && <option value={l.conceptKey}>{l.label}</option>}
        {recurring.map((r) => (
          <option key={r.conceptKey} value={r.conceptKey}>
            {r.label} · {money(r.yearly / 12)}/mes
          </option>
        ))}
      </select>
    )
  } else if (l.type === 'income') {
    body = (
      <div className="flex items-center gap-2 text-xs text-ink-muted">
        <input
          className="field num h-8 w-24"
          inputMode="decimal"
          value={l.monthly}
          onChange={(e) => onChange({ monthly: Number(e.target.value) || 0 })}
          aria-label="Cambio al mes"
        />
        €/mes
        <select className="field h-8 flex-1" value={l.fromMonth} onChange={(e) => onChange({ fromMonth: Number(e.target.value) })} aria-label="Desde">
          {[0, 3, 6, 12, 24].map((m) => (
            <option key={m} value={m}>
              {m === 0 ? 'desde ya' : `dentro de ${m} meses`}
            </option>
          ))}
        </select>
      </div>
    )
  } else if (l.type === 'oneoff') {
    body = (
      <div className="space-y-2">
        <input className="field h-8" value={l.label} onChange={(e) => onChange({ label: e.target.value })} aria-label="Qué es" />
        <div className="flex items-center gap-2 text-xs text-ink-muted">
          <input
            className="field num h-8 w-28"
            inputMode="decimal"
            value={l.amount}
            onChange={(e) => onChange({ amount: Number(e.target.value) || 0 })}
            aria-label="Importe (negativo si es un gasto)"
          />
          €
          <select className="field h-8 flex-1" value={l.atMonth} onChange={(e) => onChange({ atMonth: Number(e.target.value) })} aria-label="Cuándo">
            {[0, 3, 6, 12, 24, 36, 60]
              .filter((m) => m < months)
              .map((m) => (
                <option key={m} value={m}>
                  {m === 0 ? 'este mes' : `dentro de ${m} meses`}
                </option>
              ))}
          </select>
        </div>
        <p className="text-[11px] text-ink-faint">En negativo si es un gasto (un coche, una reforma); en positivo si es un ingreso (una herencia, un bonus).</p>
      </div>
    )
  } else if (l.type === 'invest') {
    body = (
      <div className="space-y-2 text-xs text-ink-muted">
        <label className="flex items-center gap-2">
          Invertir
          <input
            type="range"
            min={10}
            max={100}
            step={10}
            value={Math.round(l.share * 100)}
            onChange={(e) => onChange({ share: Number(e.target.value) / 100 })}
            className="flex-1 accent-[var(--accent-2)]"
            aria-label="Parte invertida"
          />
          <span className="num w-10 text-right text-ink">{Math.round(l.share * 100)} %</span>
        </label>
        <label className="flex items-center gap-2">
          al
          <input
            type="range"
            min={0}
            max={10}
            step={0.5}
            value={l.rate * 100}
            onChange={(e) => onChange({ rate: Number(e.target.value) / 100 })}
            className="flex-1 accent-[var(--accent-2)]"
            aria-label="Rentabilidad anual"
          />
          <span className="num w-14 text-right text-ink">{(l.rate * 100).toFixed(1).replace('.', ',')} %/año</span>
        </label>
        <p className="text-[11px] text-ink-faint">Interés compuesto sobre lo que vas acumulando. Las rentabilidades pasadas no garantizan las futuras.</p>
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-line bg-surface-2/40 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{LEVER_LABEL[l.type]}</span>
        {monthly !== 0 && <span className={clsx('num text-xs', monthly > 0 ? 'text-income' : 'text-expense')}>{fmtSigned(money, monthly)}/mes</span>}
        <button onClick={onRemove} className="rounded p-1 text-ink-faint hover:bg-surface-2 hover:text-ink" aria-label="Quitar palanca">
          <X size={14} />
        </button>
      </div>
      {body}
    </div>
  )
}

const fmtSigned = (money: Money, v: number) => money(v, true)

function PercentField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-1">
        <input
          className="field num h-9"
          inputMode="decimal"
          value={(value * 100).toFixed(1).replace('.', ',')}
          onChange={(e) => onChange((Number(e.target.value.replace(',', '.')) || 0) / 100)}
        />
        <span className="text-sm text-ink-muted">%</span>
      </div>
    </Field>
  )
}
