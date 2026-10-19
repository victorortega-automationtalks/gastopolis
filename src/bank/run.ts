import { db } from '../data/db'
import { applyBankSync, bankFallbacks, createAccount, ensureAutoCategory, updateBankLink } from '../data/repo'
import { errorMessage } from '../lib/errors'
import { newId } from '../lib/id'
import { autoContext, classify } from '../model/autocat'
import { isoOf } from '../model/period'
import { compileRules } from '../model/rules'
import type { BankLink, BankSecret, Movement } from '../model/types'
import { bankAuthWindow, bankRequest, bankSupported, openExternal } from '../platform'
import { ebClient, EbError, parseCallback, type Aspsp, type EbClient, type EbSession, type EbTransport } from './enablebanking'
import {
  categorize,
  consentLimit,
  consentUntil,
  fetchRange,
  internalTransfers,
  isDue,
  manualSync,
  reconcile,
  toDrafts,
  type Categorizer,
  type OfferedAccount,
} from './sync'

export { offeredAccounts, type OfferedAccount } from './sync'

/**
 * Lo que mueve la sincronización: leer del banco, encajar y guardar. La lógica está en `sync.ts` (pura, con tests);
 * aquí solo se encadena con la red (Rust) y la base de datos (repo).
 */

/** Banco simulado para desarrollo y pruebas (nunca va en la app que se instala). */
const MOCK_MODE = import.meta.env.VITE_BANK_MOCK as string | undefined
const MOCK = MOCK_MODE === '1' || MOCK_MODE === 'window'

/** La conexión con el banco existe aquí (app de Windows, o el banco simulado). */
export const bankEnabled = bankSupported || MOCK

/**
 * Dirección de vuelta por defecto. Enable Banking exige https y un dominio de verdad (no acepta localhost). No hace
 * falta que exista: la ventana del banco de la app la intercepta antes de cargarla. `.invalid` es un dominio reservado
 * que nunca resuelve, así que, si se usara el navegador, el código tampoco llegaría a ningún servidor.
 */
export const DEFAULT_REDIRECT = 'https://gastopolis.invalid/callback'

async function transport(secret: BankSecret): Promise<EbTransport> {
  if (MOCK) return (await import('./mock')).mockTransport
  return (req) =>
    bankRequest({
      appId: secret.appId,
      keyPem: secret.privateKeyPem,
      method: req.method,
      path: req.path,
      query: req.query ? Object.entries(req.query) : [],
      body: req.body,
    })
}

export async function bankClient(secret?: BankSecret): Promise<EbClient> {
  const s = secret ?? (await db.secrets.get('enablebanking'))
  if (!s) throw new Error('Falta configurar Enable Banking (Cuentas → Configurar).')
  return ebClient(await transport(s))
}

// ── Sincronizar ──────────────────────────────────────────────────────────────

export interface SyncOutcome {
  account: string
  added: number
  linked: number
  transfers: number
  error?: string
}

const busy = new Set<string>()

/**
 * Trae lo nuevo de una cuenta: solo desde unos días antes de lo último traído. `manual`: la ha pedido el usuario; se
 * permite una al día por cuenta (gasta del cupo del banco), y se apunta aunque falle.
 */
export async function syncAccount(accountId: string, opts: { manual?: boolean } = {}): Promise<SyncOutcome> {
  const account = await db.accounts.get(accountId)
  if (!account?.bank) throw new Error('Esa cuenta no está conectada a un banco')
  if (busy.has(accountId)) return { account: account.name, added: 0, linked: 0, transfers: 0 }
  if (opts.manual && !manualSync(account.bank, Date.now()).ok)
    return { account: account.name, added: 0, linked: 0, transfers: 0, error: 'Ya la has sincronizado a mano hoy: vuelve a probar mañana.' }
  const manual = opts.manual ? { manualSyncAt: Date.now() } : {}
  busy.add(accountId)
  try {
    const client = await bankClient()
    const today = isoOf(new Date())
    const range = fetchRange(account.bank, today)
    const txs = await client.transactions(account.bank.accountUid, range)
    const balance = await client.balance(account.bank.accountUid).catch(() => undefined)
    const fallback = await bankFallbacks()
    const drafts = toDrafts(txs)
    const [existing, categories, rules, accounts] = await Promise.all([
      db.movements.toArray(),
      db.categories.toArray(),
      db.rules.toArray(),
      db.accounts.toArray(),
    ])
    const history = [...existing].sort((a, b) => (a.date < b.date ? 1 : -1))
    const base: Categorizer = { rules: compileRules(rules, categories), categories, history, fallback }
    // Clasificación automática para lo que tus reglas y tu historial no resuelven: pistas de todo lo que hay (tu
    // nombre, quién te paga) y solo se crean las categorías que de verdad se van a usar.
    const ctx = autoContext([...existing, ...drafts])
    const ids = new Map<string, string>()
    const reserve = new Set([fallback.expense, fallback.income])
    for (const d of drafts) {
      const auto = classify(d, ctx)
      if (auto && !ids.has(auto.key) && reserve.has(categorize(d, base).id)) ids.set(auto.key, await ensureAutoCategory(auto))
    }
    const cats = ids.size ? await db.categories.toArray() : categories
    const plan = reconcile(drafts, account, existing, accounts, { ...base, categories: cats, auto: { ctx, ids } })
    for (const m of plan.added) m.id = newId()
    // Traspasos entre cuentas propias: lo nuevo contra lo reciente de todas las cuentas del banco.
    const banks = new Set(accounts.filter((a) => a.bank).map((a) => a.id))
    const added = new Set(plan.added.map((m) => m.id))
    const recent: Movement[] = [...existing.filter((m) => m.accountId && banks.has(m.accountId) && m.date >= range.dateFrom), ...plan.added]
    const pairs = internalTransfers(recent, banks).filter(([a, b]) => added.has(a) || added.has(b))
    await applyBankSync(
      account.id,
      plan,
      { pairs, categoryId: fallback.transfer },
      { lastSyncAt: Date.now(), syncedThrough: range.dateTo, lastError: undefined, balance, ...manual },
    )
    return { account: account.name, added: plan.added.length, linked: plan.linked.length, transfers: pairs.length }
  } catch (e) {
    const expired = e instanceof EbError && e.expired
    await updateBankLink(accountId, { lastError: errorMessage(e), ...manual, ...(expired ? { validUntil: new Date().toISOString() } : {}) })
    return { account: account.name, added: 0, linked: 0, transfers: 0, error: errorMessage(e) }
  } finally {
    busy.delete(accountId)
  }
}

