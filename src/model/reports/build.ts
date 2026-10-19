import { dataBounds, descendantIds, totals } from '../aggregate'
import { fmtDate, fmtMoney, fmtMonth, fmtPercent, savingsPhrase } from '../format'
import { GOAL_STATUS_LABEL, goalProgress } from '../goals'
import { dataAsOf } from '../insights'
import { atHorizons, baselineFrom, DEFAULT_ASSUMPTIONS, LEVER_LABEL, leverMonthly, project, type Baseline, type Lever } from '../lab'
import { detectLeaks, LEAK_LABEL, summarizeLeaks } from '../leaks'
import { monthKey, resolvePeriod, type Period } from '../period'
import { CADENCE_LABEL, detectRecurring } from '../recurring'
import { monthRange, rootIndex } from '../series'
import type { Category, Goal, ISODate, Kind, LeakDecision, LeakStatus, Movement, Scenario, Settings } from '../types'
import type { Cell, Column, ColumnsSection, Kpi, RankingSection, ReportDoc, ReportId, Section, TableSection } from './types'

/** Colores de los informes (fondo blanco, como el tema claro). */
export const REPORT_COLOR = { income: '#059669', expense: '#e11d48', transfer: '#d97706', accent: '#7c3aed', muted: '#9ca3af' }

export interface ReportInput {
  movements: Movement[]
  categories: Category[]
  goals: Goal[]
  decisions: LeakDecision[]
  scenarios: Scenario[]
  settings: Settings
  period: Period
  /** Cómo se llama el periodo en la app («Este año», «2025»…). */
  periodLabel: string
  /** Vacío = todas; incluye subcategorías. No afecta a Objetivos ni al Laboratorio, que miran todo. */
  categoryIds: string[]
  /** Tipos del listado de movimientos. */
  kinds: Kind[]
  today: ISODate
}

type Grain = 'month' | 'quarter' | 'year'

interface Ctx {
  input: ReportInput
  /** Rango real: el del periodo recortado a donde hay datos (sin meses vacíos delante ni futuros). */
  range: { from: ISODate; to: ISODate } | null
  period: string
  /** Movimientos del periodo y de las categorías elegidas. */
  scoped: Movement[]
  /** Todos los de las categorías elegidas, de cualquier fecha (para comparar y detectar cargos). */
  allScoped: Movement[]
  inScope: (categoryId: string) => boolean
  months: string[]
  grain: Grain
  buckets: string[]
  bucketOf: (date: ISODate) => string
  bucketLabel: (key: string) => string
  /** Fecha de referencia para lo que se mide «a hoy» (objetivos, fugas, cargos). */
  asOf: ISODate
  root: (id: string) => string
  cat: (id: string) => Category | undefined
  money: (v: number) => string
}

const KIND_LABEL: Record<Kind, string> = { expense: 'Gasto', income: 'Ingreso', transfer: 'Transferencia' }
const LEAK_STATUS: Record<LeakStatus, string> = { kept: 'La uso / es correcto', cancel: 'Para cancelar', ignored: 'Ignorada' }
const SEVERITY = { high: 'Alta', medium: 'Media', low: 'Baja' }
const NO_CAT = 'Sin categoría'
const GREY = '#8b8fa8'

const col = (label: string, type: Column['type'] = 'money'): Column => ({ label, type })
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const abs = (m: Movement) => Math.abs(m.amount)

function prepare(input: ReportInput): Ctx {
  const { movements, categories, settings } = input
  const cats = input.categoryIds.length ? descendantIds(input.categoryIds, categories) : null
  const inScope = (id: string) => !cats || cats.has(id)
  const allScoped = cats ? movements.filter((m) => cats.has(m.categoryId)) : movements
  const bounds = dataBounds(allScoped)
  const resolved = resolvePeriod(input.period, input.today, settings.fiscalYearStart) ?? bounds
  let range: Ctx['range'] = null
  if (resolved && bounds) {
    const from = resolved.from > bounds.from ? resolved.from : bounds.from
    const end = bounds.to > input.today ? bounds.to : input.today
    const to = resolved.to < end ? resolved.to : end
    if (from <= to) range = { from, to }
  }
  const scoped = range ? allScoped.filter((m) => m.date >= range.from && m.date <= range.to) : []
  const months = range ? monthRange(monthKey(range.from), monthKey(range.to)) : []
  const grain: Grain = months.length <= 13 ? 'month' : months.length <= 36 ? 'quarter' : 'year'
  const bucketOf = (date: ISODate) =>
    grain === 'month' ? date.slice(0, 7) : grain === 'year' ? date.slice(0, 4) : `${date.slice(0, 4)}-T${Math.floor((+date.slice(5, 7) - 1) / 3) + 1}`
  const buckets = [...new Set(months.map((k) => bucketOf(`${k}-01`)))]
  const bucketLabel = (key: string) => (grain === 'month' ? fmtMonth(key) : grain === 'year' ? key : `${key.slice(5)} ${key.slice(0, 4)}`)
  const asOfData = dataAsOf(movements, input.today).asOf
  const asOf = range && range.to < asOfData ? range.to : asOfData
  const byId = new Map(categories.map((c) => [c.id, c]))
  const period = range ? `${input.periodLabel} · ${fmtDate(range.from)} – ${fmtDate(range.to)}` : input.periodLabel
  return {
    input,
    range,
    period,
    scoped,
    allScoped,
    inScope,
    months,
    grain,
    buckets,
    bucketOf,
    bucketLabel,
    asOf,
    root: rootIndex(categories),
    cat: (id) => byId.get(id),
    money: (v) => fmtMoney(v, { currency: settings.currency, locale: settings.locale }),
  }
}

