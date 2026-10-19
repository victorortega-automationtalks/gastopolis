import clsx from 'clsx'
import { ChevronLeft, ChevronRight, Flame, Leaf, Plus, TrendingUp } from 'lucide-react'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useCategoryMap, useMovements, useSettings } from '../../data/hooks'
import { calendarMonth, heat, monthOf, shiftDay, shiftMonth, type DayCell } from '../../model/calendar'
import { fmtMonth, fmtMoney } from '../../model/format'
import { shownDate } from '../../model/payday'
import { today } from '../../model/period'
import { longDate } from '../../model/sortGame'
import type { Movement } from '../../model/types'
import { useUI } from '../../store/ui'
import { Button, Card, CategoryChip, Modal, Money } from '../../ui/components/primitives'

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * Calendario: el mes en curso de un vistazo, con lo gastado (rojo, más intenso cuanto más) e ingresado (verde) cada
 * día, los días sin gastar con su hoja y la semana sumada al lado. Al pulsar un día se entra en él.
 */
export function CalendarScreen() {
  const { movements } = useMovements()
  const settings = useSettings()
  const modalOpen = useUI((s) => s.editing !== null || s.importOpen)
  const now = today()
  const [month, setMonth] = useState(monthOf(now))
  const [day, setDay] = useState<string | null>(null)
  const compact = (v: number) => fmtMoney(v, { currency: settings.currency, locale: settings.locale, compact: true })

  const cal = useMemo(() => calendarMonth(movements, month, now, (m) => shownDate(m as Movement)), [movements, month, now])
  const max = cal.maxDay?.expense ?? 0
  const isCurrent = month === monthOf(now)
  const daysInMonth = cal.weeks.flat().filter((d) => d.inMonth).length
  const projection = isCurrent && cal.elapsed > 2 ? cal.perDay * daysInMonth : null

  // ← → para cambiar de mes (si no hay un día abierto ni un formulario).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (day || modalOpen || (e.target as HTMLElement).closest('input,select,textarea')) return
      if (e.key === 'ArrowLeft') setMonth((m) => shiftMonth(m, -1))
      if (e.key === 'ArrowRight') setMonth((m) => shiftMonth(m, 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [day, modalOpen])

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="glass flex items-center rounded-xl p-0.5">
          <button
            onClick={() => setMonth(shiftMonth(month, -1))}
            className="rounded-lg p-2 text-ink-muted hover:bg-surface-2 hover:text-ink"
            aria-label="Mes anterior"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-40 px-2 text-center font-display text-lg font-semibold">{cap(fmtMonth(month, true))}</span>
          <button
            onClick={() => setMonth(shiftMonth(month, 1))}
            className="rounded-lg p-2 text-ink-muted hover:bg-surface-2 hover:text-ink"
            aria-label="Mes siguiente"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        {!isCurrent && (
          <Button size="sm" onClick={() => setMonth(monthOf(now))}>
            Hoy
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Gastado">
          <Money value={-cal.expense} kind="expense" className="text-xl font-semibold" />
          <span className="text-xs text-ink-muted">{cal.elapsed ? `${compact(cal.perDay)} al día` : 'Aún no ha empezado'}</span>
        </Tile>
        <Tile label="Ingresado">
          <Money value={cal.income} kind="income" className="text-xl font-semibold" />
          <span className="text-xs text-ink-muted">
            Balance <Money value={cal.income - cal.expense} kind="auto" signed className="text-xs" />
          </span>
        </Tile>
        <Tile label="Sin gastar">
          <span className="flex items-center gap-1.5 text-xl font-semibold text-income">
            <Leaf size={18} /> {cal.noSpendDays} {cal.noSpendDays === 1 ? 'día' : 'días'}
          </span>
          <span className="text-xs text-ink-muted">{cal.bestStreak > 1 ? `Mejor racha: ${cal.bestStreak} seguidos` : 'Cada día sin gastos cuenta'}</span>
        </Tile>
        <Tile label={projection ? 'A este ritmo' : 'Día más caro'}>
          {projection ? (
            <>
              <span className="flex items-center gap-1.5 text-xl font-semibold text-ink">
                <TrendingUp size={18} className="text-warn" /> {compact(projection)}
              </span>
              <span className="text-xs text-ink-muted">
                cerrarías el mes{cal.maxDay ? ` · el día más caro, el ${cal.maxDay.day} (${compact(cal.maxDay.expense)})` : ''}
              </span>
            </>
          ) : cal.maxDay ? (
            <>
              <span className="flex items-center gap-1.5 text-xl font-semibold text-ink">
                <Flame size={18} className="text-expense" /> {cap(longDate(cal.maxDay.iso).split(' de ')[0])}
              </span>
              <span className="text-xs text-ink-muted">{compact(cal.maxDay.expense)} gastados</span>
            </>
          ) : (
            <span className="text-sm text-ink-muted">Sin gastos este mes</span>
          )}
        </Tile>
      </div>

      <Card className="p-2 sm:p-3">
        <div className="grid grid-cols-7 gap-1 sm:gap-2 lg:grid-cols-[repeat(7,minmax(0,1fr))_6.5rem]">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-1 pb-1 text-center text-[11px] font-medium tracking-wider text-ink-faint uppercase">
              {d}
            </div>
          ))}
          <div className="hidden px-1 pb-1 text-right text-[11px] font-medium tracking-wider text-ink-faint uppercase lg:block">Semana</div>
          {cal.weeks.map((week, w) => (
            <WeekRow key={week[0].iso} week={week} total={cal.weekTotals[w]} max={max} index={w} compact={compact} onOpen={setDay} />
          ))}
        </div>
      </Card>
      <p className="text-center text-xs text-ink-faint">
        Cuanto más rojo, más se gastó ese día · <Leaf size={11} className="inline text-income" /> día sin gastar · pulsa un día para entrar · ← → cambia de mes
      </p>

      {day && <DayView iso={day} movements={movements} onClose={() => setDay(null)} onMove={(n) => setDay(shiftDay(day, n))} />}
    </div>
  )
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="text-[11px] font-medium tracking-wider text-ink-faint uppercase">{label}</span>
      {children}
    </Card>
  )
}

