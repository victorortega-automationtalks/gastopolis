import { normalizeKey } from '../lib/text'
import { signFor } from '../model/aggregate'
import { classify, type AutoContext } from '../model/autocat'
import type { CompiledRules } from '../model/rules'
import type { Account, BankLink, Category, ISODate, Kind, Movement } from '../model/types'
import type { EbSession, EbTransaction } from './enablebanking'

/**
 * Sincronización con el banco, sin efectos: qué pedir, cómo convertir lo que llega en movimientos y cómo encajarlo con
 * lo que ya hay (sin duplicar lo apuntado a mano o importado, y sin contar dos veces un traspaso entre tus cuentas).
 */

const DAY = 86_400_000
const toMs = (d: ISODate) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))
const iso = (t: number): ISODate => new Date(t).toISOString().slice(0, 10)

/** Días que se vuelven a mirar antes de lo ya traído: los bancos a veces asientan con fecha de días atrás. */
export const OVERLAP_DAYS = 7
/** Primera vez: hasta dos años atrás (el banco recorta a lo que permita; muchos dan 90 días). */
export const FIRST_SYNC_DAYS = 730
/** Más a menudo que esto, solo si lo pides tú: PSD2 permite cuatro lecturas al día sin ti delante. */
export const MIN_AUTO_HOURS = 6

/**
 * Qué rango pedir. Si ya hay movimientos traídos hasta un día, solo desde unos días antes de ese día: con seis meses
 * ya en casa no se vuelve a pedir todo, solo lo último.
 */
export function fetchRange(link: Pick<BankLink, 'syncedThrough'>, today: ISODate): { dateFrom: ISODate; dateTo: ISODate } {
  const from = link.syncedThrough ? toMs(link.syncedThrough) - OVERLAP_DAYS * DAY : toMs(today) - FIRST_SYNC_DAYS * DAY
  return { dateFrom: iso(Math.min(from, toMs(today))), dateTo: today }
}

/** Le toca sincronizarse sola: permiso vigente y han pasado las horas configuradas (6 como mínimo). */
export function isDue(link: Pick<BankLink, 'validUntil' | 'lastSyncAt'>, now: number, hours: number): boolean {
  if (Date.parse(link.validUntil) <= now) return false
  const every = Math.max(MIN_AUTO_HOURS, hours) * 3_600_000
  return !link.lastSyncAt || now - link.lastSyncAt >= every
}

/** Horas entre dos sincronizaciones forzadas a mano: cada lectura gasta del cupo diario del banco. */
export const MANUAL_EVERY_HOURS = 24

/** ¿Se puede forzar ya la sincronización de esta cuenta? Si no, desde cuándo. */
export function manualSync(link: Pick<BankLink, 'validUntil' | 'manualSyncAt'>, now: number): { ok: boolean; nextAt?: number } {
  if (Date.parse(link.validUntil) <= now) return { ok: false }
  const nextAt = (link.manualSyncAt ?? 0) + MANUAL_EVERY_HOURS * 3_600_000
  return nextAt <= now ? { ok: true } : { ok: false, nextAt }
}

export type ConsentState = 'ok' | 'expiring' | 'expired'

/** Estado del permiso del banco: avisa una semana antes de que caduque. */
export function consentState(link: Pick<BankLink, 'validUntil'>, now: number, warnDays = 7): { state: ConsentState; daysLeft: number } {
  const left = (Date.parse(link.validUntil) - now) / DAY
  return { state: left <= 0 ? 'expired' : left <= warnDays ? 'expiring' : 'ok', daysLeft: Math.max(0, Math.ceil(left)) }
}

/**
 * Hasta cuándo pedir el permiso: lo máximo que admite el banco (180 días de tope, 90 si no lo dice) menos un día. Pedir
 * justo el máximo falla («ASPSP does not support consent validity more than 15552000 seconds») con que el reloj del
 * equipo vaya un poco adelantado.
 */
export function consentUntil(now: number, maxSeconds?: number): string {
  const days = Math.min(180, maxSeconds ? Math.floor(maxSeconds / 86_400) : 90)
  return new Date(now + Math.max(1, days - 1) * DAY).toISOString()
}