const empty = (c: Ctx, id: ReportId, title: string, why = 'No hay movimientos en este periodo.'): ReportDoc => ({
  id,
  title,
  period: c.period,
  sections: [{ kind: 'text', text: why }],
})

/** Totales por categoría raíz de un tipo, de mayor a menor. */
function byRoot(c: Ctx, ms: Movement[], kind: Kind): { id: string; name: string; color: string; total: number; count: number }[] {
  const acc = new Map<string, { id: string; name: string; color: string; total: number; count: number }>()
  for (const m of ms) {
    if (m.kind !== kind) continue
    const id = c.root(m.categoryId)
    let row = acc.get(id)
    if (!row) {
      const cat = c.cat(id)
      row = { id, name: cat?.name ?? NO_CAT, color: cat?.color ?? GREY, total: 0, count: 0 }
      acc.set(id, row)
    }
    row.total += kind === 'transfer' ? -m.amount : abs(m)
    row.count++
  }
  return [...acc.values()].sort((a, b) => b.total - a.total)
}

/** Importe por tramo (mes, trimestre o año) de un tipo; en positivo. */
function perBucket(c: Ctx, ms: Movement[], pick: (m: Movement) => boolean): number[] {
  const idx = new Map(c.buckets.map((k, i) => [k, i]))
  const out = c.buckets.map(() => 0)
  for (const m of ms) if (pick(m)) out[idx.get(c.bucketOf(m.date))!] += abs(m)
  return out
}

function flowChart(c: Ctx): ColumnsSection {
  const by = c.grain === 'month' ? 'mes' : c.grain === 'quarter' ? 'trimestre' : 'año'
  return {
    kind: 'columns',
    title: `Ingresos y gastos por ${by}`,
    labels: c.buckets.map(c.bucketLabel),
    series: [
      { label: 'Ingresos', color: REPORT_COLOR.income, values: perBucket(c, c.scoped, (m) => m.kind === 'income') },
      { label: 'Gastos', color: REPORT_COLOR.expense, values: perBucket(c, c.scoped, (m) => m.kind === 'expense') },
    ],
  }
}

function rootTable(c: Ctx, kind: Kind, title: string): TableSection | null {
  const rows = byRoot(c, c.scoped, kind)
  if (!rows.length) return null
  const total = sum(rows.map((r) => r.total))
  return {
    kind: 'table',
    title,
    columns: [col('Categoría', 'text'), col(kind === 'transfer' ? 'Apartado (neto)' : 'Importe'), col('% del total', 'percent'), col('Movimientos', 'int')],
    rows: rows.map((r) => [r.name, r.total, total ? r.total / total : null, r.count]),
    colors: rows.map((r) => r.color),
    total: ['Total', total, total ? 1 : null, sum(rows.map((r) => r.count))],
  }
}

// ── Informes ─────────────────────────────────────────────────────────────────

