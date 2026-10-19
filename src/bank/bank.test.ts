import { describe, expect, it } from 'vitest'
import { compileRules } from '../model/rules'
import type { Category, Movement, Rule } from '../model/types'
import { ebClient, EbError, parseCallback, type EbRequest, type EbTransaction } from './enablebanking'
import {
  cleanConcept,
  consentState,
  offeredAccounts,
  consentUntil,
  fetchRange,
  internalTransfers,
  isDue,
  maskIban,
  reconcile,
  toDrafts,
  type Categorizer,
} from './sync'

const DAY = 86_400_000
const cat = (id: string, kind: Category['kind']): Category => ({ id, name: id, kind, parentId: null, color: '#888888', icon: 'Circle', order: 0 })
const categories = [cat('super', 'expense'), cat('sin', 'expense'), cat('otros-ing', 'income'), cat('nomina', 'income'), cat('traspasos', 'transfer')]
const mv = (p: Partial<Movement> & Pick<Movement, 'id' | 'date' | 'amount'>): Movement => ({
  kind: p.amount < 0 ? 'expense' : 'income',
  concept: 'x',
  conceptKey: 'x',
  categoryId: p.amount < 0 ? 'super' : 'nomina',
  tags: [],
  source: 'manual',
  createdAt: 0,
  ...p,
})
const tx = (p: Partial<EbTransaction> & { amount: string; dir?: 'CRDT' | 'DBIT' }): EbTransaction => ({
  booking_date: '2026-10-10',
  transaction_amount: { amount: p.amount, currency: 'EUR' },
  credit_debit_indicator: p.dir ?? 'DBIT',
  status: 'BOOK',
  ...p,
})

describe('sincronización: cuándo y qué pedir', () => {
  it('la primera vez pide hasta dos años; después, solo desde unos días antes de lo ya traído', () => {
    expect(fetchRange({}, '2026-10-19')).toEqual({ dateFrom: '2024-10-19', dateTo: '2026-10-19' })
    // Seis meses ya en casa: solo la última semana larga, no todo otra vez.
    expect(fetchRange({ syncedThrough: '2026-10-15' }, '2026-10-19')).toEqual({ dateFrom: '2026-10-08', dateTo: '2026-10-19' })
  })

  it('se sincroniza sola cada X horas (6 como mínimo) y nunca con el permiso caducado', () => {
    const now = Date.parse('2026-10-19T12:00:00Z')
    const valid = new Date(now + 30 * DAY).toISOString()
    expect(isDue({ validUntil: valid }, now, 6)).toBe(true)
    expect(isDue({ validUntil: valid, lastSyncAt: now - 2 * 3_600_000 }, now, 1)).toBe(false)
    expect(isDue({ validUntil: valid, lastSyncAt: now - 7 * 3_600_000 }, now, 6)).toBe(true)
    expect(isDue({ validUntil: new Date(now - 1000).toISOString() }, now, 6)).toBe(false)
  })

  it('avisa una semana antes de que caduque el permiso', () => {
    const now = Date.parse('2026-10-19T12:00:00Z')
    expect(consentState({ validUntil: new Date(now + 30 * DAY).toISOString() }, now).state).toBe('ok')
    expect(consentState({ validUntil: new Date(now + 5 * DAY).toISOString() }, now)).toEqual({ state: 'expiring', daysLeft: 5 })
    expect(consentState({ validUntil: new Date(now - DAY).toISOString() }, now).state).toBe('expired')
    // Lo máximo que deje el banco, con 180 días de tope.
    expect(Date.parse(consentUntil(now, 365 * 86_400)) - now).toBe(180 * DAY)
    expect(Date.parse(consentUntil(now)) - now).toBe(90 * DAY)
  })
})

