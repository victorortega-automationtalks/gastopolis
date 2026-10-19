import clsx from 'clsx'
import { AlertTriangle, Banknote, KeyRound, Landmark, Plus, RefreshCw, Trash2, Wallet, type LucideIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { bankEnabled, syncAccounts, syncAccount } from '../../bank/run'
import { consentState, MIN_AUTO_HOURS } from '../../bank/sync'
import { useAccounts, useBankSecret, useRawMovements, useSettings } from '../../data/hooks'
import { createAccount, deleteAccount, deleteBankSecret, saveSettings, updateAccount } from '../../data/repo'
import { fmtDate } from '../../model/format'
import type { Account, AccountKind } from '../../model/types'
import { useUI } from '../../store/ui'
import { Button, Card, Field, Modal, Money, Segmented } from '../../ui/components/primitives'
import { BankSetup } from './BankSetup'
import { ConnectBank } from './ConnectBank'

const KIND_ICON: Record<AccountKind, LucideIcon> = { cash: Banknote, bank: Landmark, other: Wallet }
const KIND_LABEL: Record<AccountKind, string> = { cash: 'Efectivo', bank: 'Banco', other: 'Otra' }

const ago = (ms: number) => {
  const min = Math.round((Date.now() - ms) / 60_000)
  if (min < 1) return 'ahora mismo'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`
}

export function AccountsScreen() {
  const accounts = useAccounts()
  const { movements } = useRawMovements()
  const secret = useBankSecret()
  const settings = useSettings()
  const toast = useUI((s) => s.toast)
  const [setup, setSetup] = useState(false)
  const [connect, setConnect] = useState<{ renew?: { name: string; country: string } } | null>(null)
  const [adding, setAdding] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const stats = useMemo(() => {
    const m = new Map<string, { n: number; net: number }>()
    for (const mv of movements) {
      if (!mv.accountId) continue
      const s = m.get(mv.accountId) ?? { n: 0, net: 0 }
      s.n++
      s.net += mv.amount
      m.set(mv.accountId, s)
    }
    return m
  }, [movements])
  const unassigned = movements.length - [...stats.values()].reduce((n, s) => n + s.n, 0)
  const banks = accounts.filter((a) => a.bank)
  const others = accounts.filter((a) => !a.bank)

  const syncAll = async () => {
    setSyncing(true)
    const out = await syncAccounts({ force: true })
    setSyncing(false)
    const added = out.reduce((n, o) => n + o.added, 0)
    const failed = out.filter((o) => o.error)
    toast(
      failed.length ? `${failed.length} cuenta(s) con problemas: mira el aviso de cada una` : `Sincronizado: ${added} movimientos nuevos`,
      failed.length ? 'error' : 'ok',
    )
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Bancos</h2>
            <p className="mt-1 text-sm text-ink-muted">
              {bankEnabled
                ? 'Tus movimientos llegan solos, en modo solo lectura, a través de Enable Banking. Lo que apuntas a mano y el efectivo van aparte y nunca se tocan.'
                : 'La conexión con el banco funciona en la app de Windows. En el iPhone te llegan los movimientos con la copia cifrada (Ajustes → Restaurar copia).'}
            </p>
          </div>
          {bankEnabled && (
            <div className="flex flex-wrap gap-2">
              {secret && banks.length > 0 && (
                <Button onClick={() => void syncAll()} disabled={syncing}>
                  <RefreshCw size={15} className={clsx(syncing && 'animate-spin')} /> {syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
                </Button>
              )}
              {secret ? (
                <Button variant="primary" onClick={() => setConnect({})}>
                  <Plus size={15} /> Conectar un banco
                </Button>
              ) : (
                <Button variant="primary" onClick={() => setSetup(true)}>
                  <KeyRound size={15} /> Configurar Enable Banking
                </Button>
              )}
            </div>
          )}
        </div>

        {bankEnabled && secret === undefined && (
          <div className="mt-4 rounded-xl border border-line bg-surface p-4 text-sm text-ink-muted">
            Primero hay que darse de alta en Enable Banking y cargar aquí tu credencial. Te guiamos paso a paso:{' '}
            <button className="font-medium text-accent-2 hover:underline" onClick={() => setSetup(true)}>
              abrir el tutorial
            </button>
            .
          </div>
        )}

        {banks.length > 0 && (
          <div className="mt-4 grid gap-2">
            {banks.map((a) => (
              <BankRow key={a.id} account={a} stats={stats.get(a.id)} onRenew={() => setConnect({ renew: a.bank!.aspsp })} />
            ))}
          </div>
        )}

        {bankEnabled && secret && (
          <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-line pt-4">
            <Field label="Sincronizar solo" group hint="Al abrir la app y cada cierto tiempo. Los bancos permiten 4 lecturas al día sin ti delante.">
              <Segmented<string>
                value={String(Math.max(MIN_AUTO_HOURS, settings.bankSyncHours ?? 6))}
                onChange={(v) => void saveSettings({ bankSyncHours: Number(v) })}
                options={[
                  { value: '6', label: 'Cada 6 h' },
                  { value: '12', label: 'Cada 12 h' },
                  { value: '24', label: 'Una vez al día' },
                ]}
              />
            </Field>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setSetup(true)}>
                <KeyRound size={14} /> Credencial de Enable Banking
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (confirm('¿Quitar la credencial de Enable Banking de este equipo? Las cuentas y sus movimientos se quedan.')) void deleteBankSecret()
                }}
              >
                Quitar
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Efectivo y otras cuentas</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Para lo que apuntas a mano: la cartera, una hucha, una cuenta sin conectar… Al apuntar un movimiento eliges en cuál.
            </p>
          </div>
          <Button onClick={() => setAdding(true)}>
            <Plus size={15} /> Añadir cuenta
          </Button>
        </div>
        <div className="mt-4 grid gap-2">
          {others.map((a) => (
            <AccountRow key={a.id} account={a} stats={stats.get(a.id)} />
          ))}
          {!others.length && <p className="text-sm text-ink-faint">Aún no hay ninguna. Por ejemplo: «Cartera» (efectivo).</p>}
          {unassigned > 0 && (
            <p className="text-xs text-ink-faint">
              {unassigned.toLocaleString('es-ES')} movimientos sin cuenta (los importados y apuntados antes de existir las cuentas).
            </p>
          )}
        </div>
      </Card>

      {setup && <BankSetup open onClose={() => setSetup(false)} onReady={() => setSetup(false)} />}
      {connect && <ConnectBank open onClose={() => setConnect(null)} renew={connect.renew} />}
      {adding && <AddAccount onClose={() => setAdding(false)} />}
    </div>
  )
}

function BankRow({ account: a, stats, onRenew }: { account: Account; stats?: { n: number }; onRenew: () => void }) {
  const toast = useUI((s) => s.toast)
  const [busy, setBusy] = useState(false)
  const [now] = useState(Date.now)
  const bank = a.bank!
  const consent = consentState(bank, now)
  const sync = async () => {
    setBusy(true)
    const r = await syncAccount(a.id)
    setBusy(false)
    toast(r.error ?? `${a.name}: ${r.added} movimientos nuevos`, r.error ? 'error' : 'ok')
  }
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <Landmark size={18} className="shrink-0" style={{ color: a.color }} />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-ink">{a.name}</div>
          <div className="num text-xs text-ink-faint">
            {bank.aspsp.name}
            {bank.ibanMasked && ` · ${bank.ibanMasked}`} · {stats?.n ?? 0} movimientos
          </div>
        </div>
        {bank.balance && (
          <div className="text-right">
            <Money value={bank.balance.amount} className="font-semibold" />
            <div className="text-[10px] text-ink-faint">saldo en el banco</div>
          </div>
        )}
        <div className="flex gap-1.5">
          {consent.state !== 'expired' && (
            <Button size="sm" onClick={() => void sync()} disabled={busy} aria-label={`Sincronizar ${a.name}`}>
              <RefreshCw size={14} className={clsx(busy && 'animate-spin')} />
            </Button>
          )}
          {consent.state !== 'ok' && (
            <Button size="sm" variant="primary" onClick={onRenew}>
              Renovar permiso
            </Button>
          )}
          <DeleteAccount account={a} />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="text-ink-muted">{bank.lastSyncAt ? `Sincronizado ${ago(bank.lastSyncAt)}` : 'Aún sin sincronizar'}</span>
        <span className={clsx(consent.state === 'ok' ? 'text-ink-muted' : consent.state === 'expiring' ? 'text-warn' : 'text-danger')}>
          {consent.state === 'expired'
            ? 'El permiso del banco ha caducado'
            : `Permiso hasta el ${fmtDate(bank.validUntil.slice(0, 10))}${consent.state === 'expiring' ? ` (quedan ${consent.daysLeft} días)` : ''}`}
        </span>
        {bank.lastError && (
          <span className="flex items-center gap-1 text-danger">
            <AlertTriangle size={12} /> {bank.lastError}
          </span>
        )}
      </div>
    </div>
  )
}

function AccountRow({ account: a, stats }: { account: Account; stats?: { n: number; net: number } }) {
  const Icon = KIND_ICON[a.kind]
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
      <Icon size={18} className="shrink-0" style={{ color: a.color }} />
      <input
        className="min-w-32 flex-1 bg-transparent font-medium text-ink outline-none"
        defaultValue={a.name}
        aria-label="Nombre de la cuenta"
        onBlur={(e) => e.target.value.trim() && e.target.value !== a.name && void updateAccount(a.id, { name: e.target.value.trim() })}
      />
      <span className="text-xs text-ink-faint">
        {KIND_LABEL[a.kind]} · {stats?.n ?? 0} movimientos
      </span>
      <Money value={stats?.net ?? 0} kind="auto" signed className="text-sm" />
      <DeleteAccount account={a} />
    </div>
  )
}

function DeleteAccount({ account: a }: { account: Account }) {
  const [open, setOpen] = useState(false)
  const toast = useUI((s) => s.toast)
  const remove = async (withMovements: boolean) => {
    await deleteAccount(a.id, withMovements)
    setOpen(false)
    toast(withMovements ? `${a.name} y sus movimientos borrados` : `${a.name} quitada; sus movimientos se quedan sin cuenta`)
  }
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} aria-label={`Quitar ${a.name}`}>
        <Trash2 size={14} />
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Quitar ${a.name}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => void remove(false)}>
              Quitar y dejar sus movimientos
            </Button>
            <Button variant="danger" onClick={() => void remove(true)}>
              Borrar también sus movimientos
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">
          {a.bank
            ? 'Dejará de sincronizarse. Puedes conservar lo ya traído (queda sin cuenta) o borrarlo todo.'
            : 'Puedes conservar sus movimientos (quedan sin cuenta) o borrarlos.'}
        </p>
      </Modal>
    </>
  )
}

function AddAccount({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('Cartera')
  const [kind, setKind] = useState<AccountKind>('cash')
  const toast = useUI((s) => s.toast)
  return (
    <Modal
      open
      onClose={onClose}
      title="Añadir cuenta"
      footer={
        <Button
          variant="primary"
          disabled={!name.trim()}
          onClick={async () => {
            await createAccount({ name, kind })
            toast(`Cuenta «${name.trim()}» creada`)
            onClose()
          }}
        >
          Añadir
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Nombre">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Tipo" group>
          <Segmented<AccountKind>
            value={kind}
            onChange={setKind}
            options={[
              { value: 'cash', label: 'Efectivo' },
              { value: 'other', label: 'Otra (manual)' },
            ]}
          />
        </Field>
      </div>
    </Modal>
  )
}