/** Si el banco rechaza la duración del permiso, el máximo que dice admitir (en segundos). */
export function consentLimit(message: string): number | undefined {
  const m = /consent validity more than (\d+) seconds/i.exec(message)
  return m ? Number(m[1]) : undefined
}

/** «ES12 3456 7890 1234 5678 9012» → «ES12 •••• 9012». */
export function maskIban(iban?: string): string | undefined {
  if (!iban) return undefined
  const s = iban.replace(/\s+/g, '')
  return s.length > 8 ? `${s.slice(0, 4)} •••• ${s.slice(-4)}` : s
}

// ── Conceptos ────────────────────────────────────────────────────────────────

const NOISE = [
  /^(compra|pago) (con )?(tarj(eta)?\.?|tj\.?)( (credito|debito|crédito|débito))?( en)?\s*/i,
  /^pago (movil|móvil|contactless|con movil|con móvil) en\s*/i,
  /^(adeudo|cargo) (recibo|domiciliacion|domiciliación|por domiciliación)( de)?\s*/i,
  /^recibo( de)?\s*/i,
  /^transf(erencia)?\.?( recibida| emitida| inmediata| sepa)?( de| a favor de| a)?\s+/i,
  /^bizum( recibido| enviado)?( de| a)?\s+/i,
  /^card transaction:?\s*/i,
]

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s.\-/'(])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())

/**
 * Concepto legible a partir de lo que manda el banco: sin «COMPRA TARJ. 4012XXXXXXXX1234», sin la tarjeta enmascarada
 * ni la fecha que algunos bancos repiten, y sin gritar (las mayúsculas pasan a tipo título).
 */
export function cleanConcept(raw: string): string {
  let s = raw.replace(/\s+/g, ' ').trim()
  s = s.replace(/\b\d{4,6}[X*•]{4,}\d{3,4}\b/gi, ' ').replace(/\b(fecha|fec\.?)\s*(oper(acion|ación)?\.?)?\s*\d{2}[/-]\d{2}([/-]\d{2,4})?/gi, ' ')
  for (const re of NOISE) s = s.replace(re, '')
  s = s.replace(/\s+/g, ' ').replace(/^[\s,.:;-]+|[\s,:;-]+$/g, '')
  if (s && s === s.toUpperCase() && /\p{L}/u.test(s)) s = titleCase(s)
  return s || raw.trim() || 'Movimiento del banco'
}

/** Texto del movimiento: la contraparte y la información del pago, sin repetir. */
function rawText(tx: EbTransaction): string {
  const debit = tx.credit_debit_indicator === 'DBIT'
  const party = (debit ? tx.creditor?.name : tx.debtor?.name) ?? ''
  const info = (tx.remittance_information ?? []).filter(Boolean).join(' ')
  const extra = tx.bank_transaction_code?.description ?? tx.note ?? ''
  if (party && info && !normalizeKey(info).includes(normalizeKey(party))) return `${party} ${info}`.trim()
  return (info || party || extra).trim()
}

// ── Conversión y conciliación ────────────────────────────────────────────────

export interface Draft {
  externalId: string
  date: ISODate
  /** Con signo del banco: negativo, sale; positivo, entra. */
  amount: number
  concept: string
  /** Texto original del banco, si se ha limpiado. */
  raw?: string
}

/** Movimientos asentados del banco (los pendientes se esperan a que se asienten: cambian de importe o desaparecen). */
export function toDrafts(txs: EbTransaction[]): Draft[] {
  const seen = new Map<string, number>()
  const out: Draft[] = []
  for (const tx of txs) {
    if (tx.status && tx.status !== 'BOOK') continue
    const date = (tx.booking_date ?? tx.value_date ?? tx.transaction_date ?? '').slice(0, 10)
    const value = Number(tx.transaction_amount?.amount)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(value)) continue
    const amount = (tx.credit_debit_indicator === 'DBIT' ? -1 : 1) * Math.abs(value)
    const raw = rawText(tx)
    const concept = cleanConcept(raw)
    let key = tx.entry_reference || tx.transaction_id
    if (!key) {
      // Sin identificador del banco: fecha, importe y texto, y un contador para dos compras iguales el mismo día.
      const base = `${date}|${amount.toFixed(2)}|${normalizeKey(raw)}`
      const n = (seen.get(base) ?? 0) + 1
      seen.set(base, n)
      key = `h:${base}#${n}`
    }
    out.push({ externalId: `eb:${key}`, date, amount, concept, raw: raw && raw !== concept ? raw : undefined })
  }
  return out
}

