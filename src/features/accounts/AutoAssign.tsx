import clsx from 'clsx'
import { Wand2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useCategories, useRawMovements } from '../../data/hooks'
import { applyAutoAssign, markRefunds, reserveCategoryIds } from '../../data/repo'
import { planAutoAssign } from '../../model/autocat'
import { refundPairs } from '../../model/refunds'
import { useUI } from '../../store/ui'
import { Button, Modal, Money } from '../../ui/components/primitives'

/**
 * «Asignar automáticamente las categorías a registros del banco»: propone una categoría para lo que llegó del banco y
 * sigue en «Sin clasificar» u «Otros ingresos», agrupado para revisarlo de un vistazo. Solo se aplica lo marcado.
 */
export function AutoAssign({ onClose }: { onClose: () => void }) {
  const { movements } = useRawMovements()
  const categories = useCategories()
  const toast = useUI((s) => s.toast)
  const [off, setOff] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const plan = useMemo(() => planAutoAssign(movements, categories, reserveCategoryIds(categories)), [movements, categories])
  // Compras devueltas (en todo lo que tienes, no solo lo del banco): la compra y su devolución se anulan.
  const refunds = useMemo(() => refundPairs(movements), [movements])
  const [refundsOn, setRefundsOn] = useState(true)
  const refundIds = useMemo(() => new Set(refundsOn ? refunds.flat() : []), [refunds, refundsOn])
  const byId = useMemo(() => new Map(movements.map((m) => [m.id, m])), [movements])

  const chosen = plan.groups.filter((g) => !off.has(g.auto.key)).map((g) => ({ ...g, ids: g.ids.filter((id) => !refundIds.has(id)) }))
  const count = chosen.reduce((n, g) => n + g.ids.length, 0) + refundIds.size

  const apply = async () => {
    setBusy(true)
    try {
      if (refundsOn) await markRefunds(refunds)
      const n = (await applyAutoAssign(chosen)) + refundIds.size
      toast(`${n.toLocaleString('es-ES')} movimientos clasificados`)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Asignar categorías automáticamente"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!count || busy} onClick={() => void apply()}>
            <Wand2 size={15} /> {busy ? 'Asignando…' : `Asignar ${count.toLocaleString('es-ES')} movimientos`}
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-ink-muted">
        {plan.pending ? (
          <>
            De {plan.pending.toLocaleString('es-ES')} movimientos del banco sin clasificar, se reconocen{' '}
            <b className="text-ink">{(plan.pending - plan.unresolved).toLocaleString('es-ES')}</b> por el comercio, tu nombre (traspasos entre tus cuentas) y
            quién te paga. Desmarca lo que no quieras; lo que ya clasificaste tú no se toca. Las categorías nuevas se crean al aplicar.
          </>
        ) : (
          'No queda ningún movimiento del banco sin clasificar.'
        )}
      </p>
      <div className="grid gap-2">
        {refunds.length > 0 && (
          <label
            className={clsx(
              'flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition',
              refundsOn ? 'border-line-strong bg-surface' : 'border-line text-ink-faint',
            )}
          >
            <input type="checkbox" checked={refundsOn} onChange={(e) => setRefundsOn(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
            <div className="min-w-0 flex-1">
              <div className={clsx('font-medium', refundsOn ? 'text-ink' : 'text-ink-faint')}>Compras devueltas</div>
              <div className="text-xs text-ink-faint">
                {refunds.length} {refunds.length === 1 ? 'compra devuelta' : 'compras devueltas'}: la compra y su devolución se anulan (no cuentan como gasto ni
                como ingreso).{' '}
                {refunds
                  .slice(0, 3)
                  .map(([e]) => byId.get(e)?.concept)
                  .join(' · ')}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <Money value={refunds.reduce((a, [, r]) => a + (byId.get(r)?.amount ?? 0), 0)} kind="transfer" className="text-sm" />
              <div className="text-[11px] text-ink-faint">{refunds.length * 2} mov.</div>
            </div>
          </label>
        )}
        {plan.groups.map((g) => {
          const on = !off.has(g.auto.key)
          return (
            <label
              key={g.auto.key}
              className={clsx(
                'flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition',
                on ? 'border-line-strong bg-surface' : 'border-line text-ink-faint',
              )}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={(e) => {
                  const next = new Set(off)
                  if (e.target.checked) next.delete(g.auto.key)
                  else next.add(g.auto.key)
                  setOff(next)
                }}
                className="mt-1 h-4 w-4 accent-[var(--accent)]"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2">
                  <span className={clsx('font-medium', on ? 'text-ink' : 'text-ink-faint')}>{g.auto.name}</span>
                  {!g.existingId && <span className="rounded-full bg-accent/15 px-1.5 text-[10px] font-medium text-accent-2 uppercase">nueva</span>}
                  {g.auto.kind === 'transfer' && <span className="text-[11px] text-ink-faint">traspaso: no cuenta como gasto ni ingreso</span>}
                </div>
                <div className="mt-0.5 truncate text-xs text-ink-faint">{g.samples.join(' · ')}</div>
              </div>
              <div className="shrink-0 text-right">
                <Money value={g.total} kind="auto" className="text-sm" />
                <div className="text-[11px] text-ink-faint">{g.ids.length.toLocaleString('es-ES')} mov.</div>
              </div>
            </label>
          )
        })}
      </div>
      {plan.unresolved > 0 && (
        <p className="mt-4 text-xs text-ink-faint">
          {plan.unresolved.toLocaleString('es-ES')} se quedan como están (conceptos sin pista, como «Dinero» o un nombre que no se reconoce). Para esos, una
          regla en Categorías → Reglas los clasificará siempre, también los que lleguen después; o clasifícalos de uno en uno, jugando, en Clasificar.
        </p>
      )}
    </Modal>
  )
}
