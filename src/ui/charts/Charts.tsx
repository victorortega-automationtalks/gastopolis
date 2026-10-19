import { useEffect, useRef, useState, type ReactNode } from 'react'
import { bands, columnPath, labelEvery, linear, niceTicks } from './scale'

/**
 * Gráficos SVG propios, en lugar de Recharts (≈95 KB comprimidos menos). Siguen las reglas de la casa: un solo eje,
 * líneas de 2 px, columnas de 24 px como mucho con el extremo redondeado y 2 px entre barras vecinas, rejilla tenue,
 * leyenda con dos o más series y una ficha al pasar el ratón con los valores de esa columna.
 */

export interface Series {
  id: string
  label: string
  color: string
  values: number[]
  /** Solo en ColumnChart: dibujar como línea encima de las columnas (misma escala). */
  line?: boolean
  dashed?: boolean
}

export interface Marker {
  index: number
  label: string
  color: string
}

const PAD = { top: 8, right: 8, bottom: 22 }
/** Ancho aproximado de un texto de 10–11 px (cifras y minúsculas): para reservar sitio sin medir el DOM. */
const textW = (s: string) => s.length * 6.2

/** Ancho del eje y: el de la etiqueta más larga (con su signo), para que no se corte por la izquierda. */
const axisWidth = (ticks: number[], format: (v: number) => string) => Math.ceil(Math.max(...ticks.map((t) => textW(format(t))))) + 12

function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
      {series.map((s) => (
        <span key={s.id} className="flex items-center gap-1.5">
          {s.line ? (
            <span className="h-0.5 w-3 rounded" style={{ background: s.color }} />
          ) : (
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
          )}
          {s.label}
        </span>
      ))}
    </div>
  )
}

/** Ficha flotante con los valores de la columna señalada. Texto en tinta, color solo en la muestra. */
function Tip({
  x,
  width,
  title,
  rows,
}: {
  x: number
  width: number
  title: ReactNode
  rows: { label: string; color: string; value: string; line?: boolean }[]
}) {
  const right = x > width * 0.62
  return (
    <div
      className="pointer-events-none absolute top-1 z-10 min-w-36 rounded-lg border border-line-strong bg-surface-solid px-3 py-2 text-xs shadow-xl"
      style={right ? { right: width - x + 10 } : { left: x + 10 }}
    >
      <div className="mb-1 font-medium text-ink first-letter:uppercase">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          {r.line ? (
            <span className="h-0.5 w-3 rounded" style={{ background: r.color }} />
          ) : (
            <span className="h-2 w-2 rounded-sm" style={{ background: r.color }} />
          )}
          <span className="num font-semibold text-ink">{r.value}</span>
          <span className="text-ink-muted">{r.label}</span>
        </div>
      ))}
    </div>
  )
}

function YAxis({ ticks, y, width, left, format }: { ticks: number[]; y: (v: number) => number; width: number; left: number; format: (v: number) => string }) {
  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} shapeRendering="crispEdges" />
          <text x={left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="num fill-ink-faint text-[10px]">
            {format(t)}
          </text>
        </g>
      ))}
    </g>
  )
}

/**
 * Columnas agrupadas por categoría (meses, normalmente), con series opcionales como línea encima en la misma escala.
 */
export function ColumnChart({
  labels,
  series,
  height,
  format,
  title,
  yAxis = true,
  ariaLabel,
}: {
  labels: string[]
  series: Series[]
  height: number
  format: (v: number) => string
  /** Título de la ficha para la columna i (por defecto, su etiqueta). */
  title?: (i: number) => ReactNode
  yAxis?: boolean
  ariaLabel: string
}) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState<number | null>(null)
  const cols = series.filter((s) => !s.line)
  const all = series.flatMap((s) => s.values)
  const { ticks, lo, hi } = niceTicks(Math.min(0, ...all), Math.max(0, ...all), 4)
  const left = yAxis ? axisWidth(ticks, format) : 0
  const plotW = Math.max(1, width - left - PAD.right)
  const y = linear(lo, hi, height - PAD.bottom, PAD.top)
  const b = bands(labels.length, plotW, Math.max(1, cols.length))
  const shown = new Set(labelEvery(labels.length, plotW, Math.max(...labels.map(textW), 20) + 10))
  const cx = (i: number) => left + i * b.slot + b.slot / 2
  return (
    <div>
      <Legend series={series} />
      <div ref={ref} className="relative" style={{ height }} onMouseLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={ariaLabel}>
            {yAxis ? (
              <YAxis ticks={ticks} y={y} width={width} left={left} format={format} />
            ) : (
              <line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke="var(--line)" shapeRendering="crispEdges" />
            )}
            {hover != null && (
              <rect x={left + hover * b.slot} y={PAD.top} width={b.slot} height={height - PAD.top - PAD.bottom} fill="var(--line)" opacity={0.35} rx={4} />
            )}
            {cols.map((s, g) =>
              s.values.map((v, i) => (
                <path
                  key={`${s.id}${i}`}
                  d={columnPath(left + b.x(i, g), b.bar, y(0), y(v))}
                  fill={s.color}
                  opacity={hover == null || hover === i ? 1 : 0.55}
                />
              )),
            )}
            {series
              .filter((s) => s.line)
              .map((s) => (
                <g key={s.id}>
                  <polyline
                    points={s.values.map((v, i) => `${cx(i)},${y(v)}`).join(' ')}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {s.values.map((v, i) => (
                    <circle key={i} cx={cx(i)} cy={y(v)} r={hover === i ? 5 : 3.5} fill={s.color} stroke="var(--surface-solid)" strokeWidth={2} />
                  ))}
                </g>
              ))}
            {labels.map((l, i) =>
              shown.has(i) ? (
                <text key={i} x={cx(i)} y={height - 6} textAnchor="middle" className="fill-ink-faint text-[10px]">
                  {l}
                </text>
              ) : null,
            )}
            {/* Zonas de puntero: la columna entera, más grande que la barra. */}
            {labels.map((_, i) => (
              <rect key={`h${i}`} x={left + i * b.slot} y={0} width={b.slot} height={height} fill="transparent" onMouseEnter={() => setHover(i)} />
            ))}
          </svg>
        )}
        {hover != null && (
          <Tip
            x={cx(hover)}
            width={width}
            title={title ? title(hover) : labels[hover]}
            rows={series.map((s) => ({ label: s.label, color: s.color, value: format(s.values[hover] ?? 0), line: s.line }))}
          />
        )}
      </div>
    </div>
  )
}

