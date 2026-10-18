import clsx from 'clsx'
import { lazy, Suspense, useMemo, useState } from 'react'
import { useCategories, useMovements, useSettings } from '../../data/hooks'
import { withAlpha } from '../../lib/color'
import { applyFilters } from '../../model/aggregate'
import { balanceSnapshot, type BalanceSeg } from '../../model/balance'
import { fmtMoney, fmtPercent } from '../../model/format'
import { today } from '../../model/period'
import { monthsOf } from '../../model/series'
import { KINDS } from '../../model/types'
import type { BalancePick } from '../../scenes/balance/BalanceCanvas'
import { useQuality, useSceneColors } from '../../scenes/common'
import { useUI } from '../../store/ui'
import { Button } from '../../ui/components/primitives'
import { CategoryIcon } from '../../ui/icons'
import { TimeScrubber, type ScrubMode } from '../../ui/TimeScrubber'
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
  const [mode, setMode] = useState<ScrubMode>('month')
  const [picked, setIndex] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)

  // La balanza mira los tres tipos a la vez: los filtros de periodo y búsqueda sí aplican.
  const scoped = useMemo(
    () => applyFilters(movements, { ...filters, kinds: KINDS }, categories, today(), settings.fiscalYearStart),
    [movements, filters, categories, settings.fiscalYearStart],
  )
  const months = useMemo(() => monthsOf(scoped), [scoped])
  const lastWithIncome = useMemo(() => {
    const withIncome = new Set(scoped.filter((m) => m.kind === 'income').map((m) => m.date.slice(0, 7)))
    for (let i = months.length - 1; i >= 0; i--) if (withIncome.has(months[i])) return i
    return months.length - 1
  }, [scoped, months])
  const index = Math.min(picked ?? lastWithIncome, Math.max(0, months.length - 1))
  const snapshot = useMemo(() => balanceSnapshot(scoped, categories, months, index, mode), [scoped, categories, months, index, mode])

  // Escala fija para todo el periodo: así un mes ligero se ve ligero de verdad al lado de uno pesado.
  const { scaleMax, savedMax } = useMemo(() => {
    let scaleMax = 1
    let savedMax = 1
    for (let i = 0; i < months.length; i++) {
      const s = balanceSnapshot(scoped, categories, months, i, mode)
      scaleMax = Math.max(scaleMax, s.incomeTotal, s.expenseTotal)
      savedMax = Math.max(savedMax, s.saved)
    }
    return { scaleMax, savedMax }
  }, [scoped, categories, months, mode])

  const money = (v: number, signed = false) => fmtMoney(v, { currency: settings.currency, locale: settings.locale, signed })
  const pick = (p: BalancePick) => p.seg.categoryId !== 'otras' && openInCity(p.seg.categoryId, p.side, mode === 'month' ? snapshot.month : undefined)
  const empty = months.length === 0

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {!empty && (
          <div className="absolute inset-x-0 top-0 bottom-[8.5rem] md:bottom-[4.5rem] lg:bottom-0">
            <Suspense fallback={<div className="flex h-full items-center justify-center text-ink-muted">Cargando…</div>}>
              <BalanceCanvas
                snapshot={snapshot}
                scaleMax={scaleMax}
                savedMax={savedMax}
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

        {!empty && (
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

        {!empty && (
          <div className="absolute inset-x-3 bottom-[9.5rem] md:bottom-[5.5rem] lg:bottom-4 lg:left-1/2 lg:w-[34rem] lg:-translate-x-1/2">
            <TimeScrubber months={months} index={index} onIndex={setIndex} playing={playing} onPlaying={setPlaying} mode={mode} onMode={setMode} />
          </div>
        )}

        {empty && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="font-display text-xl font-semibold">No hay movimientos con estos filtros</p>
            <Button onClick={resetFilters}>Quitar filtros</Button>
          </div>
        )}
      </div>

      {!empty && (
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