describe('sincronización: del banco a movimientos', () => {
  it('limpia los conceptos que mandan los bancos españoles', () => {
    expect(cleanConcept('COMPRA TARJ. 5402XXXXXXXX1234 MERCADONA S.A.')).toBe('Mercadona S.A.')
    expect(cleanConcept('PAGO MOVIL EN REPSOL ESTACION 123')).toBe('Repsol Estacion 123')
    expect(cleanConcept('TRANSFERENCIA RECIBIDA DE ACME SL NOMINA OCTUBRE')).toBe('Acme Sl Nomina Octubre')
    expect(cleanConcept('Bizum de Ana López')).toBe('Ana López')
    expect(cleanConcept('Spotify')).toBe('Spotify')
  })

  it('solo lo asentado; signo según cargo o abono; id del banco o una huella estable', () => {
    const drafts = toDrafts([
      tx({ amount: '12.50', entry_reference: 'R1', remittance_information: ['COMPRA TARJ. 1234XXXXXXXX9876 LIDL'] }),
      tx({ amount: '2000', dir: 'CRDT', transaction_id: 'T2', debtor: { name: 'ACME SL' }, remittance_information: ['NOMINA'] }),
      tx({ amount: '5', status: 'PDNG', entry_reference: 'R3' }),
      tx({ amount: '3.20', remittance_information: ['CAFE'] }),
      tx({ amount: '3.20', remittance_information: ['CAFE'] }),
    ])
    expect(drafts.map((d) => d.amount)).toEqual([-12.5, 2000, -3.2, -3.2])
    expect(drafts[0]).toMatchObject({ externalId: 'eb:R1', concept: 'Lidl', raw: 'COMPRA TARJ. 1234XXXXXXXX9876 LIDL' })
    expect(drafts[1].concept).toBe('Acme Sl Nomina')
    // Dos cafés iguales el mismo día son dos movimientos, y la huella no cambia al volver a pedirlos.
    expect(drafts[2].externalId).not.toBe(drafts[3].externalId)
    expect(toDrafts([tx({ amount: '3.20', remittance_information: ['CAFE'] })])[0].externalId).toBe(drafts[2].externalId)
  })

  const categorizer = (history: Movement[] = [], rules: Rule[] = []): Categorizer => ({
    rules: compileRules(rules, categories),
    categories,
    history,
    fallback: { expense: 'sin', income: 'otros-ing' },
  })

  it('no duplica: salta lo ya traído y enlaza lo apuntado a mano o importado; el efectivo nunca se toca', () => {
    const accounts = [
      { id: 'bbva', kind: 'bank' as const },
      { id: 'cash', kind: 'cash' as const },
    ]
    const existing = [
      mv({ id: 'ya', date: '2026-10-01', amount: -9.99, accountId: 'bbva', externalId: 'eb:R0' }),
      mv({ id: 'manual', date: '2026-10-09', amount: -12.5 }),
      mv({ id: 'efectivo', date: '2026-10-10', amount: -40, accountId: 'cash' }),
    ]
    const drafts = toDrafts([
      tx({ amount: '9.99', entry_reference: 'R0', booking_date: '2026-10-01' }),
      tx({ amount: '12.50', entry_reference: 'R1', remittance_information: ['LIDL'] }),
      tx({ amount: '40', entry_reference: 'R2', remittance_information: ['CAJERO'] }),
    ])
    const plan = reconcile(drafts, { id: 'bbva' }, existing, accounts, categorizer(), 0)
    expect(plan.skipped).toBe(1)
    expect(plan.linked).toEqual([{ id: 'manual', externalId: 'eb:R1' }])
    // Los 40 € del cajero no son el gasto en efectivo (ese es de otra cuenta): entran nuevos.
    expect(plan.added.map((m) => m.externalId)).toEqual(['eb:R2'])
    expect(plan.added[0]).toMatchObject({ accountId: 'bbva', source: 'bank', amount: -40, kind: 'expense', categoryId: 'sin' })
    expect(plan.through).toBe('2026-10-10')
  })

  it('categoriza con las reglas, luego con el historial; una devolución no acaba como gasto positivo', () => {
    const rules: Rule[] = [
      { id: 'r', name: 'mercadona', matchType: 'contains', pattern: 'mercadona', set: { categoryId: 'super' }, priority: 0, enabled: true },
    ]
    const history = [
      mv({ id: 'h', date: '2026-09-01', amount: -30, concept: 'Zara', conceptKey: 'zara', categoryId: 'super' }),
      mv({ id: 'h2', date: '2026-09-01', amount: -60, concept: 'Lidl', conceptKey: 'lidl', categoryId: 'super' }),
    ]
    const drafts = toDrafts([
      tx({ amount: '50', entry_reference: 'A', remittance_information: ['MERCADONA'] }),
      tx({ amount: '20', entry_reference: 'B', remittance_information: ['ZARA'] }),
      tx({ amount: '20', dir: 'CRDT', entry_reference: 'C', remittance_information: ['ZARA'] }),
      // El banco lo escribe distinto que tú: sigue siendo el mismo comercio.
      tx({ amount: '31', entry_reference: 'D', remittance_information: ['COMPRA TARJ. 5402XXXXXXXX1234 LIDL SUPERMERCADOS S.A.U.'] }),
    ])
    const plan = reconcile(drafts, { id: 'bbva' }, history, [], categorizer(history, rules), 0)
    expect(plan.added.map((m) => [m.categoryId, m.amount])).toEqual([
      ['super', -50],
      ['super', -20],
      ['otros-ing', 20],
      ['super', -31],
    ])
  })

  it('detecta traspasos entre tus cuentas para que no cuenten como gasto e ingreso', () => {
    const ms = [
      mv({ id: 'sale', date: '2026-10-05', amount: -300, accountId: 'bbva' }),
      mv({ id: 'entra', date: '2026-10-06', amount: 300, accountId: 'revolut' }),
      mv({ id: 'otro', date: '2026-10-06', amount: 300, accountId: 'bbva' }),
      mv({ id: 'efectivo', date: '2026-10-05', amount: -300, accountId: 'cash' }),
    ]
    expect(internalTransfers(ms, new Set(['bbva', 'revolut']))).toEqual([['sale', 'entra']])
  })

  it('enmascara el IBAN', () => {
    expect(maskIban('ES12 3456 7890 1234 5678 9012')).toBe('ES12 •••• 9012')
  })
})

