import clsx from 'clsx'
import { lazy, Suspense, useMemo, useState } from 'react'
import { useCategories, useMovements, useSettings } from '../../data/hooks'
import { withAlpha } from '../../lib/color'
import { applyFilters } from '../../model/aggregate'
import { balanceBetween, type BalanceSeg } from '../../model/balance'
import { fmtDate, fmtMoney, fmtPercent } from '../../model/format'
import { today } from '../../model/period'
import { frameIndexOf, type Frame } from '../../model/timeline'
import { KINDS, type Movement } from '../../model/types'
import type { BalancePick } from '../../scenes/balance/BalanceCanvas'
import { useQuality, useSceneColors } from '../../scenes/common'
import { useUI } from '../../store/ui'
import { Button } from '../../ui/components/primitives'
import { CategoryIcon } from '../../ui/icons'
import { TimePlayer, type TimeMode } from '../../ui/TimePlayer'
import { useTimeline } from '../../ui/useTimeline'
import { useOpenInCity } from '../city/openInCity'

const BalanceCanvas = lazy(() => import('../../scenes/balance/BalanceCanvas').then((m) => ({ default: m.BalanceCanvas })))

export function BalanceScreen() {
  const { movements } = useMovements()
  const categories = useCategories()
  const settings = useSettings()
  const filters = useUI((s) => s.filters)
  const resetFilters = useUI((s) => s.resetFilters)
  const quality = useQuality()
  const colors = useSceneColors()
  const openInCity = useOpenInCity()
  const [mode, setMode] = useState<TimeMode>('period')
  const [hovered, setHovered] = useState<string | null>(null)

  // La balanza mira los tres tipos a la vez: los filtros de periodo y búsqueda sí aplican.
  const scoped = useMemo(
    () => applyFilters(movements, { ...filters, kinds: KINDS }, categories, today(), settings.fiscalYearStart),
    [movements, filters, categories, settings.fiscalYearStart],
  )
  // Arranca en el último periodo con ingresos: el mes en curso suele estar a medias.
  const lastWithIncome = useMemo(() => {
    const dates = scoped.filter((m) => m.kind === 'income').map((m) => m.date)
    const lastIncome = dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null
    return (frames: Frame[]) => (lastIncome ? frameIndexOf(frames, lastIncome) : frames.length - 1)
  }, [scoped])
  const tl = useTimeline(scoped, 'month', lastWithIncome)
  const first = tl.frames[0]
  const snapshot = useMemo(
    () => (tl.frame ? balanceBetween(scoped, categories, mode === 'period' ? tl.frame.from : first.from, tl.frame.to) : null),
    [scoped, categories, tl.frame, mode, first],
  )

  // Escala fija para toda la reproducción: así un periodo ligero se ve ligero de verdad al lado de uno pesado.
  const scaleMax = useMemo(() => periodMax(scoped, tl.frames, mode), [scoped, tl.frames, mode])

  const money = (v: number, signed = false) => fmtMoney(v, { currency: settings.currency, locale: settings.locale, signed })
  const pick = (p: BalancePick) =>
    p.seg.categoryId !== 'otras' && openInCity(p.seg.categoryId, p.side, mode === 'period' && tl.step === 'month' ? snapshot?.month : undefined)
  const empty = !snapshot

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {snapshot && (
          <div className="absolute inset-x-0 top-0 bottom-[8.5rem] md:bottom-[4.5rem] lg:bottom-0">
            <Suspense fallback={<div className="flex h-full items-center justify-center text-ink-muted">Cargando…</div>}>
              <BalanceCanvas
                snapshot={snapshot}
                scaleMax={scaleMax}
                hovered={hovered}
                quality={quality}
                colors={colors}
                currency={settings.currency}
                locale={settings.locale}
                incomeColor={colors.income}
                expenseColor={colors.expense}
                frameKey={mode}
                onHover={setHovered}
                onPick={pick}
              />
            </Suspense>
          </div>
        )}

        {snapshot && (
          <div className="pointer-events-none absolute top-0 left-0 p-3">
            <div
              className={clsx(
                'glass pointer-events-auto rounded-2xl px-4 py-2.5 shadow-xl',
                snapshot.net >= 0 ? 'ring-1 ring-income/30' : 'ring-1 ring-expense/30',
              )}
            >
              <div className="text-[11px] font-medium tracking-wider text-ink-faint uppercase">{snapshot.net >= 0 ? 'Sobra' : 'Falta'}</div>
              <div className={clsx('num font-display text-2xl font-bold', snapshot.net >= 0 ? 'text-income' : 'text-expense')}>{money(snapshot.net, true)}</div>
              <div className="text-xs text-ink-muted">
                {snapshot.incomeTotal <= 0
                  ? 'Sin ingresos en este periodo'
                  : snapshot.net >= 0
                    ? `Ahorras el ${fmtPercent(snapshot.net / snapshot.incomeTotal, settings.locale)} de lo que entra`
                    : `Gastas un ${fmtPercent(-snapshot.net / snapshot.incomeTotal, settings.locale)} más de lo que entra`}
              </div>
            </div>
          </div>
        )}

        {snapshot && (
          <div className="absolute inset-x-3 bottom-[9.5rem] md:bottom-[5.5rem] lg:bottom-4 lg:left-1/2 lg:w-[36rem] lg:-translate-x-1/2">
            <TimePlayer
              frames={tl.frames}
              index={tl.index}
              onIndex={tl.setIndex}
              playing={tl.playing}
              onPlaying={tl.setPlaying}
              step={tl.step}
              onStep={tl.setStep}
              speed={tl.speed}
              onSpeed={tl.setSpeed}
              mode={mode}
              onMode={setMode}
              cumulativeFrom={first ? fmtDate(first.from) : undefined}
            />
          </div>
        )}

        {empty && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="font-display text-xl font-semibold">No hay movimientos con estos filtros</p>
            <Button onClick={resetFilters}>Quitar filtros</Button>
          </div>
        )}
      </div>

      {snapshot && (
        <aside className="absolute inset-x-0 bottom-16 z-10 max-h-[4.5rem] overflow-y-auto border-t border-line bg-surface-solid md:bottom-0 lg:static lg:max-h-none lg:w-96 lg:border-t-0 lg:border-l lg:bg-surface lg:backdrop-blur-xl">
          <div className="space-y-5 p-4">
            <div className="grid grid-cols-3 gap-3">
              <Tile label="Ingresos" value={money(snapshot.incomeTotal)} tone="text-income" />
              <Tile label="Gastos" value={money(snapshot.expenseTotal)} tone="text-expense" />
              <Tile label={snapshot.saved >= 0 ? 'Apartado' : 'Retirado'} value={money(Math.abs(snapshot.saved))} tone="text-transfer" />
            </div>
            <SegList
              title="Ingresos"
              segs={snapshot.income}
              total={snapshot.incomeTotal}
              side="income"
              hovered={hovered}
              onHover={setHovered}
              onPick={pick}
              money={money}
            />
            <SegList
              title="Gastos"
              segs={snapshot.expense}
              total={snapshot.expenseTotal}
              side="expense"
              hovered={hovered}
              onHover={setHovered}
              onPick={pick}
              money={money}
            />
          </div>
        </aside>
      )}
    </div>
  )
}

