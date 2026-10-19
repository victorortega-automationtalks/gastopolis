import { normalizeKey } from '../lib/text'
import { detectRecurring, type Cadence, type Recurring } from './recurring'
import type { Category, ISODate, LeakDecision, LeakStatus, Movement } from './types'

export type LeakType = 'subscription' | 'price' | 'overlap' | 'fees' | 'duplicate' | 'ant' | 'unclassified'

export const LEAK_LABEL: Record<LeakType, string> = {
  subscription: 'Suscripción',
  price: 'Subida de tarifa',
  overlap: 'Suscripciones solapadas',
  fees: 'Comisiones',
  duplicate: 'Cargo duplicado',
  ant: 'Gasto hormiga',
  unclassified: 'Sin clasificar',
}

export const LEAK_ICON: Record<LeakType, string> = {
  subscription: 'Repeat',
  price: 'TrendingUp',
  overlap: 'Tv',
  fees: 'Landmark',
  duplicate: 'Receipt',
  ant: 'Coffee',
  unclassified: 'CircleDashed',
}

export interface Leak {
  /** Estable entre análisis: las decisiones se guardan con este id. */
  id: string
  type: LeakType
  title: string
  detail: string
  /** Coste: anual (`period: 'year'`) o puntual (`'once'`, un duplicado). */
  amount: number
  period: 'year' | 'once'
  severity: 'high' | 'medium' | 'low'
  evidence: Movement[]
  categoryId?: string
  /** Para las que se resuelven en Movimientos (sin clasificar, comisiones). */
  categoryIds?: string[]
  /** El cargo sobrante de un duplicado: se puede borrar desde la fuga. */
  duplicateId?: string
}

export interface LeakOptions {
  /** Importe máximo de un gasto hormiga. */
  antMax: number
  /** Días entre dos cargos iguales para considerarlos duplicados. */
  dupDays: number
}

const DAY = 86_400_000
const toMs = (d: ISODate) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))
const fromMs = (t: number): ISODate => new Date(t).toISOString().slice(0, 10)
const PER_YEAR: Record<Cadence, number> = { weekly: 52, monthly: 12, quarterly: 4, yearly: 1 }

/** Por encima de esto al mes no es una suscripción olvidable (alquiler, seguro, colegio…). */
const SUBSCRIPTION_MONTHLY_MAX = 60
const FEE_RE = /comision|mantenimiento (de )?cuenta|cuota (de )?(tarjeta|mantenimiento)|descubierto|intereses deudores|gastos de (gestion|correo)|cargo por/
const FEE_CATEGORY_RE = /comision|banco|bancari/
const UNCLASSIFIED_CATEGORY_RE = /^(otros|otras|varios|sin categoria|miscelanea)$/
const UNCLASSIFIED_CONCEPT_RE = /^[?¿\s.-]*$/

/** Servicios que hacen lo mismo: tener dos a la vez suele ser una fuga. */
const OVERLAP_GROUPS: { name: string; re: RegExp }[] = [
  { name: 'vídeo en streaming', re: /netflix|hbo|max\b|disney|prime video|filmin|movistar\+?|skyshowtime|apple tv|dazn/ },
  { name: 'música en streaming', re: /spotify|apple music|tidal|deezer|youtube music|amazon music/ },
  { name: 'almacenamiento en la nube', re: /icloud|google one|dropbox|onedrive|mega\b/ },
  { name: 'gimnasio', re: /gimnasio|gym|basic-?fit|fitness|mcfit|altafit|anytime/ },
]

const severity = (yearly: number): Leak['severity'] => (yearly >= 200 ? 'high' : yearly >= 60 ? 'medium' : 'low')
const monthlyOf = (r: Recurring) => (r.amount * PER_YEAR[r.cadence]) / 12

