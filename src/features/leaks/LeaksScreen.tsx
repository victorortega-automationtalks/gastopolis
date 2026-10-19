import { shownDate } from '../../model/payday'
import clsx from 'clsx'
import { Check, ChevronDown, CircleSlash, EyeOff, FlaskConical, ListFilter, RotateCcw, ShieldCheck, Trash2, X } from 'lucide-react'
import { newId } from '../../lib/id'
import { useState } from 'react'
import { useCategoryMap, useMovements, useSettings } from '../../data/hooks'
import { decideLeak, deleteMovements, restoreMovements, undecideLeak } from '../../data/repo'
import { fmtDate, fmtMoney } from '../../model/format'
import { LEAK_ICON, LEAK_LABEL, type Leak, type LeakType } from '../../model/leaks'
import type { LeakStatus } from '../../model/types'
import { useUI } from '../../store/ui'
import { Button, Card, Segmented } from '../../ui/components/primitives'
import { CategoryIcon } from '../../ui/icons'
import { useLeaks } from './useLeaks'

const STATUS_LABEL: Record<LeakStatus, string> = { kept: 'La uso / es correcto', cancel: 'Para cancelar', ignored: 'Ignorada' }
const SEVERITY_DOT: Record<Leak['severity'], string> = { high: 'bg-expense', medium: 'bg-warn', low: 'bg-ink-faint' }
/** Tipos que se resuelven decidiendo si se cancela algo. */
const CANCELLABLE: LeakType[] = ['subscription', 'overlap', 'price']

export function LeaksScreen() {
  const settings = useSettings()
  const { movements } = useMovements()
  const data = useLeaks()
  const [tab, setTab] = useState<'open' | 'decided'>('open')
  const [type, setType] = useState<LeakType | 'all'>('all')
  const money = (v: number) => fmtMoney(v, { currency: settings.currency, locale: settings.locale })

  if (!movements.length) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <h2 className="font-display text-2xl font-semibold">Aún no hay nada que vigilar</h2>
        <p className="mt-2 text-ink-muted">
          Cuando importes o apuntes movimientos, aquí aparecerán las suscripciones olvidadas, subidas de tarifa, comisiones y duplicados.
        </p>
      </div>
    )
  }

  const list = (tab === 'open' ? data.open : data.decided.map((d) => d.leak)).filter((l) => type === 'all' || l.type === type)
  const counts = new Map<LeakType, number>()
  for (const l of tab === 'open' ? data.open : data.decided.map((d) => d.leak)) counts.set(l.type, (counts.get(l.type) ?? 0) + 1)
  const statusOf = new Map(data.decided.map((d) => [d.leak.id, d.status]))

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="relative overflow-hidden p-5 sm:col-span-2">
          <div className="absolute -top-16 -right-10 h-48 w-48 rounded-full bg-expense/15 blur-3xl" />
          <div className="relative">
            <div className="text-sm text-ink-muted">Fugas por revisar</div>
            <div className="mt-1 text-5xl font-semibold tracking-tight">
              {money(data.openYearly)}
              <span className="ml-1 text-lg font-normal text-ink-muted">al año</span>
            </div>
            <div className="mt-2 text-sm text-ink-muted">
              {data.open.length} {data.open.length === 1 ? 'aviso' : 'avisos'}
              {data.openOnce > 0 && <> · además {money(data.openOnce)} en cargos duplicados</>}
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-ink-muted">Si cancelas lo marcado</div>
          <div className="mt-1 text-3xl font-semibold text-income">{money(data.cancelYearly)}</div>
          <div className="text-sm text-ink-muted">ahorras al año</div>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented<'open' | 'decided'>
          value={tab}
          onChange={(t) => {
            setTab(t)
            setType('all')
          }}
          options={[
            { value: 'open', label: `Por revisar · ${data.open.length}` },
            { value: 'decided', label: `Decididas · ${data.decided.length}` },
          ]}
        />
        <ListFilter size={15} className="ml-2 text-ink-faint" />
        {(['all', ...counts.keys()] as (LeakType | 'all')[]).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={clsx(
              'rounded-full border px-2.5 py-1 text-xs transition',
              type === t ? 'border-accent-2 bg-accent-2/10 text-ink' : 'border-line text-ink-muted hover:text-ink',
            )}
          >
            {t === 'all' ? 'Todas' : `${LEAK_LABEL[t]} · ${counts.get(t)}`}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 px-6 py-14 text-center">
          <ShieldCheck size={28} className="text-income" />
          <p className="font-medium">{tab === 'open' ? 'Nada por revisar. Buen trabajo.' : 'Aún no has decidido sobre ninguna fuga.'}</p>
          {tab === 'open' && <p className="text-sm text-ink-muted">Se vuelve a analizar cada vez que entran movimientos nuevos.</p>}
        </Card>
      ) : (
        <div className="space-y-3">
          {list.map((l) => (
            <LeakCard key={l.id} leak={l} status={statusOf.get(l.id)} money={money} />
          ))}
        </div>
      )}
    </div>
  )
}

