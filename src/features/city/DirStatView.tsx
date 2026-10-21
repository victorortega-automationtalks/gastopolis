import clsx from 'clsx'
import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import { useCategoryMap, useSettings } from '../../data/hooks'
import { withAlpha } from '../../lib/color'
import { fmtDate, fmtMoney } from '../../model/format'
import type { CityNode } from '../../model/hierarchy'
import { shownDate } from '../../model/payday'
import { cushionLayout, leafAt, renderCushions, TREELIST_COLORS, windirstatColor, type DsLayout } from '../../scenes/dirstat/layout'

/**
 * Modo WinDirStat: arriba el árbol (como las carpetas, con barra de proporción, porcentaje, importe y movimientos), a
 * la derecha las categorías (como la lista de extensiones) y abajo el treemap con relieve, donde cada movimiento es un
 * bloque del color de su categoría. Seleccionar en un sitio lo marca en el otro.
 */
export function DirStatView({
  root,
  view,
  onZoom,
  onOpenMovement,
}: {
  /** Todo lo que se explora: los colores salen de aquí para que no cambien al entrar en una carpeta. */
  root: CityNode
  view: CityNode
  onZoom: (n: CityNode) => void
  onOpenMovement: (id: string) => void
}) {
  const settings = useSettings()
  const catMap = useCategoryMap()
  const money = (v: number) => fmtMoney(v, { currency: settings.currency, locale: settings.locale })
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([view.id]))
  const [selected, setSelected] = useState<string | null>(null)
  const [catPick, setCatPick] = useState<string | null>(null)

  // Al cambiar de vista (zoom o filtros), se empieza con la raíz abierta.
  const [lastView, setLastView] = useState(view.id)
  if (lastView !== view.id) {
    setLastView(view.id)
    setExpanded(new Set([view.id]))
    setSelected(null)
  }

  // Como WinDirStat con las extensiones: la categoría que más suma lleva el primer color de su paleta, la segunda el
  // segundo… y de la 13.ª en adelante, todas el mismo.
  const rank = useMemo(() => {
    const acc = new Map<string, number>()
    const walk = (n: CityNode) => {
      if (n.movement) acc.set(n.movement.categoryId, (acc.get(n.movement.categoryId) ?? 0) + n.value)
      n.children?.forEach(walk)
    }
    walk(root)
    return new Map([...acc].sort((a, b) => b[1] - a[1]).map(([id], i) => [id, windirstatColor(i)]))
  }, [root])
  const colorOf = useMemo(() => {
    return (n: CityNode) => {
      const id = n.movement?.categoryId ?? n.categoryId
      return (id && rank.get(id)) || windirstatColor(12)
    }
  }, [rank])

  // Padres y última fecha de cada nodo, para abrir el camino hasta una hoja y para la columna «Último».
  const { parents, lastDate } = useMemo(() => {
    const parents = new Map<string, CityNode>()
    const lastDate = new Map<string, string>()
    const walk = (n: CityNode): string => {
      let last = n.movement ? shownDate(n.movement) : ''
      for (const c of n.children ?? []) {
        parents.set(c.id, n)
        const d = walk(c)
        if (d > last) last = d
      }
      lastDate.set(n.id, last)
      return last
    }
    walk(view)
    return { parents, lastDate }
  }, [view])

  // Categorías de lo que se ve (la «lista de extensiones»).
  const legend = useMemo(() => {
    const acc = new Map<string, { value: number; count: number }>()
    const walk = (n: CityNode) => {
      if (n.movement) {
        const e = acc.get(n.movement.categoryId) ?? { value: 0, count: 0 }
        e.value += n.value
        e.count++
        acc.set(n.movement.categoryId, e)
      }
      n.children?.forEach(walk)
    }
    walk(view)
    return [...acc].map(([id, e]) => ({ id, cat: catMap.get(id), ...e })).sort((a, b) => b.value - a.value)
  }, [view, catMap])

  const reveal = (id: string) => {
    const next = new Set(expanded)
    for (let p = parents.get(id); p; p = parents.get(p.id)) next.add(p.id)
    setExpanded(next)
    setSelected(id)
    requestAnimationFrame(() => document.getElementById(`ds-row-${cssId(id)}`)?.scrollIntoView({ block: 'nearest' }))
  }

  const rows = useMemo(() => {
    const out: { node: CityNode; depth: number; parent?: CityNode }[] = []
    const walk = (n: CityNode, depth: number, parent?: CityNode) => {
      out.push({ node: n, depth, parent })
      if (!expanded.has(n.id)) return
      const kids = n.children ?? []
      for (const c of kids.slice(0, 500)) walk(c, depth + 1, n)
    }
    walk(view, 0)
    return out
  }, [view, expanded])

  const total = view.value
  const selectedNode = selected ? (selected === view.id ? view : findDeep(view, selected)) : null

  return (
    <div className="dirstat flex h-full min-h-0 flex-col text-[12px]">
      <div className="flex min-h-0 flex-[0_0_44%] border-b border-[var(--ds-line-strong)]">
        {/* Árbol */}
        <div className="min-w-0 flex-1 overflow-auto">
          <table className="w-full min-w-[46rem] border-collapse">
            <thead className="sticky top-0 z-[1] bg-[var(--ds-bg)] text-left">
              <tr className="[&>th]:border-r [&>th]:border-b [&>th]:border-[var(--ds-line-strong)] [&>th]:px-2 [&>th]:py-1 [&>th]:font-normal">
                <th>Nombre</th>
                <th className="w-32">Proporción</th>
                <th className="w-24 text-right">Porcentaje</th>
                <th className="w-32 text-right">Importe</th>
                <th className="w-24 text-right">Movimientos</th>
                <th className="w-28 text-right">Último</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ node: n, depth, parent }) => {
                const hasKids = !!n.children?.length
                const open = expanded.has(n.id)
                const pct = parent ? n.value / (parent.value || 1) : 1
                const isSel = selected === n.id
                const Icon = hasKids ? (open ? FolderOpen : Folder) : FileText
                return (
                  <tr
                    key={n.id}
                    id={`ds-row-${cssId(n.id)}`}
                    onClick={() => setSelected(n.id)}
                    onDoubleClick={() => (hasKids ? onZoom(n) : n.movement && onOpenMovement(n.movement.id))}
                    className={clsx(
                      'cursor-default select-none [&>td]:px-2 [&>td]:py-[2px]',
                      isSel ? 'bg-[var(--ds-sel)] text-[var(--ds-sel-ink)]' : 'hover:bg-[var(--ds-hover)]',
                    )}
                  >
                    <td className="max-w-0">
                      <div className="flex items-center gap-1 truncate" style={{ paddingLeft: depth * 16 }}>
                        <button
                          className={clsx('shrink-0 rounded p-0.5 opacity-70 hover:opacity-100', !hasKids && 'invisible')}
                          onClick={(e) => {
                            e.stopPropagation()
                            const next = new Set(expanded)
                            if (open) next.delete(n.id)
                            else next.add(n.id)
                            setExpanded(next)
                          }}
                          aria-label={open ? 'Plegar' : 'Desplegar'}
                        >
                          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        </button>
                        <Icon
                          size={15}
                          className="shrink-0"
                          style={
                            hasKids
                              ? { color: 'var(--ds-folder)', fill: 'var(--ds-folder)', fillOpacity: 0.35 }
                              : { color: isSel ? undefined : 'var(--ds-faint)' }
                          }
                        />
                        <span className="truncate">{n.label}</span>
                        {n.children && n.children.length > 500 && open && <span className="opacity-70">(500 de {n.children.length})</span>}
                      </div>
                    </td>
                    <td>
                      {/* «Proporción» como en WinDirStat: un color por profundidad, la barra sangrada según el nivel. */}
                      <div className="h-3.5" style={{ marginLeft: Math.min(depth, 6) * 6 }}>
                        <div className="h-full" style={{ background: depthTrack(depth) }}>
                          <div className="h-full" style={{ width: `${pct * 100}%`, background: depthColor(depth) }} />
                        </div>
                      </div>
                    </td>
                    <td className="text-right tabular-nums">{(pct * 100).toFixed(2).replace('.', ',')} %</td>
                    <td className="text-right tabular-nums">{money(n.value)}</td>
                    <td className="text-right tabular-nums">{n.count.toLocaleString('es-ES')}</td>
                    <td className="text-right tabular-nums">{lastDate.get(n.id) ? fmtDate(lastDate.get(n.id)!) : ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Categorías, como la lista de extensiones */}
        <div className="hidden w-80 shrink-0 overflow-auto border-l border-[var(--ds-line-strong)] md:block">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-[var(--ds-bg)] text-left">
              <tr className="[&>th]:border-r [&>th]:border-b [&>th]:border-[var(--ds-line-strong)] [&>th]:px-2 [&>th]:py-1 [&>th]:font-normal">
                <th>Categoría</th>
                <th className="w-12">Color</th>
                <th className="text-right">Importe</th>
                <th className="text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {legend.map((l) => {
                const color = rank.get(l.id) ?? windirstatColor(12)
                return (
                  <tr
                    key={l.id}
                    onClick={() => setCatPick(catPick === l.id ? null : l.id)}
                    className={clsx(
                      'cursor-default [&>td]:px-2 [&>td]:py-[2px]',
                      catPick === l.id ? 'bg-[var(--ds-sel)] text-[var(--ds-sel-ink)]' : 'hover:bg-[var(--ds-hover)]',
                    )}
                    title={`${l.count} movimientos`}
                  >
                    <td className="max-w-0 truncate">{l.cat?.name ?? 'Sin categoría'}</td>
                    <td>
                      <span className="block h-3.5 w-9 rounded-[2px]" style={cushionSwatch(color)} />
                    </td>
                    <td className="text-right tabular-nums">{money(l.value)}</td>
                    <td className="text-right tabular-nums">{total ? ((l.value / total) * 100).toFixed(1).replace('.', ',') : '0'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Treemap
        view={view}
        colorOf={colorOf}
        selectedId={selected}
        categoryId={catPick}
        onPick={(n) => reveal(n.id)}
        onOpen={(n) => n.movement && onOpenMovement(n.movement.id)}
        money={money}
      />

      {/* Barra de estado */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 border-t border-[var(--ds-line-strong)] bg-[var(--ds-face)] px-3 py-1 text-[var(--ds-muted)]">
        <span>Listo</span>
        <span className="min-w-0 flex-1 truncate">
          {selectedNode ? `${selectedNode.label} · ${money(selectedNode.value)} · ${selectedNode.count} mov.` : ''}
        </span>
        <span className="num">Total: {money(total)}</span>
        <span className="num">{view.count.toLocaleString('es-ES')} movimientos</span>
      </div>
    </div>
  )
}

/** Muestra de color con relieve, como las de WinDirStat. */
const cushionSwatch = (c: string): CSSProperties => ({
  background: `radial-gradient(ellipse at 35% 35%, rgb(255 255 255 / 0.55) 0%, ${c} 45%, ${withAlpha(c, 0.55)} 100%), ${c}`,
})

const rgb = ([r, g, b]: [number, number, number], a = 1) => `rgb(${r} ${g} ${b} / ${a})`
const depthColor = (d: number) => rgb(TREELIST_COLORS[d % TREELIST_COLORS.length])
const depthTrack = (d: number) => rgb(TREELIST_COLORS[d % TREELIST_COLORS.length], 0.25)

const cssId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '_')

function findDeep(root: CityNode, id: string): CityNode | null {
  if (root.id === id) return root
  for (const c of root.children ?? []) {
    if (id === c.id || id.startsWith(c.id + '/')) return findDeep(c, id)
  }
  return null
}

function Treemap({
  view,
  colorOf,
  selectedId,
  categoryId,
  onPick,
  onOpen,
  money,
}: {
  view: CityNode
  colorOf: (n: CityNode) => string
  selectedId: string | null
  categoryId: string | null
  onPick: (n: CityNode) => void
  onOpen: (n: CityNode) => void
  money: (v: number) => string
}) {
  const box = useRef<HTMLDivElement>(null)
  const base = useRef<HTMLCanvasElement>(null)
  const overlay = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [hover, setHover] = useState<{ x: number; y: number; node: CityNode } | null>(null)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.floor(e.contentRect.width), h: Math.floor(e.contentRect.height) }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const dpr = typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio || 1)
  const layout: DsLayout | null = useMemo(() => (size.w > 4 && size.h > 4 ? cushionLayout(view, size.w, size.h) : null), [view, size])

  // El relieve se pinta una vez por cambio de datos o de tamaño.
  useEffect(() => {
    const c = base.current
    if (!c || !layout) return
    const W = Math.round(size.w * dpr)
    const H = Math.round(size.h * dpr)
    c.width = W
    c.height = H
    const px = renderCushions(layout.leaves, W, H, dpr, [0, 0, 0], colorOf)
    c.getContext('2d')?.putImageData(new ImageData(px, W, H), 0, 0)
  }, [layout, size, dpr, colorOf])

  // Selección y categoría marcada, en una capa encima (sin repintar el relieve).
  useEffect(() => {
    const c = overlay.current
    if (!c || !layout) return
    c.width = Math.round(size.w * dpr)
    c.height = Math.round(size.h * dpr)
    const g = c.getContext('2d')
    if (!g) return
    g.scale(dpr, dpr)
    if (categoryId) {
      g.strokeStyle = 'rgba(255,255,255,0.9)'
      g.lineWidth = 1
      for (const l of layout.leaves)
        if (l.node.movement?.categoryId === categoryId) g.strokeRect(l.rect.x + 0.5, l.rect.y + 0.5, Math.max(0, l.rect.w - 1), Math.max(0, l.rect.h - 1))
    }
    const r = selectedId ? layout.rects.get(selectedId) : undefined
    if (r) {
      g.lineWidth = 3
      g.strokeStyle = 'rgba(0,0,0,0.85)'
      g.strokeRect(r.x + 1.5, r.y + 1.5, Math.max(0, r.w - 3), Math.max(0, r.h - 3))
      g.lineWidth = 1.5
      g.strokeStyle = 'rgba(255,255,255,1)'
      g.strokeRect(r.x + 1.5, r.y + 1.5, Math.max(0, r.w - 3), Math.max(0, r.h - 3))
    }
  }, [layout, size, dpr, selectedId, categoryId])

  const at = (e: ReactMouseEvent) => {
    const rect = box.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    return { x, y, leaf: layout ? leafAt(layout.leaves, x, y) : undefined }
  }

  return (
    <div
      ref={box}
      className="relative min-h-40 flex-1 overflow-hidden bg-black"
      onMouseMove={(e) => {
        const { x, y, leaf } = at(e)
        setHover(leaf ? { x, y, node: leaf.node } : null)
      }}
      onMouseLeave={() => setHover(null)}
      onClick={(e) => {
        const { leaf } = at(e)
        if (leaf) onPick(leaf.node)
      }}
      onDoubleClick={(e) => {
        const { leaf } = at(e)
        if (leaf) onOpen(leaf.node)
      }}
    >
      <canvas ref={base} className="absolute inset-0 h-full w-full" />
      <canvas ref={overlay} className="pointer-events-none absolute inset-0 h-full w-full" />
      {hover && (
        <div
          className="pointer-events-none absolute z-10 max-w-72 rounded-md border border-line-strong bg-surface-solid px-2.5 py-1.5 text-xs shadow-xl"
          style={{ left: Math.min(hover.x + 14, size.w - 290), top: Math.min(hover.y + 14, size.h - 70) }}
        >
          <div className="truncate font-medium text-ink">{hover.node.label}</div>
          <div className="num text-ink-muted">
            {money(hover.node.value)}
            {hover.node.movement && ` · ${fmtDate(shownDate(hover.node.movement))}`}
          </div>
        </div>
      )}
    </div>
  )
}