function summary(c: Ctx): ReportDoc {
  const title = 'Resumen del periodo'
  if (!c.scoped.length) return empty(c, 'summary', title)
  const t = totals(c.scoped)
  const { locale } = c.input.settings
  const expenses = c.scoped.filter((m) => m.kind === 'expense')
  const biggest = expenses.reduce<Movement | null>((min, m) => (!min || m.amount < min.amount ? m : min), null)
  const kpis: Kpi[] = [
    { label: 'Ingresos', value: t.income, type: 'money', tone: 'income' },
    { label: 'Gastos', value: t.expense, type: 'money', tone: 'expense' },
    {
      label: 'Balance',
      value: t.net,
      type: 'money',
      tone: t.net >= 0 ? 'income' : 'expense',
      sub: t.savingsRate != null ? savingsPhrase(t.savingsRate, locale) : 'Sin ingresos en el periodo',
    },
    t.transfer <= 0
      ? { label: 'Apartado a ahorro/inversión', value: -t.transfer, type: 'money', tone: 'transfer' }
      : { label: 'Retirado de ahorro', value: t.transfer, type: 'money', tone: 'transfer' },
    { label: 'Gasto medio al mes', value: t.expense / Math.max(1, c.months.length), type: 'money', sub: `${c.months.length} meses` },
    { label: 'Movimientos', value: t.count, type: 'int', sub: biggest ? `Mayor gasto: ${biggest.concept}, ${c.money(-biggest.amount)}` : undefined },
  ]
  const top: RankingSection = {
    kind: 'ranking',
    title: 'En qué se va el dinero',
    items: byRoot(c, c.scoped, 'expense')
      .slice(0, 10)
      .map((r) => ({ label: r.name, value: r.total, color: r.color })),
  }
  const sections: Section[] = [{ kind: 'kpis', items: kpis }, flowChart(c)]
  if (top.items.length) sections.push(top)
  for (const s of [rootTable(c, 'expense', 'Gastos por categoría'), rootTable(c, 'income', 'Ingresos por categoría')]) if (s) sections.push(s)
  return { id: 'summary', title, period: c.period, sections }
}

function monthly(c: Ctx): ReportDoc {
  const title = 'Evolución mes a mes'
  if (!c.scoped.length) return empty(c, 'monthly', title)
  const idx = new Map(c.months.map((k, i) => [k, i]))
  const rows = c.months.map(() => ({ income: 0, expense: 0, transfer: 0, count: 0 }))
  for (const m of c.scoped) {
    const r = rows[idx.get(monthKey(m.date))!]
    if (m.kind === 'income') r.income += m.amount
    else if (m.kind === 'expense') r.expense -= m.amount
    else r.transfer -= m.amount
    r.count++
  }
  let acc = 0
  const t = totals(c.scoped)
  return {
    id: 'monthly',
    title,
    period: c.period,
    sections: [
      flowChart(c),
      {
        kind: 'table',
        title: 'Mes a mes',
        columns: [
          col('Mes', 'month'),
          col('Ingresos'),
          col('Gastos'),
          col('Balance'),
          col('Apartado'),
          col('Tasa de ahorro', 'percent'),
          col('Balance acumulado'),
          col('Movimientos', 'int'),
        ],
        rows: c.months.map((k, i) => {
          const r = rows[i]
          const net = r.income - r.expense
          acc += net
          return [k, r.income, r.expense, net, r.transfer, r.income > 0 ? net / r.income : null, acc, r.count]
        }),
        total: ['Total', t.income, t.expense, t.net, -t.transfer, t.savingsRate, t.net, t.count],
      },
    ],
  }
}

function categories(c: Ctx): ReportDoc {
  const title = 'Por categoría'
  if (!c.scoped.length) return empty(c, 'categories', title)
  const nMonths = Math.max(1, c.months.length)
  const sections: Section[] = []
  const tables: [Kind, string][] = [
    ['expense', 'Gastos'],
    ['income', 'Ingresos'],
    ['transfer', 'Transferencias (positivo = apartado)'],
  ]
  for (const [kind, label] of tables) {
    const roots = byRoot(c, c.scoped, kind)
    if (!roots.length) continue
    // Subcategorías (u hojas) de cada raíz.
    const leaves = new Map<string, Map<string, { total: number; count: number }>>()
    for (const m of c.scoped) {
      if (m.kind !== kind) continue
      const r = c.root(m.categoryId)
      const map = leaves.get(r) ?? new Map()
      const leaf = map.get(m.categoryId) ?? { total: 0, count: 0 }
      leaf.total += kind === 'transfer' ? -m.amount : abs(m)
      leaf.count++
      map.set(m.categoryId, leaf)
      leaves.set(r, map)
    }
    const total = sum(roots.map((r) => r.total))
    const budgets = kind === 'expense' && c.input.categories.some((x) => x.kind === 'expense' && x.budgetMonthly)
    const columns = [col('Categoría', 'text'), col('Importe'), col('% del total', 'percent'), col('Movimientos', 'int'), col('Media al mes')]
    if (budgets) columns.push(col('Presupuesto al mes'), col('Margen al mes'))
    const rows: Cell[][] = []
    const colors: (string | null)[] = []
    const indent: boolean[] = []
    const line = (name: string, cat: Category | undefined, v: { total: number; count: number }, sub: boolean) => {
      const avg = v.total / nMonths
      const row: Cell[] = [name, v.total, total ? v.total / total : null, v.count, avg]
      if (budgets) row.push(cat?.budgetMonthly ?? null, cat?.budgetMonthly ? cat.budgetMonthly - avg : null)
      rows.push(row)
      colors.push(sub ? null : (cat?.color ?? GREY))
      indent.push(sub)
    }
    for (const r of roots) {
      line(r.name, c.cat(r.id), r, false)
      const children = [...(leaves.get(r.id) ?? new Map()).entries()].sort((a, b) => b[1].total - a[1].total)
      if (children.length > 1 || (children.length === 1 && children[0][0] !== r.id))
        for (const [id, v] of children) line(id === r.id ? 'Sin subcategoría' : (c.cat(id)?.name ?? NO_CAT), c.cat(id), v, true)
    }
    const totalRow: Cell[] = ['Total', total, total ? 1 : null, sum(roots.map((r) => r.count)), total / nMonths]
    if (budgets) totalRow.push(null, null)
    const note = budgets ? 'Margen al mes = presupuesto − media (negativo: gastas más de lo presupuestado).' : undefined
    sections.push({ kind: 'table', title: label, columns, rows, colors, indent, total: totalRow, note })
  }
  const rank = byRoot(c, c.scoped, 'expense')
  if (rank.length)
    sections.unshift({
      kind: 'ranking',
      title: 'Gastos por categoría',
      items: rank.slice(0, 12).map((r) => ({ label: r.name, value: r.total, color: r.color })),
    })
  return { id: 'categories', title, period: c.period, sections }
}