function WeekRow({
  week,
  total,
  max,
  index,
  compact,
  onOpen,
}: {
  week: DayCell[]
  total: { expense: number; income: number }
  max: number
  index: number
  compact: (v: number) => string
  onOpen: (iso: string) => void
}) {
  return (
    <>
      {week.map((d, i) => {
        const h = d.inMonth ? heat(d.expense, max) : 0
        const calm = d.inMonth && !d.isFuture && d.expense === 0
        return (
          <button
            key={d.iso}
            onClick={() => onOpen(d.iso)}
            className={clsx(
              'cal-cell group relative flex min-h-[4.25rem] flex-col rounded-lg border p-1.5 text-left transition hover:-translate-y-0.5 hover:border-line-strong sm:min-h-[5.75rem] sm:rounded-xl sm:p-2',
              d.inMonth ? 'border-line' : 'border-transparent opacity-35',
              d.isFuture && d.inMonth && 'opacity-60',
              d.weekend && d.inMonth && !h && 'bg-surface',
            )}
            style={
              {
                background: h ? `color-mix(in oklab, var(--expense) ${Math.round(8 + h * 42)}%, transparent)` : undefined,
                animationDelay: `${(index * 7 + i) * 14}ms`,
              } as CSSProperties
            }
            aria-label={`${longDate(d.iso)}: gastado ${d.expense}, ingresado ${d.income}`}
          >
            <span className="flex items-start justify-between gap-1">
              <span
                className={clsx(
                  'num flex h-6 min-w-6 items-center justify-center rounded-full text-xs font-semibold',
                  d.isToday ? 'bg-accent text-white' : 'text-ink-muted group-hover:text-ink',
                )}
              >
                {d.day}
              </span>
              {d.income > 0 && (
                <>
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-income sm:hidden" aria-hidden />
                  <span className="num hidden truncate text-[11px] font-semibold text-income sm:inline">+{compact(d.income)}</span>
                </>
              )}
            </span>
            <span className="mt-auto flex items-end justify-between gap-1">
              {d.expense > 0 ? (
                <span className="num truncate text-[11px] font-semibold text-ink sm:text-sm">
                  <span className="sm:hidden">{tiny(d.expense)}</span>
                  <span className="hidden sm:inline">−{compact(d.expense)}</span>
                </span>
              ) : calm ? (
                <Leaf size={14} className="text-income" />
              ) : (
                <span />
              )}
              {d.count > 0 && (
                <span className="hidden gap-0.5 sm:flex" aria-hidden>
                  {Array.from({ length: Math.min(d.count, 5) }, (_, k) => (
                    <span key={k} className="h-1 w-1 rounded-full bg-ink-faint" />
                  ))}
                </span>
              )}
            </span>
          </button>
        )
      })}
      <div className="hidden flex-col items-end justify-center gap-0.5 rounded-xl border border-dashed border-line px-2 text-right lg:flex">
        {total.expense > 0 && <span className="num text-sm font-semibold text-expense">−{compact(total.expense)}</span>}
        {total.income > 0 && <span className="num text-xs font-semibold text-income">+{compact(total.income)}</span>}
        {!total.expense && !total.income && <span className="text-xs text-ink-faint">—</span>}
      </div>
    </>
  )
}

