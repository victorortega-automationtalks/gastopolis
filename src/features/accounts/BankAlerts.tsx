import { AlertTriangle, X } from 'lucide-react'
import { useState } from 'react'
import { consentState } from '../../bank/sync'
import { useAccounts } from '../../data/hooks'
import { useUI } from '../../store/ui'
import { Button } from '../../ui/components/primitives'

/** Aviso en el Inicio: permiso del banco a punto de caducar (una semana antes) o caducado. */
export function BankAlerts() {
  const accounts = useAccounts()
  const navigate = useUI((s) => s.navigate)
  const [hidden, setHidden] = useState(false)
  const [now] = useState(Date.now)
  if (hidden) return null
  const alerts = accounts
    .filter((a) => a.bank && !a.archived)
    .map((a) => ({ a, c: consentState(a.bank!, now) }))
    .filter((x) => x.c.state !== 'ok')
  if (!alerts.length) return null
  const expired = alerts.filter((x) => x.c.state === 'expired')
  const text = expired.length
    ? `El permiso de ${expired.map((x) => x.a.name).join(', ')} ha caducado: no se están trayendo sus movimientos.`
    : `El permiso de ${alerts.map((x) => `${x.a.name} (${x.c.daysLeft} ${x.c.daysLeft === 1 ? 'día' : 'días'})`).join(', ')} caduca pronto.`
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm">
      <AlertTriangle size={18} className="shrink-0 text-warn" />
      <p className="min-w-0 flex-1 text-ink">{text} Renovarlo es entrar otra vez en tu banco; lo ya traído se conserva.</p>
      <Button size="sm" variant="primary" onClick={() => navigate('cuentas')}>
        Renovar
      </Button>
      <button onClick={() => setHidden(true)} className="text-ink-muted hover:text-ink" aria-label="Ocultar aviso">
        <X size={16} />
      </button>
    </div>
  )
}