function matrix(c: Ctx): ReportDoc {
  const by = c.grain === 'month' ? 'mes' : c.grain === 'quarter' ? 'trimestre' : 'año'
  const title = `Categorías por ${by}`
  if (!c.scoped.length) return empty(c, 'matrix', title)
  const idx = new Map(c.buckets.map((k, i) => [k, i]))
  const sections: Section[] = []
  for (const [kind, label] of [
    ['expense', 'Gastos'],
    ['income', 'Ingresos'],
  ] as [Kind, string][]) {
    const roots = byRoot(c, c.scoped, kind)
    if (!roots.length) continue
    const values = new Map(roots.map((r) => [r.id, c.buckets.map(() => 0)]))
    for (const m of c.scoped) if (m.kind === kind) values.get(c.root(m.categoryId))![idx.get(c.bucketOf(m.date))!] += abs(m)
    const totalsByBucket = c.buckets.map((_, i) => sum(roots.map((r) => values.get(r.id)![i])))
    sections.push({
      kind: 'table',
      title: `${label} por ${by}`,
      columns: [col('Categoría', 'text'), ...c.buckets.map((k) => col(c.bucketLabel(k))), col('Total')],
      rows: roots.map((r) => [r.name, ...values.get(r.id)!, r.total]),
      colors: roots.map((r) => r.color),
      total: ['Total', ...totalsByBucket, sum(totalsByBucket)],
    })
  }
  return { id: 'matrix', title, period: c.period, landscape: c.buckets.length > 5, sections }
}

function concepts(c: Ctx): ReportDoc {
  const title = 'Por concepto'
  if (!c.scoped.length) return empty(c, 'concepts', title)
  const sections: Section[] = []
  for (const [kind, label, limit] of [
    ['expense', 'Gastos', 100],
    ['income', 'Ingresos', 30],
  ] as [Kind, string, number][]) {
    const groups = new Map<string, { concept: string; categoryId: string; last: ISODate; count: number; total: number }>()
    for (const m of c.scoped) {
      if (m.kind !== kind) continue
      const g = groups.get(m.conceptKey)
      if (!g) groups.set(m.conceptKey, { concept: m.concept, categoryId: m.categoryId, last: m.date, count: 1, total: abs(m) })
      else {
        g.count++
        g.total += abs(m)
        if (m.date >= g.last) Object.assign(g, { last: m.date, concept: m.concept, categoryId: m.categoryId })
      }
    }
    const all = [...groups.values()].sort((a, b) => b.total - a.total)
    if (!all.length) continue
    const top = all.slice(0, limit)
    sections.push({
      kind: 'table',
      title: `${label}: ${top.length < all.length ? `los ${top.length} conceptos que más suman de ${all.length}` : `${all.length} conceptos`}`,
      columns: [col('Concepto', 'text'), col('Categoría', 'text'), col('Veces', 'int'), col('Total'), col('Media'), col('Último', 'date')],
      rows: top.map((g) => [g.concept, c.cat(g.categoryId)?.name ?? NO_CAT, g.count, g.total, g.total / g.count, g.last]),
      colors: top.map((g) => c.cat(c.root(g.categoryId))?.color ?? GREY),
      total: ['Total', null, sum(top.map((g) => g.count)), sum(top.map((g) => g.total)), null, null],
    })
  }
  return { id: 'concepts', title, period: c.period, sections }
}