function Tile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] tracking-wider text-ink-faint uppercase">{label}</div>
      <div className={clsx('num truncate text-sm font-semibold', tone)}>{value}</div>
    </div>
  )
}

function SegList({
  title,
  segs,
  total,
  side,
  hovered,
  onHover,
  onPick,
  money,
}: {
  title: string
  segs: BalanceSeg[]
  total: number
  side: 'income' | 'expense'
  hovered: string | null
  onHover: (k: string | null) => void
  onPick: (p: BalancePick) => void
  money: (v: number) => string
}) {
  if (!segs.length) return null
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-medium text-ink-muted">{title}</h3>
      <ul className="space-y-0.5">
        {segs.map((s) => {
          const key = `${side}:${s.categoryId}`
          return (
            <li key={key}>
              <button
                onMouseEnter={() => onHover(key)}
                onMouseLeave={() => onHover(null)}
                onClick={() => onPick({ side, seg: s })}
                className={clsx(
                  'relative flex w-full items-center gap-2 overflow-hidden rounded-md px-2 py-1.5 text-left text-sm transition',
                  hovered === key ? 'bg-surface-2' : 'hover:bg-surface-2',
                )}
              >
                <span
                  className="absolute inset-y-0 left-0 rounded-md"
                  style={{ width: `${(s.value / Math.max(total, 1e-9)) * 100}%`, background: withAlpha(s.color, 0.14) }}
                />
                <CategoryIcon name={s.icon} size={14} className="relative shrink-0 text-ink-muted" />
                <span className="relative min-w-0 flex-1 truncate">{s.name}</span>
                <span className="num relative text-xs text-ink-muted">{money(s.value)}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Lo más que pesa un platillo en toda la reproducción (en acumulado, al final; por periodos, el periodo más cargado). */
function periodMax(movements: Movement[], frames: Frame[], mode: TimeMode): number {
  if (!frames.length) return 1
  const income = new Float64Array(frames.length)
  const expense = new Float64Array(frames.length)
  for (const m of movements) {
    if (m.kind === 'transfer') continue
    const i = frameIndexOf(frames, m.date)
    ;(m.kind === 'income' ? income : expense)[i] += Math.abs(m.amount)
  }
  let max = 1
  let accI = 0
  let accE = 0
  for (let i = 0; i < frames.length; i++) {
    accI = mode === 'cumulative' ? accI + income[i] : income[i]
    accE = mode === 'cumulative' ? accE + expense[i] : expense[i]
    max = Math.max(max, accI, accE)
  }
  return max
}
