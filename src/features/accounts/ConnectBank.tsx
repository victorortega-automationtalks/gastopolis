import clsx from 'clsx'
import { Landmark, Loader2, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Aspsp, EbSession } from '../../bank/enablebanking'
import { authorize, listBanks, offeredAccounts, saveConnection, syncAccount, type OfferedAccount, type SyncOutcome } from '../../bank/run'
import { queries } from '../../data/queries'
import { errorMessage } from '../../lib/errors'
import { openExternal } from '../../platform'
import { useUI } from '../../store/ui'
import { Button, Field, Modal } from '../../ui/components/primitives'

const COUNTRIES = [
  { code: 'ES', label: 'España' },
  { code: 'LT', label: 'Lituania (Revolut)' },
  { code: 'PT', label: 'Portugal' },
  { code: 'DE', label: 'Alemania' },
  { code: 'FR', label: 'Francia' },
  { code: 'IE', label: 'Irlanda' },
  { code: 'NL', label: 'Países Bajos' },
]

type Phase = 'pick' | 'auth' | 'accounts' | 'sync'

/**
 * Conectar un banco (o renovar su permiso): elegir el banco, entrar en él en el navegador, elegir qué cuentas traer
 * y la primera sincronización. Al renovar se salta la elección y se reconocen las cuentas que ya tenías.
 */