/** Varias líneas sobre el tiempo, con marcas verticales (p. ej., cuándo se alcanza cada objetivo). */
export function LineChart({
  labels,
  series,
  markers = [],
  height,
  format,
  ariaLabel,
}: {
  labels: string[]
  series: Series[]
  markers?: Marker[]
  height: number
  format: (v: number) => string
  ariaLabel: string
}) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState<number | null>(null)
  const all = series.flatMap((s) => s.values)
  const { ticks, lo, hi } = niceTicks(Math.min(0, ...all), Math.max(0, ...all), 5)
  const left = axisWidth(ticks, format)
  const n = labels.length
  // Las etiquetas de los extremos van ancladas por dentro: se reserva medio rótulo a la derecha para la última.
  const lw = Math.max(...labels.map(textW), 20)
  const plotW = Math.max(1, width - left - PAD.right - lw / 2)
  const x = linear(0, Math.max(1, n - 1), left, left + plotW)
  const y = linear(lo, hi, height - PAD.bottom, PAD.top)
  // La primera va anclada a la izquierda (ocupa [x, x + lw]): las que la pisarían se saltan.
  const shown = labelEvery(n, plotW, lw + 14).filter((i) => i === 0 || x(i) - lw / 2 >= x(0) + lw + 8)
  const at = (clientX: number, rect: DOMRect) => Math.max(0, Math.min(n - 1, Math.round(((clientX - rect.left - left) / plotW) * (n - 1))))
  return (
    <div className="flex h-full flex-col">
      <Legend series={series.map((s) => ({ ...s, line: true }))} />
      <div
        ref={ref}
        className="relative min-h-0 flex-1"
        style={{ height }}
        onMouseMove={(e) => setHover(at(e.clientX, e.currentTarget.getBoundingClientRect()))}
        onMouseLeave={() => setHover(null)}
      >
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={ariaLabel}>
            <YAxis ticks={ticks} y={y} width={width} left={left} format={format} />
            {markers
              .filter((m) => m.index >= 0 && m.index < n)
              .map((m) => (
                <g key={m.label}>
                  <line x1={x(m.index)} x2={x(m.index)} y1={PAD.top} y2={height - PAD.bottom} stroke={m.color} strokeWidth={1.5} strokeDasharray="4 4" />
                  <text x={x(m.index) - 4} y={PAD.top + 10} textAnchor="end" className="fill-ink-muted text-[11px] font-medium">
                    {m.label}
                  </text>
                </g>
              ))}
            {series.map((s) => (
              <polyline
                key={s.id}
                points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray={s.dashed ? '6 4' : undefined}
              />
            ))}
            {hover != null && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={height - PAD.bottom} stroke="var(--line-strong)" strokeWidth={1} />
                {series.map((s) => (
                  <circle key={s.id} cx={x(hover)} cy={y(s.values[hover] ?? 0)} r={4.5} fill={s.color} stroke="var(--surface-solid)" strokeWidth={2} />
                ))}
              </g>
            )}
            {shown.map((i) => (
              <text key={i} x={x(i)} y={height - 6} textAnchor={i === 0 ? 'start' : 'middle'} className="fill-ink-faint text-[10px]">
                {labels[i]}
              </text>
            ))}
          </svg>
        )}
        {hover != null && (
          <Tip
            x={x(hover)}
            width={width}
            title={labels[hover]}
            rows={series.map((s) => ({ label: s.label, color: s.color, value: format(s.values[hover] ?? 0), line: true }))}
          />
        )}
      </div>
    </div>
  )
}