function movementsList(c: Ctx): ReportDoc {
  const title = 'Movimientos'
  const kinds = new Set(c.input.kinds)
  const ms = c.scoped.filter((m) => kinds.has(m.kind)).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
  if (!ms.length) return empty(c, 'movements', title)
  return {
    id: 'movements',
    title,
    period: c.period,
    sections: [
      {
        kind: 'table',
        title: `${ms.length.toLocaleString('es-ES')} movimientos`,
        columns: [col('Fecha', 'date'), col('Concepto', 'text'), col('Categoría', 'text'), col('Tipo', 'text'), col('Importe'), col('Notas', 'text')],
        rows: ms.map((m) => [m.date, m.concept, c.cat(m.categoryId)?.name ?? NO_CAT, KIND_LABEL[m.kind], m.amount, m.notes ?? '']),
        colors: ms.map((m) => c.cat(c.root(m.categoryId))?.color ?? GREY),
        total: ['Total', null, null, null, sum(ms.map((m) => m.amount)), null],
      },
    ],
  }
}

function budgets(c: Ctx): ReportDoc {
  const title = 'Presupuestos'
  const withBudget = c.input.categories.filter((x) => x.kind === 'expense' && x.budgetMonthly && x.budgetMonthly > 0 && c.inScope(x.id))
  if (!withBudget.length) return empty(c, 'budgets', title, 'Ninguna categoría tiene presupuesto. Ponlo en Categorías (presupuesto mensual) y aparecerá aquí.')
  if (!c.scoped.length) return empty(c, 'budgets', title)
  const idx = new Map(c.months.map((k, i) => [k, i]))
  const summaryRows: Cell[][] = []
  const colors: string[] = []
  const over: { month: string; name: string; budget: number; spent: number; color: string }[] = []
  for (const cat of withBudget) {
    const ids = descendantIds([cat.id], c.input.categories)
    const perMonth = c.months.map(() => 0)
    for (const m of c.scoped) if (m.kind === 'expense' && ids.has(m.categoryId)) perMonth[idx.get(monthKey(m.date))!] += abs(m)
    const spent = sum(perMonth)
    const budget = cat.budgetMonthly! * c.months.length
    const overMonths = perMonth.filter((v) => v > cat.budgetMonthly!).length
    perMonth.forEach(
      (v, i) => v > cat.budgetMonthly! && over.push({ month: c.months[i], name: cat.name, budget: cat.budgetMonthly!, spent: v, color: cat.color }),
    )
    summaryRows.push([cat.name, cat.budgetMonthly!, budget, spent, budget - spent, budget ? spent / budget : null, `${overMonths} de ${c.months.length}`])
    colors.push(cat.color)
  }
  const sections: Section[] = [
    {
      kind: 'table',
      title: 'Por categoría',
      columns: [
        col('Categoría', 'text'),
        col('Presupuesto al mes'),
        col('Presupuesto del periodo'),
        col('Gastado'),
        col('Margen'),
        col('Usado', 'percent'),
        col('Meses por encima', 'text'),
      ],
      rows: summaryRows,
      colors,
      note: 'Margen = presupuesto del periodo − gastado (negativo: te has pasado). Incluye las subcategorías.',
    },
  ]
  over.sort((a, b) => a.month.localeCompare(b.month) || b.spent - b.budget - (a.spent - a.budget))
  sections.push(
    over.length
      ? {
          kind: 'table',
          title: 'Meses en los que te pasaste',
          columns: [col('Mes', 'month'), col('Categoría', 'text'), col('Presupuesto'), col('Gastado'), col('Exceso'), col('Exceso %', 'percent')],
          rows: over.map((o) => [o.month, o.name, o.budget, o.spent, o.spent - o.budget, (o.spent - o.budget) / o.budget]),
          colors: over.map((o) => o.color),
        }
      : { kind: 'text', text: 'Ningún mes por encima del presupuesto.' },
  )
  return { id: 'budgets', title, period: c.period, sections }
}