function LeakCard({ leak: l, status, money }: { leak: Leak; status?: LeakStatus; money: (v: number) => string }) {
  const [open, setOpen] = useState(false)
  const toast = useUI((s) => s.toast)
  const navigate = useUI((s) => s.navigate)
  const setFilters = useUI((s) => s.setFilters)
  const seedLab = useUI((s) => s.seedLab)
  const catMap = useCategoryMap()
  const { movements } = useMovements()
  const decide = async (s: LeakStatus, msg: string) => {
    await decideLeak(l.id, s, l.period === 'year' ? l.amount : 0)
    toast(msg, 'ok', { label: 'Deshacer', run: () => void undecideLeak(l.id) })
  }
  const removeDuplicate = async () => {
    const m = movements.find((x) => x.id === l.duplicateId)
    if (!m) return
    await deleteMovements([m.id])
    toast('Duplicado borrado', 'info', { label: 'Deshacer', run: () => void restoreMovements([m]) })
  }
  const review = () => {
    setFilters({ categoryIds: l.categoryIds ?? [], search: '', period: { preset: 'last3' } })
    navigate('movimientos')
  }

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink-muted">
          <CategoryIcon name={LEAK_ICON[l.type]} size={18} />
          <span className={clsx('absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface-solid', SEVERITY_DOT[l.severity])} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[11px] font-medium tracking-wider text-ink-faint uppercase">{LEAK_LABEL[l.type]}</span>
            {status && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-ink-muted">{STATUS_LABEL[status]}</span>}
          </div>
          <h3 className="font-semibold">{l.title}</h3>
          <p className="mt-0.5 text-sm text-ink-muted">{l.detail}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-lg font-semibold">{money(l.amount)}</div>
          <div className="text-xs text-ink-faint">{l.period === 'year' ? 'al año' : 'una vez'}</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 sm:pl-13">
        {status ? (
          <Button size="sm" variant="ghost" onClick={() => undecideLeak(l.id)}>
            <RotateCcw size={13} /> Volver a revisar
          </Button>
        ) : (
          <>
            {CANCELLABLE.includes(l.type) && (
              <>
                <Button size="sm" onClick={() => decide('kept', 'Anotado: lo usas')}>
                  <Check size={13} /> La uso
                </Button>
                <Button size="sm" variant="danger" onClick={() => decide('cancel', `Marcado para cancelar: ${money(l.amount)}/año`)}>
                  <CircleSlash size={13} /> La cancelo
                </Button>
                {l.type === 'subscription' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => seedLab({ id: newId(), type: 'cancel', conceptKey: l.id.slice(4), label: l.title, monthly: l.amount / 12 })}
                    title="Ver en el Laboratorio qué cambia si la cancelas"
                  >
                    <FlaskConical size={13} /> Simular
                  </Button>
                )}
              </>
            )}
            {l.type === 'duplicate' && (
              <>
                <Button size="sm" onClick={() => decide('kept', 'Anotado: era correcto')}>
                  <Check size={13} /> Es correcto
                </Button>
                <Button size="sm" variant="danger" onClick={removeDuplicate}>
                  <Trash2 size={13} /> Borrar el sobrante
                </Button>
              </>
            )}
            {(l.type === 'unclassified' || l.type === 'fees') && (
              <Button size="sm" onClick={review}>
                Ver en Movimientos
              </Button>
            )}
            {(l.type === 'fees' || l.type === 'ant') && (
              <Button size="sm" onClick={() => decide('kept', 'Anotado')}>
                <Check size={13} /> Entendido
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => decide('ignored', 'Ignorada')}>
              <EyeOff size={13} /> Ignorar
            </Button>
          </>
        )}
        {l.evidence.length > 0 && (
          <button onClick={() => setOpen(!open)} className="ml-auto flex items-center gap-1 text-xs text-ink-muted hover:text-ink">
            {open ? <X size={13} /> : <ChevronDown size={13} />} {l.evidence.length} movimientos
          </button>
        )}
      </div>

      {open && (
        <ul className="mt-3 max-h-60 divide-y divide-line overflow-y-auto rounded-lg border border-line text-sm">
          {l.evidence.slice(0, 60).map((m) => (
            <li key={m.id} className={clsx('flex items-center gap-3 px-3 py-1.5', m.id === l.duplicateId && 'bg-expense/5')}>
              <span className="num w-24 shrink-0 text-xs text-ink-faint">{fmtDate(shownDate(m))}</span>
              <span className="min-w-0 flex-1 truncate">{m.concept}</span>
              <span className="hidden text-xs text-ink-faint sm:inline">{catMap.get(m.categoryId)?.name}</span>
              <span className="font-medium">{money(m.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
