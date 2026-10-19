import { useEffect } from 'react'
import { bankEnabled, syncAccounts } from '../../bank/run'
import { useUI } from '../../store/ui'

/** Cada cuánto se mira si a alguna cuenta le toca sincronizarse (la frecuencia real la marca el ajuste). */
const CHECK_EVERY = 15 * 60_000

/**
 * Sincronización automática: al abrir la app y cada rato mientras está abierta, solo las cuentas a las que les toca.
 * Avisa de lo nuevo con un mensaje discreto.
 */
export function useBankAutoSync() {
  const toast = useUI((s) => s.toast)
  useEffect(() => {
    if (!bankEnabled) return
    let stopped = false
    const run = async () => {
      const out = await syncAccounts()
      if (stopped) return
      const added = out.reduce((n, o) => n + o.added, 0)
      if (added) toast(`Bancos: ${added} movimientos nuevos`)
      const failed = out.filter((o) => o.error)
      if (failed.length) toast(`${failed[0].account}: ${failed[0].error}`, 'error')
    }
    const first = setTimeout(() => void run(), 3000)
    const every = setInterval(() => void run(), CHECK_EVERY)
    return () => {
      stopped = true
      clearTimeout(first)
      clearInterval(every)
    }
  }, [toast])
}
