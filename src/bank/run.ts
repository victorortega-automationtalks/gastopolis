import { db } from '../data/db'
import { applyBankSync, bankFallbacks, createAccount, updateBankLink } from '../data/repo'
import { newId } from '../lib/id'
import { isoOf } from '../model/period'
import { compileRules } from '../model/rules'
import type { BankLink, BankSecret, Movement } from '../model/types'
import { bankRequest, bankSupported, cancelBankCallback, openExternal, waitBankCallback } from '../platform'
import { ebClient, EbError, parseCallback, type Aspsp, type EbClient, type EbSession, type EbTransport } from './enablebanking'
import { consentUntil, fetchRange, internalTransfers, isDue, reconcile, toDrafts, type OfferedAccount } from './sync'

export { offeredAccounts, type OfferedAccount } from './sync'

/**
 * Lo que mueve la sincronización: leer del banco, encajar y guardar. La lógica está en `sync.ts` (pura, con tests);
 * aquí solo se encadena con la red (Rust) y la base de datos (repo).
 */

/** Banco simulado para desarrollo y pruebas (nunca va en la app que se instala). */
const MOCK = import.meta.env.VITE_BANK_MOCK === '1'

/** La conexión con el banco existe aquí (app de Windows, o el banco simulado). */
export const bankEnabled = bankSupported || MOCK

export const DEFAULT_REDIRECT = 'http://localhost:47823/callback'

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

/** Trae lo nuevo de una cuenta: solo desde unos días antes de lo último traído. */
export async function syncAccount(accountId: string): Promise<SyncOutcome> {
  const account = await db.accounts.get(accountId)
  if (!account?.bank) throw new Error('Esa cuenta no está conectada a un banco')
  if (busy.has(accountId)) return { account: account.name, added: 0, linked: 0, transfers: 0 }
  busy.add(accountId)
  try {
    const client = await bankClient()
    const today = isoOf(new Date())
    const range = fetchRange(account.bank, today)
    const txs = await client.transactions(account.bank.accountUid, range)
    const balance = await client.balance(account.bank.accountUid).catch(() => undefined)
    const fallback = await bankFallbacks()
    const [existing, categories, rules, accounts] = await Promise.all([
      db.movements.toArray(),
      db.categories.toArray(),
      db.rules.toArray(),
      db.accounts.toArray(),
    ])
    const history = [...existing].sort((a, b) => (a.date < b.date ? 1 : -1))
    const plan = reconcile(toDrafts(txs), account, existing, accounts, { rules: compileRules(rules, categories), categories, history, fallback })
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
      { lastSyncAt: Date.now(), syncedThrough: range.dateTo, lastError: undefined, balance },
    )
    return { account: account.name, added: plan.added.length, linked: plan.linked.length, transfers: pairs.length }
  } catch (e) {
    const expired = e instanceof EbError && e.expired
    await updateBankLink(accountId, { lastError: (e as Error).message, ...(expired ? { validUntil: new Date().toISOString() } : {}) })
    return { account: account.name, added: 0, linked: 0, transfers: 0, error: (e as Error).message }
  } finally {
    busy.delete(accountId)
  }
}

/** Sincroniza las cuentas a las que les toca (o todas, si lo pides tú). */
export async function syncAccounts(opts: { force?: boolean } = {}): Promise<SyncOutcome[]> {
  if (!bankEnabled) return []
  const [accounts, settings, secret] = await Promise.all([db.accounts.toArray(), db.settings.get('settings'), db.secrets.get('enablebanking')])
  if (!secret) return []
  const now = Date.now()
  const due = accounts.filter(
    (a) => a.bank && !a.archived && (opts.force ? Date.parse(a.bank.validUntil) > now : isDue(a.bank, now, settings?.bankSyncHours ?? 6)),
  )
  const out: SyncOutcome[] = []
  for (const a of due) out.push(await syncAccount(a.id))
  return out
}

// ── Conectar y renovar ───────────────────────────────────────────────────────

export async function listBanks(country: string): Promise<Aspsp[]> {
  const banks = await (await bankClient()).aspsps(country)
  return banks.sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

/** Puerto de la dirección de vuelta si es local (entonces la app la recoge sola). */
export function localPort(redirectUrl: string): number | null {
  try {
    const u = new URL(redirectUrl)
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1' ? Number(u.port || (u.protocol === 'https:' ? 443 : 80)) : null
  } catch {
    return null
  }
}

/**
 * Abre la página del banco para dar permiso de lectura y espera la vuelta. Si la dirección de vuelta es local, la app
 * la recoge sola; si no (o si el navegador no vuelve), `pasted` resuelve con la dirección que pegue el usuario.
 */
export async function authorize(aspsp: Aspsp, pasted: Promise<string>): Promise<EbSession> {
  const secret = await db.secrets.get('enablebanking')
  if (!secret) throw new Error('Falta configurar Enable Banking')
  const client = await bankClient(secret)
  const state = newId()
  const url = await client.startAuth({
    aspsp: { name: aspsp.name, country: aspsp.country },
    validUntil: consentUntil(Date.now(), aspsp.maximum_consent_validity),
    redirectUrl: secret.redirectUrl,
    state,
  })
  const port = localPort(secret.redirectUrl)
  let back: string | null
  if (MOCK) {
    const { mockCallback } = await import('./mock')
    back = await mockCallback(state)
  } else {
    await openExternal(url)
    const auto = port && secret.redirectUrl.startsWith('http://') ? waitBankCallback(port).catch(() => null) : new Promise<null>(() => {})
    back = await Promise.race([auto, pasted])
    void cancelBankCallback()
  }
  if (!back) throw new Error('No ha llegado la vuelta del banco. Pega la dirección a la que te llevó el navegador.')
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
