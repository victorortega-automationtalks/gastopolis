import clsx from 'clsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { withAlpha } from '../../lib/color'
import { sankeyLayout, type SankeyLink } from '../../lib/sankey'
import { fmtPercent } from '../../model/format'
import type { FlowNode, MoneyFlow } from '../../model/flow'
import { CategoryIcon } from '../../ui/icons'

/**
 * El Río: de dónde viene el dinero y a dónde va, como cintas de colores que pasan del color de la fuente al del
 * destino. Por dentro corre una luz (el agua). Pasar por una cinta o un nodo la resalta; clic en un nodo con
 * categoría la abre en la Ciudad.
 */
export function RiverChart({
  flow,
  money,
  locale,
  height,
  compact = false,
  onPick,
}: {
  flow: MoneyFlow
  money: (v: number) => string
  locale: string
  height: number
  compact?: boolean
  onPick?: (node: FlowNode) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [hover, setHover] = useState<{ node?: string; link?: number } | null>(null)
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // En estrecho, los rótulos van encima del borde de las cintas (con fondo) y el río usa todo el ancho.
  const narrow = width < 560
  const labelW = narrow ? 130 : compact ? 112 : 168
  const padX = narrow ? 2 : labelW
  const layout = useMemo(
    () =>
      width > 0 ? sankeyLayout(flow.nodes, flow.links, { width, height, nodeWidth: compact ? 10 : 14, gap: compact ? 8 : 16, padX }) : { nodes: [], links: [] },
    [flow, width, height, compact, padX],
  )
  const color = useMemo(() => new Map(flow.nodes.map((n) => [n.id, n.color])), [flow])
  const lastCol = Math.max(0, ...flow.nodes.map((n) => n.column))

  const isLit = (i: number) => {
    if (!hover) return true
    const l = layout.links[i].data
    return hover.link === i || hover.node === l.source || hover.node === l.target
  }
  const hl = hover?.link != null ? layout.links[hover.link] : null

  return (
    <div
      ref={box}
      className="relative w-full text-ink select-none"
      style={{ height }}
      onMouseLeave={() => setHover(null)}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        setPointer({ x: e.clientX - r.left, y: e.clientY - r.top })
      }}
    >
      {width > 0 && (
        <svg width={width} height={height} className="absolute inset-0 overflow-visible" role="img" aria-label="De dónde viene y a dónde va tu dinero">
          <defs>
            {layout.links.map((l, i) => (
              <linearGradient key={i} id={`river-g${i}`} gradientUnits="userSpaceOnUse" x1={l.x0} x2={l.x1} y1={0} y2={0}>
                <stop offset="0%" stopColor={color.get(l.data.source)} />
                <stop offset="100%" stopColor={color.get(l.data.target)} />
              </linearGradient>
            ))}
          </defs>
          {layout.links.map((l, i) => (
            <path
              key={`r${i}`}
              d={l.path}
              fill={`url(#river-g${i})`}
              opacity={isLit(i) ? (hover?.link === i ? 0.95 : 0.62) : 0.12}
              className="transition-opacity duration-200"
              onMouseEnter={() => setHover({ link: i })}
            />
          ))}
          {/* Halo de cada nodo: un rectángulo más ancho y tenue detrás (un filtro drop-shadow obliga a repintar). */}
          {layout.nodes.map((n) => (
            <rect
              key={`h${n.data.id}`}
              x={n.x - 4}
              y={n.y - 4}
              width={n.w + 8}
              height={Math.max(1, n.h) + 8}
              rx={6}
              fill={withAlpha(n.data.color, 0.22)}
              className="pointer-events-none"
            />
          ))}
          {layout.nodes.map((n) => (
            <rect
              key={n.data.id}
              x={n.x}
              y={n.y}
              width={n.w}
              height={Math.max(1, n.h)}
              rx={3}
              fill={n.data.color}
              onMouseEnter={() => setHover({ node: n.data.id })}
            />
          ))}
        </svg>
      )}
      {width > 0 && <Water links={layout.links} width={width} height={height} lit={isLit} />}

      {/* Rótulos en HTML: chips legibles con icono, nombre e importe. */}
      {layout.nodes.map((n) => {
        const left = narrow ? n.data.column === lastCol : n.data.column === 0
        const right = !narrow && n.data.column === lastCol
        const lit =
          !hover ||
          hover.node === n.data.id ||
          (hover.link != null && [layout.links[hover.link].data.source, layout.links[hover.link].data.target].includes(n.data.id))
        const tiny = n.h < (compact ? 16 : 22)
        return (
          <button
            key={n.data.id}
            type="button"
            onMouseEnter={() => setHover({ node: n.data.id })}
            onClick={() => n.data.categoryId && onPick?.(n.data)}
            className={clsx(
              'absolute flex -translate-y-1/2 items-center gap-1.5 rounded-lg px-1.5 py-1 text-left transition',
              left ? '-translate-x-full flex-row-reverse text-right' : '',
              (narrow || (!left && !right)) && 'glass',
              n.data.categoryId && onPick ? 'cursor-pointer hover:bg-surface-2' : 'cursor-default',
              lit ? 'opacity-100' : 'opacity-40',
            )}
            style={{ top: n.y + n.h / 2, left: left ? n.x - 6 : n.x + n.w + 6, maxWidth: labelW - 8 }}
            title={`${n.data.label}: ${money(n.data.value)} (${fmtPercent(n.data.value / Math.max(flow.total, 1e-9), locale)})`}
          >
            {!compact && (
              <span
                className="chip-ink flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                style={{ '--c': n.data.color, background: withAlpha(n.data.color, 0.18) } as React.CSSProperties}
              >
                <CategoryIcon name={n.data.icon} size={13} />
              </span>
            )}
            <span className="min-w-0 leading-tight">
              <span className={clsx('block truncate font-medium', compact ? 'text-[11px]' : 'text-sm')}>{n.data.label}</span>
              {!tiny && <span className={clsx('num block truncate text-ink-muted', compact ? 'text-[10px]' : 'text-xs')}>{money(n.data.value)}</span>}
            </span>
          </button>
        )
      })}

      {hl && (
        <div
          className="glass pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg px-2.5 py-1.5 text-xs shadow-xl"
          style={{ left: pointer?.x ?? (hl.x0 + hl.x1) / 2, top: (pointer?.y ?? (hl.sy + hl.ty) / 2) - 12 }}
        >
          <span className="font-medium">
            {flow.nodes.find((n) => n.id === hl.data.source)?.label} → {flow.nodes.find((n) => n.id === hl.data.target)?.label}
          </span>
          <span className="num ml-2 text-ink-muted">
            {money(hl.data.value)} · {fmtPercent(hl.data.value / Math.max(flow.total, 1e-9), locale)}
          </span>
        </div>
      )}
    </div>
  )
}