function recurring(c: Ctx): ReportDoc {
  const title = 'Suscripciones y cargos fijos'
  const found = detectRecurring(
    c.allScoped.filter((m) => m.date <= c.asOf && m.kind !== 'transfer'),
    c.asOf,
  ).filter((r) => c.inScope(r.categoryId))
  if (!found.length) return empty(c, 'recurring', title, 'No se han detectado cargos periódicos (hacen falta al menos tres cobros parecidos).')
  const sections: Section[] = []
  const active = found.filter((r) => r.active && c.cat(r.categoryId)?.kind === 'expense')
  const yearly = sum(active.map((r) => r.yearly))
  sections.push({
    kind: 'kpis',
    items: [
      { label: 'Cargos activos', value: active.length, type: 'int' },
      { label: 'Coste al mes', value: yearly / 12, type: 'money', tone: 'expense' },
      { label: 'Coste al año', value: yearly, type: 'money', tone: 'expense' },
    ],
  })
  for (const [kind, label] of [
    ['expense', 'Gastos periódicos'],
    ['income', 'Ingresos periódicos'],
  ] as [Kind, string][]) {
    const list = found
      .filter((r) => (c.cat(r.categoryId)?.kind ?? 'expense') === kind)
      .sort((a, b) => Number(b.active) - Number(a.active) || b.yearly - a.yearly)
    if (!list.length) continue
    sections.push({
      kind: 'table',
      title: label,
      columns: [
        col('Concepto', 'text'),
        col('Categoría', 'text'),
        col('Frecuencia', 'text'),
        col('Importe'),
        col('Al año'),
        col('Último', 'date'),
        col('Próximo', 'date'),
        col('Estado', 'text'),
        col('Cambios de precio', 'text'),
      ],
      rows: list.map((r) => [
        r.label,
        c.cat(r.categoryId)?.name ?? NO_CAT,
        CADENCE_LABEL[r.cadence],
        r.amount,
        r.yearly,
        r.lastDate,
        r.active ? r.nextDate : null,
        r.active ? 'Activo' : 'Ya no se cobra',
        r.priceChanges.map((p) => `${c.money(p.from)} → ${c.money(p.to)} (${fmtMonth(p.date.slice(0, 7))})`).join('; '),
      ]),
      colors: list.map((r) => c.cat(c.root(r.categoryId))?.color ?? GREY),
      total: kind === 'expense' ? ['Total activos', null, null, null, yearly, null, null, null, null] : undefined,
    })
  }
  return { id: 'recurring', title, period: `A ${fmtDate(c.asOf)}`, landscape: true, sections }
}

function goals(c: Ctx): ReportDoc {
  const title = 'Objetivos'
  const list = c.input.goals.filter((g) => !g.archived).sort((a, b) => a.priority - b.priority)
  const period = `A ${fmtDate(c.asOf)}`
  if (!list.length) return { id: 'goals', title, period, sections: [{ kind: 'text', text: 'No tienes objetivos de ahorro. Créalos en Objetivos.' }] }
  const rows = list.map((g) => ({ g, p: goalProgress(g, c.input.movements, c.asOf) }))
  const target = sum(list.map((g) => g.target))
  const saved = sum(rows.map((r) => Math.min(r.p.saved, r.g.target)))
  return {
    id: 'goals',
    title,
    period,
    landscape: true,
    sections: [
      {
        kind: 'kpis',
        items: [
          { label: 'Objetivos', value: list.length, type: 'int', sub: `${rows.filter((r) => r.p.status === 'done').length} conseguidos` },
          { label: 'Ahorrado', value: saved, type: 'money', tone: 'income', sub: `de ${c.money(target)}` },
          { label: 'Progreso', value: target ? saved / target : null, type: 'percent' },
        ],
      },
      {
        kind: 'table',
        title: 'Cómo va cada objetivo',
        columns: [
          col('Objetivo', 'text'),
          col('Meta'),
          col('Ahorrado'),
          col('Progreso', 'percent'),
          col('Falta'),
          col('Ritmo al mes'),
          col('Necesario al mes'),
          col('Fecha límite', 'date'),
          col('Llegada estimada', 'date'),
          col('Estado', 'text'),
        ],
        rows: rows.map(({ g, p }) => [
          g.name,
          g.target,
          p.saved,
          p.ratio,
          p.remaining,
          p.monthlyPace,
          p.monthlyNeeded,
          g.deadline ?? null,
          p.eta,
          GOAL_STATUS_LABEL[p.status],
        ]),
        colors: list.map((g) => g.color),
        total: [
          'Total',
          target,
          sum(rows.map((r) => r.p.saved)),
          target ? saved / target : null,
          sum(rows.map((r) => r.p.remaining)),
          null,
          null,
          null,
          null,
          null,
        ],
      },
    ],
  }
}

