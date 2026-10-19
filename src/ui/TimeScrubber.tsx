import clsx from 'clsx'
import { Pause, Play } from 'lucide-react'
import { useEffect } from 'react'
import { fmtMonth } from '../model/format'
import { Segmented } from './components/primitives'

export type ScrubMode = 'month' | 'cumulative'

/**
 * Deslizador de meses con reproducción. Avanza uno cada `stepMs` mientras suena y se para al llegar al final.
 */
export function TimeScrubber({
  months,
  index,
  onIndex,
  playing,
  onPlaying,
  mode,
  onMode,
  stepMs = 1100,
  className,
}: {
  months: string[]
  index: number
  onIndex: (i: number) => void
  playing: boolean
  onPlaying: (p: boolean) => void
  mode: ScrubMode
  onMode: (m: ScrubMode) => void
  stepMs?: number
  className?: string
}) {
  const last = months.length - 1

  useEffect(() => {
    if (!playing) return
    if (index >= last) {
      onPlaying(false)
      return
    }
    const t = setTimeout(() => onIndex(index + 1), stepMs)
    return () => clearTimeout(t)
  }, [playing, index, last, onIndex, onPlaying, stepMs])

  const toggle = () => {
    // Si está al final, vuelve a empezar.
    if (!playing && index >= last) onIndex(0)
    onPlaying(!playing)
  }

  return (
    <div className={clsx('glass flex flex-wrap items-center gap-3 rounded-2xl px-3 py-2.5 shadow-xl', className)}>
      <button
        onClick={toggle}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-2 text-white shadow-[0_0_20px_-4px_var(--glow)] transition hover:brightness-110"
        aria-label={playing ? 'Pausar' : 'Reproducir'}
      >
        {playing ? <Pause size={18} /> : <Play size={18} className="translate-x-px" />}
      </button>
      <div className="min-w-40 flex-1">
        <div className="mb-1 flex items-baseline justify-between gap-2 text-xs text-ink-muted">
          <span className="font-display text-base font-semibold text-ink">
            {mode === 'cumulative' && index > 0 ? `${fmtMonth(months[0])} – ` : ''}
            {months[index] ? fmtMonth(months[index], true) : '—'}
          </span>
          <span className="num">
            {index + 1}/{months.length}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={Math.max(0, last)}
          value={index}
          onChange={(e) => {
            onPlaying(false)
            onIndex(Number(e.target.value))
          }}
          className="w-full accent-[var(--accent-2)]"
          aria-label="Mes"
        />
      </div>
      <Segmented<ScrubMode>
        value={mode}
        onChange={onMode}
        options={[
          { value: 'month', label: 'Mes a mes' },
          { value: 'cumulative', label: 'Acumulado' },
        ]}
      />
    </div>
  )
}