/** Sincroniza las cuentas a las que les toca o, con `manual`, todas las que aún no se han forzado hoy. */
export async function syncAccounts(opts: { manual?: boolean } = {}): Promise<SyncOutcome[]> {
  if (!bankEnabled) return []
  const [accounts, settings, secret] = await Promise.all([db.accounts.toArray(), db.settings.get('settings'), db.secrets.get('enablebanking')])
  if (!secret) return []
  const now = Date.now()
  const due = accounts.filter((a) => a.bank && !a.archived && (opts.manual ? manualSync(a.bank, now).ok : isDue(a.bank, now, settings?.bankSyncHours ?? 6)))
  const out: SyncOutcome[] = []
  for (const a of due) out.push(await syncAccount(a.id, { manual: opts.manual }))
  return out
}

// ── Conectar y renovar ───────────────────────────────────────────────────────

export async function listBanks(country: string): Promise<Aspsp[]> {
  const banks = await (await bankClient()).aspsps(country)
  return banks.sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

export interface AuthHandle {
  /** Dirección de la página del banco (para abrirla en el navegador si la ventana de la app no sirve). */
  onUrl?: (url: string) => void
  /** Si se ha pasado al navegador, cerrar la ventana de la app no cancela: se espera a que se pegue la dirección. */
  usingBrowser?: () => boolean
}

/**
 * Permiso de lectura en el banco. En Windows, en una ventana de la app que recoge la vuelta sola; si no, o si el
 * usuario prefiere el navegador, `pasted` resuelve con la dirección que pegue.
 */
export async function authorize(aspsp: Aspsp, pasted: Promise<string>, handle: AuthHandle = {}): Promise<EbSession> {
  const secret = await db.secrets.get('enablebanking')
  if (!secret) throw new Error('Falta configurar Enable Banking')
  const client = await bankClient(secret)
  const state = newId()
  const begin = (maxSeconds?: number) =>
    client.startAuth({
      aspsp: { name: aspsp.name, country: aspsp.country },
      validUntil: consentUntil(Date.now(), maxSeconds),
      redirectUrl: secret.redirectUrl,
      state,
    })
  // Si el banco admite menos días de los que anuncia, lo dice en el error: se vuelve a pedir con su máximo.
  const url = await begin(aspsp.maximum_consent_validity).catch((e: unknown) => {
    const limit = consentLimit(errorMessage(e))
    if (!limit) throw e
    return begin(limit)
  })
  handle.onUrl?.(url)
  let back: string | null
  // 'window': banco simulado pero con la ventana real de la app (para probarla en la app nativa).
  if (MOCK && MOCK_MODE !== 'window') {
    const { mockCallback } = await import('./mock')
    back = await mockCallback(state)
  } else if (bankSupported) {
    const inApp = bankAuthWindow(url, secret.redirectUrl).then((r) => r ?? (handle.usingBrowser?.() ? new Promise<string>(() => {}) : null))
    back = await Promise.race([inApp, pasted])
  } else {
    await openExternal(url)
    back = await pasted
  }
  if (!back) throw new Error('Has cerrado la ventana del banco antes de terminar. Vuelve a intentarlo.')
  const p = parseCallback(back)
  if (p.error) throw new Error(`El banco no dio permiso: ${p.error}`)
  if (!p.code) throw new Error('La dirección no trae el código de autorización (?code=…).')
  if (p.state && p.state !== state) throw new Error('La vuelta no corresponde a esta conexión. Vuelve a intentarlo.')
  return client.createSession(p.code)
}

/** Guarda las cuentas elegidas: crea las nuevas y, en las que ya había, renueva la sesión sin perder lo traído. */
export async function saveConnection(session: EbSession, chosen: (OfferedAccount & { label: string })[]): Promise<string[]> {
  const ids: string[] = []
  for (const a of chosen) {
    const link: BankLink = {
      provider: 'enablebanking',
      aspsp: session.aspsp,
      accountUid: a.uid,
      identificationHash: a.identificationHash,
      ibanMasked: a.ibanMasked,
      currency: a.currency,
      sessionId: session.session_id,
      validUntil: session.access.valid_until,
    }
    if (a.existingId) {
      await updateBankLink(a.existingId, { ...link, lastError: undefined })
      ids.push(a.existingId)
    } else ids.push(await createAccount({ name: a.label, kind: 'bank', bank: link }))
  }
  return ids
}