export function ConnectBank({ open, onClose, renew }: { open: boolean; onClose: () => void; renew?: { name: string; country: string } }) {
  const toast = useUI((s) => s.toast)
  const [phase, setPhase] = useState<Phase>('pick')
  const [country, setCountry] = useState(renew?.country ?? 'ES')
  const [banks, setBanks] = useState<Aspsp[] | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [bank, setBank] = useState<Aspsp | null>(null)
  const [session, setSession] = useState<EbSession | null>(null)
  const [offered, setOffered] = useState<(OfferedAccount & { label: string; on: boolean })[]>([])
  const [pastedText, setPastedText] = useState('')
  const [outcomes, setOutcomes] = useState<SyncOutcome[] | null>(null)
  const pasteResolver = useRef<((v: string) => void) | null>(null)
  const authUrl = useRef<string | null>(null)
  const browser = useRef(false)
  const [usingBrowser, setUsingBrowser] = useState(false)

  useEffect(() => {
    if (!open || renew) return
    setBanks(null)
    setError(null)
    listBanks(country)
      .then(setBanks)
      .catch((e: Error) => setError(e.message))
  }, [open, country, renew])

  const start = async (aspsp: Aspsp) => {
    setBank(aspsp)
    setPhase('auth')
    setError(null)
    const pasted = new Promise<string>((resolve) => (pasteResolver.current = resolve))
    try {
      browser.current = false
      setUsingBrowser(false)
      const s = await authorize(aspsp, pasted, { onUrl: (u) => (authUrl.current = u), usingBrowser: () => browser.current })
      setSession(s)
      // De la base de datos, no del hook: al renovar esto corre nada más abrir, antes de que el hook tenga las cuentas.
      const accounts = await queries.accountsInOrder()
      const list = offeredAccounts(s, accounts).map((a) => ({
        ...a,
        label: a.existingId ? (accounts.find((x) => x.id === a.existingId)?.name ?? a.name) : a.name,
        on: true,
      }))
      setOffered(list)
      setPhase('accounts')
    } catch (e) {
      setError(errorMessage(e))
      setPhase(renew ? 'auth' : 'pick')
    }
  }

  // Al renovar no hay que elegir banco: se va directo a su página.
  useEffect(() => {
    if (open && renew && phase === 'pick') void start({ name: renew.name, country: renew.country })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, renew])

  const finish = async () => {
    if (!session) return
    setPhase('sync')
    const ids = await saveConnection(
      session,
      offered.filter((a) => a.on),
    )
    const results: SyncOutcome[] = []
    for (const id of ids) results.push(await syncAccount(id))
    setOutcomes(results)
    const added = results.reduce((n, r) => n + r.added, 0)
    toast(`${session.aspsp.name}: ${added} movimientos nuevos`)
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (banks ?? []).filter((b) => !q || b.name.toLowerCase().includes(q))
  }, [banks, query])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={renew ? `Renovar el permiso de ${renew.name}` : 'Conectar un banco'}
      footer={
        phase === 'accounts' ? (
          <Button variant="primary" disabled={!offered.some((a) => a.on)} onClick={() => void finish()}>
            {renew ? 'Renovar y sincronizar' : 'Añadir y sincronizar'}
          </Button>
        ) : phase === 'sync' && outcomes ? (
          <Button variant="primary" onClick={onClose}>
            Hecho
          </Button>
        ) : undefined
      }
    >
      {error && <p className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      {phase === 'pick' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <select className="field w-auto" value={country} onChange={(e) => setCountry(e.target.value)} aria-label="País del banco">
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
            <label className="relative min-w-40 flex-1">
              <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint" />
              <input className="field pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar banco…" aria-label="Buscar banco" />
            </label>
          </div>
          {!banks && !error && (
            <p className="flex items-center gap-2 text-sm text-ink-muted">
              <Loader2 size={15} className="animate-spin" /> Cargando bancos…
            </p>
          )}
          <div className="grid max-h-[50dvh] gap-1 overflow-y-auto">
            {shown.map((b) => (
              <button
                key={`${b.country}-${b.name}`}
                onClick={() => void start(b)}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-surface-2"
              >
                <Landmark size={16} className="shrink-0 text-ink-faint" />
                <span className="flex-1 text-ink">{b.name}</span>
                {b.beta && <span className="text-[10px] text-ink-faint uppercase">beta</span>}
              </button>
            ))}
            {banks && !shown.length && <p className="px-3 py-2 text-sm text-ink-faint">Ningún banco con ese nombre en este país.</p>}
          </div>
        </div>
      )}

      {phase === 'auth' && (
        <div className="space-y-4 text-sm text-ink-muted">
          <p className="flex items-center gap-2 text-ink">
            <Loader2 size={16} className="animate-spin text-accent-2" /> Entra en {bank?.name ?? 'tu banco'} en la ventana que se ha abierto y da el permiso de
            lectura.
          </p>
          <p>Al terminar, la ventana se cierra sola y sigues aquí.</p>
          {!usingBrowser ? (
            <p>
              ¿Tu banco no funciona en esa ventana?{' '}
              <button
                className="font-medium text-accent-2 hover:underline"
                onClick={() => {
                  browser.current = true
                  setUsingBrowser(true)
                  if (authUrl.current) void openExternal(authUrl.current)
                }}
              >
                Ábrelo en el navegador
              </button>
              .
            </p>
          ) : (
            <p>Al terminar en el navegador verás una página que no carga: es normal. Copia la dirección completa de la barra y pégala aquí abajo.</p>
          )}
          <Field label="Dirección de vuelta" hint="La de la barra del navegador al terminar: empieza por tu dirección de vuelta y lleva «?code=…».">
            <div className="flex gap-2">
              <input
                className="field num"
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="https://gastopolis.invalid/callback?code=…"
              />
              <Button disabled={!/code=/.test(pastedText)} onClick={() => pasteResolver.current?.(pastedText)}>
                Usar
              </Button>
            </div>
          </Field>
          {renew && error && (
            <Button onClick={() => bank && void start(bank)} variant="subtle">
              Volver a intentarlo
            </Button>
          )}
        </div>
      )}

      {phase === 'accounts' && (
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            {session?.aspsp.name} te ha dado acceso a {offered.length} {offered.length === 1 ? 'cuenta' : 'cuentas'}. Elige cuáles traer y cómo llamarlas.
          </p>
          {offered.map((a, i) => (
            <div
              key={a.uid}
              className={clsx('flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5', a.on ? 'border-line-strong' : 'border-line opacity-60')}
            >
              <input
                type="checkbox"
                checked={a.on}
                onChange={(e) => setOffered(offered.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))}
                aria-label={`Traer ${a.label}`}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              <input
                className="field min-w-40 flex-1"
                value={a.label}
                onChange={(e) => setOffered(offered.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                aria-label="Nombre de la cuenta"
              />
              <span className="num text-xs text-ink-faint">{a.ibanMasked ?? a.currency}</span>
              {a.existingId && <span className="text-xs text-accent-2">ya la tienes: se renueva</span>}
            </div>
          ))}
        </div>
      )}

      {phase === 'sync' && (
        <div className="space-y-2 text-sm">
          {!outcomes ? (
            <p className="flex items-center gap-2 text-ink">
              <Loader2 size={16} className="animate-spin text-accent-2" /> Trayendo los movimientos…
            </p>
          ) : (
            outcomes.map((o) => (
              <p key={o.account} className={o.error ? 'text-danger' : 'text-ink'}>
                <b>{o.account}</b>:{' '}
                {o.error ??
                  `${o.added} nuevos${o.linked ? `, ${o.linked} que ya tenías enlazados` : ''}${o.transfers ? `, ${o.transfers} traspasos entre tus cuentas` : ''}`}
              </p>
            ))
          )}
        </div>
      )}
    </Modal>
  )
}
