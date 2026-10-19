import clsx from 'clsx'
import { CalendarRange, ChevronDown } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMovements, useSettings } from '../data/hooks'
import { yearsWithData } from '../model/aggregate'
import { type Period } from '../model/period'
import { useUI } from '../store/ui'
import { periodLabel, PRESETS } from './periodLabel'

/** Selector de periodo. Sin props, el de la barra superior (filtro global); con `value`/`onChange`, uno propio. */
export function PeriodPicker({ value, onChange }: { value?: Period; onChange?: (p: Period) => void } = {}) {
  const globalPeriod = useUI((s) => s.filters.period)
  const setFilters = useUI((s) => s.setFilters)
  const period = value ?? globalPeriod
  const { movements } = useMovements()
  const settings = useSettings()
  const years = useMemo(() => yearsWithData(movements), [movements])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [open])

  const set = (p: Period) => (onChange ? onChange(p) : setFilters({ period: p }))

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex h-9 items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 text-sm whitespace-nowrap text-ink transition hover:border-line-strong"
      >
        <CalendarRange size={15} className="text-accent-2" />
        <span className="max-w-40 truncate">{periodLabel(period, settings.fiscalYearStart)}</span>
        <ChevronDown size={14} className="text-ink-faint" />
      </button>
      {open && (
        <div className="absolute top-11 left-0 z-40 w-72 rounded-xl border border-line-strong bg-surface-solid p-3 shadow-2xl">
          <div className="grid grid-cols-2 gap-1">
            {PRESETS.map((x) => (
              <button
                key={x.preset}
                onClick={() => {
                  set({ preset: x.preset })
                  setOpen(false)
                }}
                className={clsx(
                  'rounded-md px-2.5 py-1.5 text-left text-sm transition hover:bg-surface-2',
                  period.preset === x.preset && 'bg-accent/15 text-ink ring-1 ring-accent/40',
                )}
              >
                {x.label}
              </button>
            ))}
          </div>
          {years.length > 0 && (
            <>
              <div className="mt-3 mb-1.5 text-[11px] font-medium tracking-wider text-ink-faint uppercase">Años con datos</div>
              <div className="flex flex-wrap gap-1">
                {years.map((y) => (
                  <button
                    key={y}
                    onClick={() => {
                      set({ preset: 'year', year: y })
                      setOpen(false)
                    }}
                    className={clsx(
                      'num rounded-md px-2.5 py-1 text-sm transition hover:bg-surface-2',
                      period.preset === 'year' && period.year === y && 'bg-accent/15 ring-1 ring-accent/40',
                    )}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="mt-3 mb-1.5 text-[11px] font-medium tracking-wider text-ink-faint uppercase">Rango personalizado</div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              className="field"
              value={period.preset === 'custom' ? (period.from ?? '') : ''}
              onChange={(e) => set({ preset: 'custom', from: e.target.value || undefined, to: period.preset === 'custom' ? period.to : undefined })}
            />
            <input
              type="date"
              className="field"
              value={period.preset === 'custom' ? (period.to ?? '') : ''}
              onChange={(e) => set({ preset: 'custom', to: e.target.value || undefined, from: period.preset === 'custom' ? period.from : undefined })}
            />
          </div>
        </div>
      )}
    </div>
  )
}
