/**
 * Cliente de la API de Enable Banking (lectura de cuentas por PSD2). No sabe de red: recibe un `transport` que hace
 * la petición firmada (en Windows, el lado Rust de la app; en los tests, un banco simulado). Solo cuentas y
 * movimientos: ni pagos ni nada que mueva dinero.
 */

export interface EbRequest {
  method: 'GET' | 'POST' | 'DELETE'
  /** Ruta de la API, p. ej. «/aspsps». */
  path: string
  query?: Record<string, string>
  body?: unknown
}

export type EbTransport = (req: EbRequest) => Promise<{ status: number; body: string }>

export interface Aspsp {
  name: string
  country: string
  logo?: string
  maximum_consent_validity?: number
  psu_types?: string[]
  beta?: boolean
}

export interface EbAccount {
  uid: string
  account_id?: { iban?: string; other?: { identification?: string } } | null
  identification_hash?: string
  currency?: string
  name?: string | null
  product?: string | null
  details?: string | null
}

export interface EbTransaction {
  entry_reference?: string | null
  transaction_id?: string | null
  booking_date?: string | null
  value_date?: string | null
  transaction_date?: string | null
  transaction_amount: { amount: string; currency: string }
  credit_debit_indicator: 'CRDT' | 'DBIT'
  status?: string | null
  remittance_information?: string[] | null
  creditor?: { name?: string | null } | null
  debtor?: { name?: string | null } | null
  bank_transaction_code?: { description?: string | null } | null
  note?: string | null
}

export interface EbBalance {
  balance_amount: { amount: string; currency: string }
  balance_type?: string
  reference_date?: string | null
}

export interface EbSession {
  session_id: string
  accounts: EbAccount[]
  aspsp: { name: string; country: string }
  access: { valid_until: string }
}

/** Error de la API con un mensaje que se entiende. `expired`: el permiso del banco ya no vale (hay que renovarlo). */
export class EbError extends Error {
  readonly status: number
  readonly expired: boolean
  constructor(status: number, message: string, expired = false) {
    super(message)
    this.status = status
    this.expired = expired
  }
}

function explain(status: number, body: string): EbError {
  let code = ''
  let detail = ''
  try {
    const j = JSON.parse(body) as { code?: string | number; error?: string; message?: string; detail?: unknown }
    code = String(j.error ?? j.code ?? '')
    detail = [j.message, typeof j.detail === 'string' ? j.detail : ''].filter(Boolean).join(' · ')
  } catch {
    detail = body.slice(0, 200)
  }
  const text = `${code} ${detail}`.toLowerCase()
  // Va primero: un 403 «Application does not exist» es la credencial, no el permiso del banco.
  if ((status === 401 || status === 403) && /jwt|token|signature|application|kid/.test(text))
    return new EbError(status, 'Enable Banking no acepta la credencial: revisa el id de la aplicación y el archivo .pem (Cuentas → Enable Banking).')
  if (/expired|revoked|not authori[sz]ed|consent|session.*(closed|invalid)/.test(text) || status === 401 || status === 403)
    return new EbError(status, 'El permiso del banco ha caducado o se ha revocado: renuévalo para seguir sincronizando.', true)
  if (status === 429) return new EbError(status, 'El banco limita las consultas (4 al día sin ti delante): se volverá a intentar más tarde.')
  if (status >= 500) return new EbError(status, 'El banco o Enable Banking no responden ahora mismo. Se reintentará más tarde.')
  return new EbError(status, `Enable Banking respondió ${status}${detail ? `: ${detail}` : ''}`)
}

export function ebClient(transport: EbTransport) {
  const call = async <T>(req: EbRequest): Promise<T> => {
    const r = await transport(req)
    if (r.status < 200 || r.status >= 300) throw explain(r.status, r.body)
    return (r.body ? JSON.parse(r.body) : {}) as T
  }
  return {
    /** Bancos disponibles en un país (ES, LT para Revolut…). */
    async aspsps(country: string): Promise<Aspsp[]> {
      const r = await call<{ aspsps: Aspsp[] }>({ method: 'GET', path: '/aspsps', query: { country, psu_type: 'personal', service: 'AIS' } })
      return r.aspsps ?? []
    },
    /** Empieza la autorización: devuelve la dirección del banco donde entrar. */
    async startAuth(p: { aspsp: { name: string; country: string }; validUntil: string; redirectUrl: string; state: string }): Promise<string> {
      const r = await call<{ url: string }>({
        method: 'POST',
        path: '/auth',
        body: { access: { valid_until: p.validUntil }, aspsp: p.aspsp, state: p.state, redirect_url: p.redirectUrl, psu_type: 'personal', language: 'es' },
      })
      return r.url
    },
    /** Cambia el código de vuelta por una sesión con las cuentas autorizadas. */
    createSession: (code: string) => call<EbSession>({ method: 'POST', path: '/sessions', body: { code } }),
    deleteSession: (id: string) => call<unknown>({ method: 'DELETE', path: `/sessions/${encodeURIComponent(id)}` }),
    /** Movimientos de una cuenta entre dos fechas, juntando todas las páginas. */
    async transactions(uid: string, range: { dateFrom: string; dateTo: string }): Promise<EbTransaction[]> {
      const out: EbTransaction[] = []
      let key: string | undefined
      for (let page = 0; page < 200; page++) {
        const query: Record<string, string> = { date_from: range.dateFrom, date_to: range.dateTo }
        if (key) query.continuation_key = key
        const r = await call<{ transactions?: EbTransaction[]; continuation_key?: string | null }>({
          method: 'GET',
          path: `/accounts/${encodeURIComponent(uid)}/transactions`,
          query,
        })
        out.push(...(r.transactions ?? []))
        key = r.continuation_key ?? undefined
        if (!key) break
      }
      return out
    },
    async balance(uid: string): Promise<{ amount: number; date: string } | undefined> {
      const r = await call<{ balances?: EbBalance[] }>({ method: 'GET', path: `/accounts/${encodeURIComponent(uid)}/balances` })
      // Mejor el disponible o el contable de cierre; si no, el primero que haya.
      const pick = ['ITAV', 'CLAV', 'ITBD', 'CLBD', 'XPCD'].map((t) => r.balances?.find((b) => b.balance_type === t)).find(Boolean) ?? r.balances?.[0]
      if (!pick) return undefined
      return { amount: Number(pick.balance_amount.amount), date: pick.reference_date ?? new Date().toISOString().slice(0, 10) }
    },
  }
}

export type EbClient = ReturnType<typeof ebClient>

/** Lee el código de vuelta de la dirección a la que redirige el banco (o de lo que pegue el usuario). */
export function parseCallback(input: string): { code?: string; state?: string; error?: string } {
  const q = input.includes('?') ? input.slice(input.indexOf('?') + 1) : input
  const p = new URLSearchParams(q.split('#')[0])
  return { code: p.get('code') ?? undefined, state: p.get('state') ?? undefined, error: p.get('error_description') ?? p.get('error') ?? undefined }
}