function leaks(c: Ctx): ReportDoc {
  const title = 'Fugas de dinero'
  const { settings } = c.input
  const found = detectLeaks(
    c.input.movements.filter((m) => m.date <= c.asOf),
    c.input.categories,
    c.asOf,
    { antMax: settings.leakAntMax ?? 5, dupDays: settings.leakDupDays ?? 2 },
  ).filter((l) => !c.input.categoryIds.length || (l.categoryId ? c.inScope(l.categoryId) : (l.categoryIds ?? []).some(c.inScope)))
  const period = `A ${fmtDate(c.asOf)}`
  if (!found.length) return { id: 'leaks', title, period, sections: [{ kind: 'text', text: 'No se han detectado fugas. Buen trabajo.' }] }
  const s = summarizeLeaks(found, c.input.decisions)
  const decision = new Map(c.input.decisions.map((d) => [d.id, d.status]))
  return {
    id: 'leaks',
    title,
    period,
    landscape: true,
    sections: [
      {
        kind: 'kpis',
        items: [
          { label: 'Por revisar', value: s.open.length, type: 'int' },
          { label: 'Coste al año por revisar', value: s.openYearly, type: 'money', tone: 'expense' },
          { label: 'Duplicados por revisar', value: s.openOnce, type: 'money', tone: 'expense' },
          { label: 'Ahorro de lo marcado para cancelar', value: s.cancelYearly, type: 'money', tone: 'income', sub: 'al año' },
        ],
      },
      {
        kind: 'table',
        title: 'Avisos',
        columns: [
          col('Tipo', 'text'),
          col('Aviso', 'text'),
          col('Detalle', 'text'),
          col('Coste'),
          col('Periodicidad', 'text'),
          col('Gravedad', 'text'),
          col('Decisión', 'text'),
        ],
        rows: found.map((l) => [
          LEAK_LABEL[l.type],
          l.title,
          l.detail,
          l.amount,
          l.period === 'year' ? 'al año' : 'puntual',
          SEVERITY[l.severity],
          decision.has(l.id) ? LEAK_STATUS[decision.get(l.id)!] : 'Por revisar',
        ]),
        colors: found.map((l) => (l.severity === 'high' ? REPORT_COLOR.expense : l.severity === 'medium' ? REPORT_COLOR.transfer : REPORT_COLOR.muted)),
      },
    ],
  }
}

/** La misma fecha un año antes (el 29 de febrero pasa a 28). */
function yearBefore(d: ISODate): ISODate {
  const y = String(+d.slice(0, 4) - 1).padStart(4, '0')
  const md = d.slice(5) === '02-29' ? '02-28' : d.slice(5)
  return `${y}-${md}`
}

function compare(c: Ctx): ReportDoc {
  const title = 'Comparativa con el año anterior'
  if (!c.range || !c.scoped.length) return empty(c, 'compare', title)
  const prev = { from: yearBefore(c.range.from), to: yearBefore(c.range.to) }
  const before = c.allScoped.filter((m) => m.date >= prev.from && m.date <= prev.to)
  const a = totals(c.scoped)
  const b = totals(before)
  const variation = (x: number, y: number) => (y ? (x - y) / Math.abs(y) : null)
  const line = (label: string, x: number, y: number): Cell[] => [label, x, y, x - y, variation(x, y)]
  const now = byRoot(c, c.scoped, 'expense')
  const then = new Map(byRoot(c, before, 'expense').map((r) => [r.id, r]))
  for (const r of then.values()) if (!now.some((x) => x.id === r.id)) now.push({ ...r, total: 0, count: 0 })
  const columns = [col('', 'text'), col('Este periodo'), col('Año anterior'), col('Diferencia'), col('Variación', 'percent')]
  const sections: Section[] = [
    {
      kind: 'text',
      text: `Se compara ${fmtDate(c.range.from)} – ${fmtDate(c.range.to)} con ${fmtDate(prev.from)} – ${fmtDate(prev.to)}.${before.length ? '' : ' No hay movimientos en el periodo anterior.'}`,
    },
    {
      kind: 'table',
      title: 'Totales',
      columns: [{ ...columns[0], label: 'Concepto' }, ...columns.slice(1)],
      rows: [
        line('Ingresos', a.income, b.income),
        line('Gastos', a.expense, b.expense),
        line('Balance', a.net, b.net),
        line('Apartado', -a.transfer, -b.transfer),
      ],
    },
  ]
  if (now.length) {
    const top = now.slice(0, 8)
    sections.push({
      kind: 'columns',
      title: 'Gasto por categoría',
      labels: top.map((r) => r.name),
      series: [
        { label: 'Este periodo', color: REPORT_COLOR.accent, values: top.map((r) => r.total) },
        { label: 'Año anterior', color: REPORT_COLOR.muted, values: top.map((r) => then.get(r.id)?.total ?? 0) },
      ],
    })
    sections.push({
      kind: 'table',
      title: 'Gastos por categoría',
      columns: [{ ...columns[0], label: 'Categoría' }, ...columns.slice(1)],
      rows: now.map((r) => line(r.name, r.total, then.get(r.id)?.total ?? 0)),
      colors: now.map((r) => r.color),
      total: line('Total', a.expense, b.expense),
    })
  }
  return { id: 'compare', title, period: c.period, sections }
}