export interface Categorizer {
  rules: CompiledRules
  categories: Category[]
  /** Movimientos ya guardados, para repetir la categoría que tuvo el mismo concepto. */
  history: Movement[]
  fallback: { expense: string; income: string }
  /** Clasificación automática (catálogo de comercios y pistas de tus datos) y el id de cada categoría propuesta. */
  auto?: { ctx: AutoContext; ids: Map<string, string> }
}

/**
 * Categoría para un movimiento nuevo: tus reglas; luego la que tuvo ese concepto (con el mismo sentido) si la elegiste
 * tú o el catálogo, no si se quedó «sin clasificar»; luego la clasificación automática; y si no, «sin clasificar».
 */
export function categorize(d: Draft, c: Categorizer): Category {
  const byId = new Map(c.categories.map((x) => [x.id, x]))
  const sign: Kind = d.amount < 0 ? 'expense' : 'income'
  const fits = (cat?: Category) => !!cat && (cat.kind === sign || cat.kind === 'transfer')
  const byRule = byId.get(c.rules.categoryFor(d.concept, sign, d.amount) ?? '')
  if (fits(byRule)) return byRule!
  const key = normalizeKey(d.concept)
  const reserve = new Set([c.fallback.expense, c.fallback.income])
  const sameSign = (m: Movement) => Math.sign(m.amount) === Math.sign(d.amount) && !reserve.has(m.categoryId)
  // Igual, o el mismo comercio escrito de otra forma («Mercadona S.A.» y «Mercadona»): uno empieza por el otro, o
  // comparten la primera palabra (de 4 letras o más).
  const first = key.split(' ')[0]
  const prev =
    c.history.find((m) => m.conceptKey === key && sameSign(m)) ??
    c.history.find((m) => sameSign(m) && m.conceptKey.length >= 4 && (key.startsWith(m.conceptKey) || m.conceptKey.startsWith(key))) ??
    (first.length >= 4 ? c.history.find((m) => sameSign(m) && m.conceptKey.split(' ')[0] === first) : undefined)
  const byHistory = byId.get(prev?.categoryId ?? '')
  if (fits(byHistory)) return byHistory!
  const guess = c.auto && classify(d, c.auto.ctx)
  const byAuto = guess && byId.get(c.auto!.ids.get(guess.key) ?? '')
  if (fits(byAuto)) return byAuto!
  return byId.get(c.fallback[sign])!
}

export interface SyncPlan {
  /** Movimientos nuevos para guardar. */
  added: Movement[]
  /** Movimientos que ya estaban (apuntados a mano o importados) y son estos del banco: se les asocia la cuenta y el id. */
  linked: { id: string; externalId: string }[]
  /** Ya traídos antes. */
  skipped: number
  /** Último día traído. */
  through?: ISODate
}

/**
 * Encaja lo que llega del banco con lo que ya hay. Lo ya traído (mismo id) se salta. Lo que coincide en importe y en
 * fecha (±3 días) con un movimiento sin banco que no sea de efectivo se considera el mismo: se enlaza en vez de
 * duplicarlo. El resto entra nuevo, con la categoría de las reglas o de su historial.
 */
