import { ExternalLink } from 'lucide-react'
import type { ReactNode } from 'react'
import { openExternal } from '../../platform'
import { Button } from '../../ui/components/primitives'

export const CONTROL_PANEL = 'https://enablebanking.com/cp/applications'

export function LinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button size="sm" onClick={() => void openExternal(href)}>
      <ExternalLink size={14} />
      {children}
    </Button>
  )
}

/**
 * Cómo enlazar una cuenta desde el panel de Enable Banking, la forma recomendada: se hace en tu navegador habitual y
 * funciona con todos los bancos, también con los que no van bien dentro de la ventana de la app.
 */
export function PanelGuide({ compact }: { compact?: boolean }) {
  return (
    <div className="space-y-2 rounded-xl border border-line bg-surface p-3 text-sm text-ink-muted">
      <p className="font-medium text-ink">Recomendado: enlaza primero la cuenta en el panel de Enable Banking</p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>
          Abre el panel e inicia sesión. En tu aplicación (la de Gastópolis) pulsa <b className="text-ink">Link accounts</b>.
        </li>
        <li>Elige el país y el banco, entra con tus claves en su web y marca las cuentas que quieras ver.</li>
        <li>
          Cuando la cuenta aparezca en <b className="text-ink">Linked accounts</b>, vuelve aquí y elige <b className="text-ink">ese mismo banco</b>: así
          Gastópolis recibe su propio permiso de lectura (el enlace del panel solo autoriza la cuenta, no le da acceso a la app).
        </li>
      </ol>
      {!compact && (
        <p className="text-xs">
          Si al entrar el banco no funciona en la ventana de la app (pasa con algunos, como Revolut o MyInvestor), pulsa{' '}
          <b className="text-ink">Ábrelo en el navegador</b>: entras con tu navegador de siempre y al final pegas aquí la dirección.
        </p>
      )}
      <LinkButton href={CONTROL_PANEL}>Abrir el panel de Enable Banking</LinkButton>
    </div>
  )
}