describe('conectar y renovar', () => {
  const session = {
    session_id: 's2',
    aspsp: { name: 'BBVA', country: 'ES' },
    access: { valid_until: '2027-04-01T00:00:00Z' },
    accounts: [
      { uid: 'nuevo-uid', identification_hash: 'h1', account_id: { iban: 'ES1201820000000000003456' }, currency: 'EUR', name: 'Cuenta Online' },
      { uid: 'u3', identification_hash: 'h3', account_id: { iban: 'ES9900000000000000001111' }, currency: 'EUR' },
    ],
  }
  const bank = (id: string, hash?: string, iban?: string) => ({
    id,
    name: id,
    kind: 'bank' as const,
    color: '#000',
    order: 0,
    bank: {
      provider: 'enablebanking' as const,
      aspsp: { name: 'BBVA', country: 'ES' },
      accountUid: 'viejo',
      identificationHash: hash,
      ibanMasked: iban,
      currency: 'EUR',
      sessionId: 's1',
      validUntil: '2026-10-20T00:00:00Z',
    },
  })

  it('al renovar reconoce las cuentas que ya tienes (por su huella o su IBAN) y no las duplica', () => {
    const offered = offeredAccounts(session, [bank('mia', 'h1'), bank('otra', undefined, 'ES99 •••• 1111')])
    expect(offered.map((o) => o.existingId)).toEqual(['mia', 'otra'])
    // Una cuenta nueva del mismo banco se ofrece como nueva, con un nombre que se entiende.
    const fresh = offeredAccounts(session, [])
    expect(fresh.map((o) => [o.name, o.ibanMasked, o.existingId])).toEqual([
      ['Cuenta Online', 'ES12 •••• 3456', undefined],
      ['BBVA 1111', 'ES99 •••• 1111', undefined],
    ])
  })
})

describe('cliente de Enable Banking', () => {
  it('junta las páginas de movimientos y manda los parámetros de fecha', async () => {
    const calls: EbRequest[] = []
    const client = ebClient(async (req) => {
      calls.push(req)
      const page2 = req.query?.continuation_key === 'k2'
      return { status: 200, body: JSON.stringify({ transactions: [tx({ amount: page2 ? '2' : '1' })], continuation_key: page2 ? null : 'k2' }) }
    })
    const txs = await client.transactions('acc 1', { dateFrom: '2026-10-01', dateTo: '2026-10-19' })
    expect(txs.map((t) => t.transaction_amount.amount)).toEqual(['1', '2'])
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/accounts/acc%201/transactions', query: { date_from: '2026-10-01', date_to: '2026-10-19' } })
  })

  it('pide la autorización solo de lectura, en español y para particulares', async () => {
    let body: unknown
    const client = ebClient(async (req) => {
      body = req.body
      return { status: 200, body: JSON.stringify({ url: 'https://banco/login' }) }
    })
    const url = await client.startAuth({
      aspsp: { name: 'BBVA', country: 'ES' },
      validUntil: '2027-01-01T00:00:00Z',
      redirectUrl: 'http://localhost:47823/callback',
      state: 's1',
    })
    expect(url).toBe('https://banco/login')
    expect(body).toMatchObject({
      aspsp: { name: 'BBVA', country: 'ES' },
      psu_type: 'personal',
      language: 'es',
      redirect_url: 'http://localhost:47823/callback',
      state: 's1',
    })
  })

  it('traduce los errores: credencial mala, permiso caducado, límite del banco', async () => {
    const fail = (status: number, body: object) => ebClient(async () => ({ status, body: JSON.stringify(body) })).aspsps('ES')
    await expect(fail(401, { error: 'UNAUTHORIZED', message: 'Invalid JWT signature' })).rejects.toThrow(/credencial/)
    // Respuesta real de la API con un id de aplicación que no existe.
    await expect(fail(403, { code: 403, message: 'Application does not exist' })).rejects.toThrow(/credencial/)
    const expired = await fail(401, { error: 'EXPIRED_SESSION', message: 'Session expired' }).catch((e: EbError) => e)
    expect(expired).toBeInstanceOf(EbError)
    expect((expired as EbError).expired).toBe(true)
    await expect(fail(429, { message: 'Too many requests' })).rejects.toThrow(/4 al día/)
  })

  it('lee el código de vuelta de la dirección o de lo que se pega', () => {
    expect(parseCallback('http://localhost:47823/callback?state=abc&code=XYZ')).toEqual({ code: 'XYZ', state: 'abc', error: undefined })
    expect(parseCallback('https://localhost:47823/callback?error=access_denied&error_description=Cancelado').error).toBe('Cancelado')
  })
})
