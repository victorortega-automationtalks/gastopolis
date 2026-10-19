import clsx from 'clsx'
import { Pause, Play, RotateCcw, X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { frameLabel, STEP_LABEL, STEP_MS, type Frame, type TimeStep } from '../model/timeline'
import { Segmented } from './components/primitives'

export type TimeMode = 'period' | 'cumulative'
export type Speed = 1 | 2 | 4

const SPEEDS: Speed[] = [1, 2, 4]

/**
 * Reproductor temporal de las escenas: avanza fotograma a fotograma (día, semana o mes) y se para al final.
 * El paso y la velocidad los elige el usuario; cada escena decide qué pinta en cada fotograma.
 */
export function TimePlayer({
  frames,
  index,
  onIndex,
  playing,
  onPlaying,
  step,
  onStep,
  speed,
  onSpeed,
  mode,
  onMode,
  cumulativeFrom,
  extra,
  onClose,
  className,
}: {
  frames: Frame[]
  index: number
  onIndex: (i: number) => void
  playing: boolean
  onPlaying: (p: boolean) => void
  step: TimeStep
  onStep: (s: TimeStep) => void
  speed: Speed
  onSpeed: (s: Speed) => void
  /** Solo si la escena distingue entre el fotograma suelto y lo acumulado. */
  mode?: TimeMode
  onMode?: (m: TimeMode) => void
  /** Inicio del acumulado, para el rótulo («desde …»). */
  cumulativeFrom?: string
  /** Dato que acompaña a la fecha (p. ej., lo gastado hasta ahí). */
  extra?: ReactNode
  onClose?: () => void
  className?: string
}) {
  const last = frames.length - 1

  useEffect(() => {
    if (!playing) return
    if (index >= last) {
      onPlaying(false)
      return
    }
    const t = setTimeout(() => onIndex(index + 1), STEP_MS[step] / speed)
    return () => clearTimeout(t)
  }, [playing, index, last, onIndex, onPlaying, step, speed])

  const toggle = () => {
    // Si está al final, vuelve a empezar.
    if (!playing && index >= last) onIndex(0)
    onPlaying(!playing)
  }
  const frame = frames[Math.min(index, last)]
  const label = frame ? frameLabel(frame, step) : '—'

  return (
    <div className={clsx('glass flex flex-col gap-2 rounded-2xl px-3 py-2.5 shadow-xl', className)}>
      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-2 text-white shadow-[0_0_20px_-4px_var(--glow)] transition hover:brightness-110"
          aria-label={playing ? 'Pausar' : index >= last ? 'Volver a reproducir' : 'Reproducir'}
        >
          {playing ? <Pause size={18} /> : index >= last && last > 0 ? <RotateCcw size={17} /> : <Play size={18} className="translate-x-px" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-baseline justify-between gap-2 text-xs text-ink-muted">
            <span className="truncate font-display text-base font-semibold text-ink" aria-live="off">
              {mode === 'cumulative' && cumulativeFrom ? <span className="font-normal text-ink-muted">{cumulativeFrom} → </span> : null}
              {label}
            </span>
            {extra && <span className="num shrink-0">{extra}</span>}
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(0, last)}
            value={Math.min(index, last)}
            onChange={(e) => {
              onPlaying(false)
              onIndex(Number(e.target.value))
            }}
            className="w-full accent-[var(--accent-2)]"
            aria-label="Momento"
          />
        </div>
        {onClose && (
          <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-ink-muted hover:bg-surface-2 hover:text-ink" aria-label="Cerrar la reproducción">
            <X size={16} />
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<TimeStep>
          value={step}
          onChange={onStep}
          options={(['day', 'week', 'month'] as TimeStep[]).map((s) => ({ value: s, label: STEP_LABEL[s] }))}
        />
        {mode && onMode && (
          <Segmented<TimeMode>
            value={mode}
            onChange={onMode}
            options={[
              { value: 'period', label: 'Periodo' },
              { value: 'cumulative', label: 'Acumulado' },
            ]}
          />
        )}
        <button
          onClick={() => onSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}
          className="num ml-auto rounded-lg border border-line px-2 py-1 text-xs text-ink-muted hover:text-ink"
          title="Velocidad"
        >
          {speed}×
        </button>
        <span className="num text-xs text-ink-faint">
          {Math.min(index, last) + 1}/{frames.length}
        </span>
      </div>
    </div>
  )
}
