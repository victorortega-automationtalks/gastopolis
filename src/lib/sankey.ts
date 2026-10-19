/**
 * Geometría de un diagrama de Sankey por columnas: nodos apilados en vertical (altura = importe) y cintas que
 * unen la salida de un nodo con la entrada de otro. Puro: sin DOM, para poder probarlo.
 */

export interface SankeyNodeIn {
  id: string
  column: number
  value: number
}

export interface SankeyLinkIn {
  source: string
  target: string
  value: number
}

export interface SankeyNode<N> {
  data: N
  x: number
  y: number
  w: number
  h: number
}

export interface SankeyLink<L> {
  data: L
  /** Grosor de la cinta. */
  width: number
  /** Borde superior de la cinta a la salida y a la entrada. */
  sy: number
  ty: number
  x0: number
  x1: number
  /** Trazado SVG del área de la cinta. */
  path: string
}

export interface SankeyOptions {
  width: number
  height: number
  nodeWidth?: number
  gap?: number
  /** Margen a izquierda y derecha (para los rótulos). */
  padX?: number
}

export function sankeyLayout<N extends SankeyNodeIn, L extends SankeyLinkIn>(
  nodesIn: N[],
  linksIn: L[],
  opts: SankeyOptions,
): { nodes: SankeyNode<N>[]; links: SankeyLink<L>[] } {
  const { width, height, nodeWidth = 14, gap = 14, padX = 0 } = opts
  const columns = Math.max(1, ...nodesIn.map((n) => n.column + 1))
  const byCol = Array.from({ length: columns }, (_, c) => nodesIn.filter((n) => n.column === c))
  // Una sola escala para todas las columnas: el mismo euro mide lo mismo en todas.
  const k = Math.min(
    ...byCol
      .filter((col) => col.length)
      .map(
        (col) =>
          (height - gap * (col.length - 1)) /
          Math.max(
            1e-9,
            col.reduce((a, n) => a + n.value, 0),
          ),
      ),
  )
  const scale = Number.isFinite(k) && k > 0 ? k : 0
  const step = columns > 1 ? (width - 2 * padX - nodeWidth) / (columns - 1) : 0

  const nodes = new Map<string, SankeyNode<N>>()
  byCol.forEach((col, c) => {
    const used = col.reduce((a, n) => a + n.value * scale, 0) + gap * (col.length - 1)
    let y = (height - used) / 2
    for (const n of col) {
      const h = n.value * scale
      nodes.set(n.id, { data: n, x: padX + c * step, y, w: nodeWidth, h })
      y += h + gap
    }
  })

  // Las cintas salen y llegan ordenadas por la posición del otro extremo: así no se cruzan sin necesidad.
  const outOff = new Map<string, number>()
  const inOff = new Map<string, number>()
  const valid = linksIn.filter((l) => nodes.has(l.source) && nodes.has(l.target) && l.value > 0)
  const bySource = [...valid].sort((a, b) => nodes.get(a.source)!.y - nodes.get(b.source)!.y || nodes.get(a.target)!.y - nodes.get(b.target)!.y)
  const sy = new Map<L, number>()
  for (const l of bySource) {
    const s = nodes.get(l.source)!
    const off = outOff.get(l.source) ?? 0
    sy.set(l, s.y + off)
    outOff.set(l.source, off + l.value * scale)
  }
  const byTarget = [...valid].sort((a, b) => nodes.get(a.target)!.y - nodes.get(b.target)!.y || nodes.get(a.source)!.y - nodes.get(b.source)!.y)
  const links: SankeyLink<L>[] = byTarget.map((l) => {
    const s = nodes.get(l.source)!
    const t = nodes.get(l.target)!
    const off = inOff.get(l.target) ?? 0
    inOff.set(l.target, off + l.value * scale)
    const w = l.value * scale
    const y0 = sy.get(l)!
    const y1 = t.y + off
    const x0 = s.x + s.w
    const x1 = t.x
    const xm = (x0 + x1) / 2
    const path = `M${x0},${y0} C${xm},${y0} ${xm},${y1} ${x1},${y1} L${x1},${y1 + w} C${xm},${y1 + w} ${xm},${y0 + w} ${x0},${y0 + w} Z`
    return { data: l, width: w, sy: y0, ty: y1, x0, x1, path }
  })
  return { nodes: [...nodes.values()], links }
}
