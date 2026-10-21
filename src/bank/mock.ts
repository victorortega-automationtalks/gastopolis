import type { EbRequest, EbTransport, EbTransaction } from './enablebanking'

/**
 * Banco simulado: solo se usa al compilar con VITE_BANK_MOCK=1 (desarrollo y pruebas de punta a punta). Responde como
 * la API de Enable Banking con datos inventados y estables: dos cuentas, nómina, súper, recibos y un traspaso entre ellas.
 */

const BANKS = [
  { name: 'ABANCA', country: 'ES', maximum_consent_validity: 15_552_000 },
  { name: 'BBVA', country: 'ES', maximum_consent_validity: 15_552_000 },
  { name: 'Banco Santander', country: 'ES', maximum_consent_validity: 7_776_000 },
  { name: 'CaixaBank', country: 'ES', maximum_consent_validity: 7_776_000 },
  { name: 'Revolut', country: 'LT', maximum_consent_validity: 15_552_000 },
]

const iso = (d: Date) => d.toISOString().slice(0, 10)

function transactionsFor(uid: string, from: string, to: string): EbTransaction[] {
  const out: EbTransaction[] = []
  const end = new Date(`${to}T00:00:00Z`)
  for (let d = new Date(`${from}T00:00:00Z`); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.getUTCDate()
    const date = iso(d)
    const add = (ref: string, amount: number, text: string, dir: 'CRDT' | 'DBIT') =>
      out.push({
        entry_reference: `${uid}-${date}-${ref}`,
        booking_date: date,
        transaction_amount: { amount: amount.toFixed(2), currency: 'EUR' },
        credit_debit_indicator: dir,
        status: 'BOOK',
        remittance_information: [text],
      })
    if (uid === 'acc-corriente') {
      if (day === 28) add('nom', 2150, 'TRANSFERENCIA RECIBIDA DE ACME SOLUCIONES SL NOMINA', 'CRDT')
      if (day === 2) add('alq', 750, 'RECIBO ALQUILER VIVIENDA', 'DBIT')
      if (day % 3 === 0) add('sup', 20 + ((day * 7) % 45), 'COMPRA TARJ. 5402XXXXXXXX1234 MERCADONA S.A.', 'DBIT')
      if (day === 12) add('luz', 48.3, 'RECIBO IBERDROLA CLIENTES', 'DBIT')
      if (day === 15) add('rev', 200, 'TRANSFERENCIA A REVOLUT', 'DBIT')
      if (day === 20) add('spo', 11.99, 'SPOTIFY', 'DBIT')
      // Una compra que se devuelve unos días después: deben anularse, no contar como gasto e ingreso.
      if (day === 10) add('amz', 35.9, 'COMPRA TARJ. 5402XXXXXXXX1234 AMAZON EU SARL', 'DBIT')
      if (day === 14) add('dev', 35.9, 'DEVOLUCION TARJ. 5402XXXXXXXX1234 AMAZON EU SARL', 'CRDT')
    } else {
      if (day === 15) add('top', 200, 'TOP-UP FROM ES12 •••• 9012', 'CRDT')
      if (day % 5 === 1) add('caf', 3.2, 'CAFETERIA LA PLAZA', 'DBIT')
      if (day === 22) add('cin', 18, 'CINESA', 'DBIT')
    }
  }
  // Algo pendiente al final (no debe entrar hasta asentarse).
  out.push({
    entry_reference: `${uid}-pend`,
    booking_date: to,
    transaction_amount: { amount: '9.99', currency: 'EUR' },
    credit_debit_indicator: 'DBIT',
    status: 'PDNG',
    remittance_information: ['AMAZON'],
  })
  return out
}

export const mockTransport: EbTransport = async (req: EbRequest) => {
  await new Promise((r) => setTimeout(r, 250))
  const ok = (body: unknown) => ({ status: 200, body: JSON.stringify(body) })
  if (req.path === '/aspsps') return ok({ aspsps: BANKS.filter((b) => !req.query?.country || b.country === req.query.country) })
  if (req.path === '/auth') {
    // Una página https de verdad que redirige a la dirección de vuelta, como haría el banco al terminar.
    const b = req.body as { redirect_url: string; state: string }
    const back = `${b.redirect_url}?code=mock-code&state=${b.state}`
    return ok({ url: `https://httpbin.org/redirect-to?url=${encodeURIComponent(back)}`, authorization_id: 'auth-1' })
  }
  if (req.path === '/sessions' && req.method === 'POST') {
    const until = new Date(Date.now() + 180 * 86_400_000).toISOString()
    return ok({
      session_id: 'sess-1',
      aspsp: { name: 'BBVA', country: 'ES' },
      access: { valid_until: until },
      accounts: [
        {
          uid: 'acc-corriente',
          identification_hash: 'h-corriente',
          account_id: { iban: 'ES12 0182 0000 0000 0000 3456' },
          currency: 'EUR',
          name: 'Cuenta Online',
        },
        { uid: 'acc-revolut', identification_hash: 'h-revolut', account_id: { iban: 'LT12 3250 0000 0000 9012' }, currency: 'EUR', product: 'Revolut' },
      ],
    })
  }
  const m = /^\/accounts\/([^/]+)\/(transactions|balances)$/.exec(req.path)
  if (m && m[2] === 'transactions')
    return ok({
      transactions: transactionsFor(decodeURIComponent(m[1]), req.query?.date_from ?? '2026-01-01', req.query?.date_to ?? iso(new Date())),
      continuation_key: null,
    })
  if (m)
    return ok({
      balances: [
        { balance_type: 'ITAV', balance_amount: { amount: m[1] === 'acc-corriente' ? '3184.27' : '412.60', currency: 'EUR' }, reference_date: iso(new Date()) },
      ],
    })
  return { status: 404, body: '{"message":"not found"}' }
}

/** La «vuelta del banco» llega sola al cabo de un momento. */
export async function mockCallback(state: string): Promise<string> {
  await new Promise((r) => setTimeout(r, 1200))
  return `/callback?code=mock-code&state=${state}`
}