export function reconcile(
  drafts: Draft[],
  account: Pick<Account, 'id'>,
  existing: Movement[],
  accounts: Pick<Account, 'id' | 'kind'>[],
  cat: Categorizer,
  now = Date.now(),
): SyncPlan {
  const cash = new Set(accounts.filter((a) => a.kind === 'cash').map((a) => a.id))
  const known = new Set(existing.filter((m) => m.externalId).map((m) => m.externalId!))
  // Candidatos a ser «el mismo» que uno del banco: sin id de banco, de esta cuenta o sin cuenta, y nunca de efectivo.
  const candidates = existing.filter((m) => !m.externalId && (!m.accountId || m.accountId === account.id) && !(m.accountId && cash.has(m.accountId)))
  const byCents = new Map<number, Movement[]>()
  for (const m of candidates) {
    const k = Math.round(m.amount * 100)
    const list = byCents.get(k)
    if (list) list.push(m)
    else byCents.set(k, [m])
  }
  const used = new Set<string>()
  const plan: SyncPlan = { added: [], linked: [], skipped: 0 }
  for (const d of drafts) {
    if (!plan.through || d.date > plan.through) plan.through = d.date
    if (known.has(d.externalId)) {
      plan.skipped++
      continue
    }
    known.add(d.externalId)
    const same = (byCents.get(Math.round(d.amount * 100)) ?? [])
      .filter((m) => !used.has(m.id) && Math.abs(toMs(m.date) - toMs(d.date)) <= 3 * DAY)
      .sort((a, b) => Math.abs(toMs(a.date) - toMs(d.date)) - Math.abs(toMs(b.date) - toMs(d.date)))[0]
    if (same) {
      used.add(same.id)
      plan.linked.push({ id: same.id, externalId: d.externalId })
      continue
    }
    const c = categorize(d, cat)
    plan.added.push({
      id: '',
      date: d.date,
      amount: c.kind === 'transfer' ? d.amount : signFor(c.kind, d.amount),
      kind: c.kind,
      concept: d.concept,
      conceptKey: normalizeKey(d.concept),
      categoryId: c.id,
      tags: [],
      notes: d.raw,
      source: 'bank',
      createdAt: now,
      accountId: account.id,
      externalId: d.externalId,
    })
  }
  return plan
}

/**
 * Traspasos entre tus propias cuentas (sale de una, entra en otra el mismo importe en ±3 días): si no, contarían como
 * gasto y como ingreso. Devuelve las parejas de ids que hay que pasar a la categoría de traspasos.
 */
export function internalTransfers(
  movements: Pick<Movement, 'id' | 'date' | 'amount' | 'accountId' | 'kind' | 'source'>[],
  bankAccounts: Set<string>,
): [string, string][] {
  const outs = movements.filter((m) => m.amount < 0 && m.kind !== 'transfer' && m.accountId && bankAccounts.has(m.accountId))
  const ins = movements.filter((m) => m.amount > 0 && m.kind !== 'transfer' && m.accountId && bankAccounts.has(m.accountId))
  const used = new Set<string>()
  const pairs: [string, string][] = []
  for (const o of outs) {
    const match = ins.find(
      (i) =>
        !used.has(i.id) &&
        i.accountId !== o.accountId &&
        Math.round(i.amount * 100) === -Math.round(o.amount * 100) &&
        Math.abs(toMs(i.date) - toMs(o.date)) <= 3 * DAY,
    )
    if (match) {
      used.add(match.id)
      pairs.push([o.id, match.id])
    }
  }
  return pairs
}

// ── Conectar ─────────────────────────────────────────────────────────────────

export interface OfferedAccount {
  uid: string
  name: string
  ibanMasked?: string
  currency: string
  identificationHash?: string
  /** Cuenta que ya existe en la app y es esta (al renovar o reconectar). */
  existingId?: string
}

/** Las cuentas de la sesión, reconociendo las que ya tienes (por su huella estable o su IBAN). */
export function offeredAccounts(session: EbSession, accounts: Account[]): OfferedAccount[] {
  return session.accounts.map((a) => {
    const iban = a.account_id?.iban ?? undefined
    const masked = maskIban(iban)
    const match = accounts.find(
      (x) =>
        x.bank &&
        x.bank.aspsp.name === session.aspsp.name &&
        ((a.identification_hash && x.bank.identificationHash === a.identification_hash) || (masked && x.bank.ibanMasked === masked)),
    )
    const fallbackName = `${session.aspsp.name}${masked ? ` ${masked.slice(-4)}` : ''}`
    return {
      uid: a.uid,
      name: a.name || a.product || fallbackName,
      ibanMasked: masked,
      currency: a.currency ?? 'EUR',
      identificationHash: a.identification_hash,
      existingId: match?.id,
    }
  })
}