/** Para la celda en el móvil: sin símbolo ni decimales («74», «1,9k»), que quepa en un séptimo de pantalla. */
const tiny = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1).replace('.', ',')}k` : String(Math.round(v)))

/** Dentro de un día: qué se gastó e ingresó, en qué, y añadir algo con esa fecha. ← → pasa de día. */
function DayView({ iso, movements, onClose, onMove }: { iso: string; movements: Movement[]; onClose: () => void; onMove: (n: number) => void }) {
  const catMap = useCategoryMap()
  const editMovement = useUI((s) => s.editMovement)
  const formOpen = useUI((s) => s.editing !== null)
  const items = useMemo(() => movements.filter((m) => shownDate(m) === iso).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)), [movements, iso])
  const spent = items.filter((m) => m.kind === 'expense').reduce((a, m) => a - m.amount, 0)
  const earned = items.filter((m) => m.kind === 'income').reduce((a, m) => a + m.amount, 0)
  const past = iso <= today()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (formOpen) return
      if (e.key === 'ArrowLeft') onMove(-1)
      if (e.key === 'ArrowRight') onMove(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onMove, formOpen])

  return (
    <Modal
      open
      onClose={onClose}
      title={
        <span className="flex items-center gap-1">
          <button onClick={() => onMove(-1)} className="rounded-md p-1 text-ink-muted hover:bg-surface-2 hover:text-ink" aria-label="Día anterior">
            <ChevronLeft size={18} />
          </button>
          {cap(longDate(iso))}
          <button onClick={() => onMove(1)} className="rounded-md p-1 text-ink-muted hover:bg-surface-2 hover:text-ink" aria-label="Día siguiente">
            <ChevronRight size={18} />
          </button>
        </span>
      }
      footer={
        <Button variant="primary" onClick={() => editMovement('', { date: iso })}>
          <Plus size={15} /> Añadir movimiento este día
        </Button>
      }
    >
      <div key={iso} className="cal-cell space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-surface p-2">
            <div className="text-[11px] text-ink-faint uppercase">Gastado</div>
            <Money value={-spent} kind="expense" className="font-semibold" />
          </div>
          <div className="rounded-xl bg-surface p-2">
            <div className="text-[11px] text-ink-faint uppercase">Ingresado</div>
            <Money value={earned} kind="income" className="font-semibold" />
          </div>
          <div className="rounded-xl bg-surface p-2">
            <div className="text-[11px] text-ink-faint uppercase">Movimientos</div>
            <span className="num font-semibold">{items.length}</span>
          </div>
        </div>
        {items.length === 0 ? (
          <p className="flex flex-col items-center gap-2 py-6 text-center text-sm text-ink-muted">
            {past ? (
              <>
                <Leaf size={28} className="text-income" /> Día sin gastar. Así da gusto.
              </>
            ) : (
              'Aún no ha llegado este día.'
            )}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((m) => (
              <li key={m.id}>
                <button onClick={() => editMovement(m.id)} className="flex w-full items-center gap-3 py-2.5 text-left text-sm hover:bg-surface-2/60">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ink">{m.concept}</span>
                    <span className="mt-0.5 block">
                      <CategoryChip category={catMap.get(m.categoryId)} />
                    </span>
                  </span>
                  <Money value={m.amount} kind={m.kind} signed={m.kind !== 'expense'} className="shrink-0 font-semibold" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