/**
 * El agua: estelas de luz que corren por cada cinta hacia su destino. En un lienzo propio y no como trazos SVG
 * animados: animar un centenar de trazos obliga a repintar todo el SVG en cada fotograma (7 fps sin GPU); aquí son
 * unos cientos de segmentos cortos por fotograma. Con «reducir movimiento», quietas.
 */
function Water({
  links,
  width,
  height,
  lit,
}: {
  links: SankeyLink<{ source: string; target: string; value: number }>[]
  width: number
  height: number
  lit: (i: number) => boolean
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const litRef = useRef(lit)
  useEffect(() => {
    litRef.current = lit
  })
  // Carriles: cada cinta ancha lleva varios, como en un río. Puntos de la curva precalculados.
  const lanes = useMemo(() => {
    const out: { link: number; pts: Float32Array; speed: number; phase: number }[] = []
    links.forEach((l, i) => {
      if (l.width < 3) return
      const n = Math.min(4, Math.max(1, Math.round(l.width / 26)))
      for (let k = 0; k < n; k++) {
        const off = (l.width * (k + 1)) / (n + 1)
        const y0 = l.sy + off
        const y1 = l.ty + off
        const xm = (l.x0 + l.x1) / 2
        const steps = 48
        const pts = new Float32Array((steps + 1) * 2)
        for (let s = 0; s <= steps; s++) {
          const t = s / steps
          const u = 1 - t
          // Bézier cúbica (x0,y0) (xm,y0) (xm,y1) (x1,y1).
          pts[s * 2] = u * u * u * l.x0 + 3 * u * u * t * xm + 3 * u * t * t * xm + t * t * t * l.x1
          pts[s * 2 + 1] = u * u * u * y0 + 3 * u * u * t * y0 + 3 * u * t * t * y1 + t * t * t * y1
        }
        out.push({ link: i, pts, speed: 0.16 + ((i * 7 + k * 3) % 5) * 0.03, phase: ((i * 13 + k * 7) % 17) / 17 })
      }
    })
    return out
  }, [links])

  useEffect(() => {
    const c = canvas.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    c.width = Math.round(width * dpr)
    c.height = Math.round(height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.lineCap = 'round'
    ctx.lineWidth = 1.4
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    const DASH = 0.12
    const draw = (now: number) => {
      ctx.clearRect(0, 0, width, height)
      for (const lane of lanes) {
        ctx.strokeStyle = litRef.current(lane.link) ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.05)'
        const steps = lane.pts.length / 2 - 1
        // Dos estelas por carril, separadas medio recorrido.
        for (const extra of [0, 0.5]) {
          const head = (lane.phase + extra + (reduce ? 0 : (now / 1000) * lane.speed)) % 1
          const from = Math.max(0, Math.floor((head - DASH) * steps))
          const to = Math.min(steps, Math.ceil(head * steps))
          if (to <= from) continue
          ctx.beginPath()
          ctx.moveTo(lane.pts[from * 2], lane.pts[from * 2 + 1])
          for (let s = from + 1; s <= to; s++) ctx.lineTo(lane.pts[s * 2], lane.pts[s * 2 + 1])
          ctx.stroke()
        }
      }
      if (!reduce) raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [lanes, width, height])

  return <canvas ref={canvas} style={{ width, height }} className="pointer-events-none absolute inset-0" aria-hidden />
}