export function detectLeaks(movements: Movement[], categories: Category[], asOf: ISODate, opts: LeakOptions): Leak[] {
  const yearAgo = fromMs(toMs(asOf) - 365 * DAY)
  const quarterAgo = fromMs(toMs(asOf) - 91 * DAY)
  const upTo = movements.filter((m) => m.date <= asOf)
  const expenses = upTo.filter((m) => m.kind === 'expense')
  const catName = new Map(categories.map((c) => [c.id, normalizeKey(c.name)]))
  const leaks: Leak[] = []
  const allRecurring = detectRecurring(upTo, asOf)
  const recurring = allRecurring.filter((r) => r.active)
  // Gastos del último año por concepto, de más reciente a más antiguo: se agrupan una vez (con miles de movimientos,
  // filtrar la lista entera por cada aviso se nota).
  const lastYearByKey = new Map<string, Movement[]>()
  for (const m of expenses) {
    if (m.date <= yearAgo) continue
    const g = lastYearByKey.get(m.conceptKey)
    if (g) g.push(m)
    else lastYearByKey.set(m.conceptKey, [m])
  }
  for (const g of lastYearByKey.values()) g.sort((a, b) => b.date.localeCompare(a.date))
  const evidenceOf = (key: string) => [...(lastYearByKey.get(key) ?? [])]

  // Suscripciones: cuotas pequeñas y fijas que conviene revisar de vez en cuando (la luz o el agua varían: no se olvidan).
  for (const r of recurring) {
    if (!r.fixed || monthlyOf(r) > SUBSCRIPTION_MONTHLY_MAX) continue
    leaks.push({
      id: `sub:${r.conceptKey}`,
      type: 'subscription',
      title: r.label,
      detail: `Cargo ${r.cadence === 'monthly' ? 'mensual' : r.cadence === 'weekly' ? 'semanal' : r.cadence === 'quarterly' ? 'trimestral' : 'anual'} desde hace ${r.occurrences.length} pagos. ¿Lo sigues usando?`,
      amount: r.yearly,
      period: 'year',
      severity: severity(r.yearly),
      evidence: evidenceOf(r.conceptKey),
      categoryId: r.categoryId,
    })
  }

  // Subidas de tarifa del último año.
  for (const r of recurring) {
    for (const c of r.priceChanges) {
      if (c.to <= c.from || c.date <= yearAgo) continue
      const extra = (c.to - c.from) * PER_YEAR[r.cadence]
      leaks.push({
        id: `price:${r.conceptKey}:${c.date}`,
        type: 'price',
        title: `${r.label} ha subido`,
        detail: `De ${c.from.toFixed(2).replace('.', ',')} € a ${c.to.toFixed(2).replace('.', ',')} € desde ${c.date.split('-').reverse().join('/')}.`,
        amount: extra,
        period: 'year',
        severity: severity(extra * 3),
        evidence: evidenceOf(r.conceptKey).slice(0, 6),
        categoryId: r.categoryId,
      })
    }
  }

  // Varias suscripciones que hacen lo mismo.
  for (const g of OVERLAP_GROUPS) {
    const hits = recurring.filter((r) => g.re.test(r.conceptKey))
    if (hits.length < 2) continue
    const yearly = hits.reduce((a, r) => a + r.yearly, 0)
    leaks.push({
      id: `overlap:${g.name}:${hits
        .map((r) => r.conceptKey)
        .sort()
        .join('+')}`,
      type: 'overlap',
      title: `${hits.length} servicios de ${g.name}`,
      detail: `${hits.map((r) => r.label).join(', ')}. ¿Necesitas todos a la vez?`,
      amount: yearly,
      period: 'year',
      severity: severity(yearly / 2),
      evidence: hits.flatMap((r) => evidenceOf(r.conceptKey).slice(0, 2)),
    })
  }

  // Comisiones bancarias del último año (anualizadas si hay menos datos).
  const fees = expenses.filter((m) => m.date > yearAgo && (FEE_RE.test(m.conceptKey) || FEE_CATEGORY_RE.test(catName.get(m.categoryId) ?? '')))
  if (fees.length) {
    const total = fees.reduce((a, m) => a - m.amount, 0)
    const first = fees.reduce((min, m) => (m.date < min ? m.date : min), asOf)
    const covered = Math.max(1, Math.min(12, (toMs(asOf) - toMs(first)) / DAY / 30.4375 + 1))
    const yearly = (total / covered) * 12
    leaks.push({
      id: 'fees',
      type: 'fees',
      title: 'Comisiones del banco',
      detail: `${fees.length} cargos en el último año. Muchos bancos las quitan si domicilias la nómina o pides la cuenta sin comisiones.`,
      amount: yearly,
      period: 'year',
      severity: severity(yearly),
      evidence: fees.sort((a, b) => b.date.localeCompare(a.date)),
      categoryIds: [...new Set(fees.map((m) => m.categoryId))],
    })
  }

  // Cargos duplicados: mismo concepto e importe en pocos días (no recurrentes, que caen a semanas de distancia).
  const recentExp = expenses.filter((m) => m.date > yearAgo && -m.amount > opts.antMax).sort((a, b) => a.date.localeCompare(b.date))
  const byKey = new Map<string, Movement[]>()
  for (const m of recentExp) {
    const k = `${m.conceptKey}|${m.amount.toFixed(2)}`
    const list = byKey.get(k) ?? []
    list.push(m)
    byKey.set(k, list)
  }
  for (const list of byKey.values()) {
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1]
      const b = list[i]
      if ((toMs(b.date) - toMs(a.date)) / DAY > opts.dupDays) continue
      leaks.push({
        id: `dup:${a.id}:${b.id}`,
        type: 'duplicate',
        title: `${b.concept}, dos veces`,
        detail: `El mismo importe el ${a.date.split('-').reverse().join('/')} y el ${b.date.split('-').reverse().join('/')}. Si es un error del comercio o de la importación, reclámalo o borra el sobrante.`,
        amount: -b.amount,
        period: 'once',
        severity: severity(-b.amount * 2),
        evidence: [a, b],
        categoryId: b.categoryId,
        duplicateId: b.id,
      })
    }
  }

  // Gasto hormiga: muchas compras pequeñas en los últimos 3 meses (sin contar cuotas: esas ya son suscripciones).
  const recurringKeys = new Set(allRecurring.map((r) => r.conceptKey))
  const ants = expenses.filter((m) => m.date > quarterAgo && -m.amount <= opts.antMax && !recurringKeys.has(m.conceptKey))
  const antTotal = ants.reduce((a, m) => a - m.amount, 0)
  const antMonthly = antTotal / 3
  if (ants.length >= 6 && antMonthly >= 20) {
    const top = [...ants.reduce((acc, m) => acc.set(m.concept, (acc.get(m.concept) ?? 0) + 1), new Map<string, number>())]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([c]) => c)
    leaks.push({
      id: 'ant',
      type: 'ant',
      title: 'Gasto hormiga',
      detail: `${Math.round(ants.length / 3)} compras de menos de ${opts.antMax} € al mes, sobre todo ${top.join(', ')}. Al año suman más de lo que parece.`,
      amount: antMonthly * 12,
      period: 'year',
      severity: severity(antMonthly * 12),
      evidence: ants.sort((a, b) => b.date.localeCompare(a.date)),
    })
  }

  // Dinero sin clasificar: no se puede decidir sobre lo que no se sabe a dónde fue.
  const quarterExp = expenses.filter((m) => m.date > quarterAgo)
  const quarterTotal = quarterExp.reduce((a, m) => a - m.amount, 0)
  const unclassified = quarterExp.filter((m) => UNCLASSIFIED_CATEGORY_RE.test(catName.get(m.categoryId) ?? '') || UNCLASSIFIED_CONCEPT_RE.test(m.concept))
  const unTotal = unclassified.reduce((a, m) => a - m.amount, 0)
  if (unclassified.length && unTotal >= 30 && unTotal / Math.max(quarterTotal, 1e-9) >= 0.08) {
    leaks.push({
      id: 'unclassified',
      type: 'unclassified',
      title: 'Gasto sin clasificar',
      detail: `${unclassified.length} gastos en «Otros» o sin concepto en los últimos 3 meses (${Math.round((unTotal / quarterTotal) * 100)} % del total). Clasificarlos ayuda a ver fugas reales.`,
      amount: unTotal * 4,
      period: 'year',
      severity: severity(unTotal * 4),
      evidence: unclassified.sort((a, b) => b.date.localeCompare(a.date)),
      categoryIds: [...new Set(unclassified.map((m) => m.categoryId))],
    })
  }

  const order: Record<Leak['severity'], number> = { high: 0, medium: 1, low: 2 }
  return leaks.sort((a, b) => order[a.severity] - order[b.severity] || b.amount - a.amount)
}

export interface LeakSummary {
  open: Leak[]
  decided: { leak: Leak; status: LeakStatus }[]
  /** Por revisar, al año. */
  openYearly: number
  /** Duplicados por revisar (puntuales). */
  openOnce: number
  /** Lo marcado para cancelar: lo que se ahorraría al año. */
  cancelYearly: number
}

export function summarizeLeaks(leaks: Leak[], decisions: LeakDecision[]): LeakSummary {
  const byId = new Map(decisions.map((d) => [d.id, d]))
  const open: Leak[] = []
  const decided: LeakSummary['decided'] = []
  for (const l of leaks) {
    const d = byId.get(l.id)
    if (d) decided.push({ leak: l, status: d.status })
    else open.push(l)
  }
  return {
    open,
    decided,
    openYearly: open.filter((l) => l.period === 'year').reduce((a, l) => a + l.amount, 0),
    openOnce: open.filter((l) => l.period === 'once').reduce((a, l) => a + l.amount, 0),
    cancelYearly: decided.filter((d) => d.status === 'cancel' && d.leak.period === 'year').reduce((a, d) => a + d.leak.amount, 0),
  }
}