function leverDetail(l: Lever, base: Baseline, c: Ctx, locale: string): string {
  switch (l.type) {
    case 'cut':
      return `${c.cat(l.categoryId)?.name ?? NO_CAT}: −${fmtPercent(l.pct, locale)}`
    case 'cap':
      return `${c.cat(l.categoryId)?.name ?? NO_CAT}: como mucho ${c.money(l.amount)} al mes (hoy ${c.money(base.expenseByCat.get(l.categoryId) ?? 0)})`
    case 'cancel':
      return l.label
    case 'income':
      return `${l.monthly >= 0 ? '+' : ''}${c.money(l.monthly)} al mes${l.fromMonth > 0 ? ` desde dentro de ${l.fromMonth} meses` : ''}`
    case 'oneoff':
      return `${l.label}: ${c.money(l.amount)} dentro de ${l.atMonth} meses`
    case 'invest':
      return `${fmtPercent(l.share, locale)} de lo acumulado al ${fmtPercent(l.rate, locale, 1)} anual`
  }
}

function lab(c: Ctx): ReportDoc {
  const title = 'Laboratorio: escenarios'
  const { movements, categories, scenarios, settings } = c.input
  const asOf = dataAsOf(movements, c.input.today).asOf
  const period = `Con la media de tus últimos meses, a ${fmtDate(asOf)}`
  if (!movements.length) return { id: 'lab', title, period, sections: [{ kind: 'text', text: 'Sin movimientos no hay con qué proyectar.' }] }
  const base = baselineFrom(movements, categories, asOf)
  const horizon = (levers: Lever[], a: typeof DEFAULT_ASSUMPTIONS) => {
    const p = project(base, levers, { ...a, years: 10 })
    const at = new Map(atHorizons(p.scenario).map((h) => [h.years, h.value]))
    return [p.monthlyScenario, ...[1, 3, 5, 10].map((y) => at.get(y) ?? null)]
  }
  const rows: Cell[][] = [['Tal cual (sin cambios)', ...horizon([], DEFAULT_ASSUMPTIONS)]]
  for (const s of scenarios) rows.push([s.name, ...horizon(s.levers, s.assumptions)])
  const levers: Cell[][] = scenarios.flatMap((s) =>
    s.levers.map((l): Cell[] => [s.name, LEVER_LABEL[l.type], leverDetail(l, base, c, settings.locale), leverMonthly(base, l) || null]),
  )
  const sections: Section[] = [
    {
      kind: 'kpis',
      items: [
        { label: 'Ingresos al mes', value: base.income, type: 'money', tone: 'income', sub: `media de ${base.months.length} meses` },
        { label: 'Gastos al mes', value: base.expenses, type: 'money', tone: 'expense' },
        { label: 'Te sobra al mes', value: base.income - base.expenses, type: 'money', tone: base.income >= base.expenses ? 'income' : 'expense' },
        { label: 'Apartas al mes', value: base.setAside, type: 'money', tone: 'transfer' },
      ],
    },
    {
      kind: 'table',
      title: 'Lo que tendrías',
      columns: [col('Escenario', 'text'), col('Sobra al mes'), col('En 1 año'), col('En 3 años'), col('En 5 años'), col('En 10 años')],
      rows,
      note: 'Cada escenario con sus supuestos (inflación, subida de sueldo y lo que tienes hoy); «Tal cual» con los de por defecto.',
    },
  ]
  if (levers.length)
    sections.push({
      kind: 'table',
      title: 'Palancas de cada escenario',
      columns: [col('Escenario', 'text'), col('Palanca', 'text'), col('Detalle', 'text'), col('Efecto al mes')],
      rows: levers,
    })
  else sections.push({ kind: 'text', text: 'No hay escenarios guardados: créalos en el Laboratorio y aparecerán aquí comparados.' })
  return { id: 'lab', title, period, sections }
}

const BUILDERS: Record<ReportId, (c: Ctx) => ReportDoc> = {
  summary,
  monthly,
  categories,
  matrix,
  concepts,
  movements: movementsList,
  budgets,
  recurring,
  goals,
  leaks,
  compare,
  lab,
}

/** Construye los informes pedidos con los mismos datos y periodo. */
export function buildReports(ids: ReportId[], input: ReportInput): { docs: ReportDoc[]; period: string } {
  const c = prepare(input)
  return { docs: ids.map((id) => BUILDERS[id](c)), period: c.period }
}
