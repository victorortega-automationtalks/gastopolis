import clsx from 'clsx'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * Minigráfico de tendencia: barras en el tono neutro y la última (el periodo actual) en el acento.
 * Sin ejes: la tarjeta ya dice qué mide.
 */
export function Sparkline({ values, className, label }: { values: number[]; className?: string; label: string }) {
  const max = Math.max(1e-9, ...values.map(Math.abs))
  return (
    <svg viewBox={`0 0 ${values.length * 6} 24`} preserveAspectRatio="none" className={clsx('h-7 w-full', className)} role="img" aria-label={label}>
      {values.map((v, i) => {
        const h = Math.max(1.5, (Math.abs(v) / max) * 22)
        const last = i === values.length - 1
        return <rect key={i} x={i * 6 + 0.5} y={24 - h} width={4.5} height={h} rx={1.2} className={last ? 'fill-accent-2' : 'fill-ink-faint/45'} />
      })}
    </svg>
  )
}

/**
 * Variación frente al periodo anterior. El color dice si es buena noticia, no si sube: subir gastos es rojo.
 */
export function Delta({ value, goodWhenUp, empty, children }: { value: number | null; goodWhenUp: boolean; empty: string; children: ReactNode }) {
  if (value == null || !Number.isFinite(value)) return <span className="text-xs text-ink-faint">{empty}</span>
  const flat = Math.abs(value) < 0.005
  const good = flat ? null : value > 0 === goodWhenUp
  const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span className={clsx('inline-flex items-center gap-0.5 text-xs font-medium', good == null ? 'text-ink-muted' : good ? 'text-income' : 'text-expense')}>
      <Icon size={13} />
      {children}
    </span>
  )
}

/** Barra de progreso: el relleno cambia de tono con la gravedad; la pista es el mismo tono, más tenue. */
export function Meter({ ratio, pace, label }: { ratio: number; pace?: number; label: string }) {
  const tone = ratio >= 1 ? 'bg-expense' : pace != null && ratio > pace * 1.1 ? 'bg-warn' : 'bg-income'
  const track = ratio >= 1 ? 'bg-expense/15' : pace != null && ratio > pace * 1.1 ? 'bg-warn/15' : 'bg-income/15'
  return (
    <div
      className={clsx('relative h-2 w-full overflow-hidden rounded-full', track)}
      role="meter"
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className={clsx('h-full rounded-full transition-[width] duration-500', tone)} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      {/* Marca de «dónde deberías ir» a estas alturas del mes. */}
      {pace != null && pace < 1 && (
        <div className="absolute inset-y-0 w-0.5 bg-ink/60" style={{ left: `${pace * 100}%` }} title="Ritmo esperado a día de hoy" />
      )}
    </div>
  )
}
