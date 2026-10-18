import { hierarchy, treemap, treemapSquarify } from 'd3-hierarchy'
import { heatColor, shade } from '../../lib/color'
import type { CityNode } from '../../model/hierarchy'

export type HeightBy = 'count' | 'value' | 'avg' | 'flat'
export type ColorBy = 'category' | 'heat'

export const HEIGHT_LABEL: Record<HeightBy, string> = {
  count: 'Nº de movimientos',
  value: 'Importe',
  avg: 'Importe medio',
  flat: 'Plano',
}

export const COLOR_LABEL: Record<ColorBy, string> = {
  category: 'Categoría',
  heat: 'Calor (importe)',
}

export interface Block {
  node: CityNode
  /** Centro en el plano XZ y dimensiones; y = 0 es el suelo. */
  x: number
  z: number
  w: number
  d: number
  h: number
  color: string
  /** Índice del distrito al que pertenece (−1 si va suelto). */
  district: number
}

/** Altura de la base: los edificios dentro de un distrito se apoyan sobre su plataforma. */
export function baseY(b: Block): number {
  return b.district >= 0 ? PLINTH_H : 0
}

export interface CityLayout {
  size: number
  districts: Block[]
  buildings: Block[]
}

export interface LayoutOptions {
  /** Niveles visibles a la vez: 1 = solo edificios; 2 = distritos con edificios dentro. */
  depth: 1 | 2
  heightBy: HeightBy
  colorBy: ColorBy
  size?: number
}

interface Wrap {
  node: CityNode
  children?: Wrap[]
}

export const H_MIN = 0.6
export const H_MAX = 30
export const PLINTH_H = 0.35

function wrap(node: CityNode, depth: number): Wrap {
  if (depth === 0 || !node.children?.length) return { node }
  return { node, children: node.children.map((c) => wrap(c, depth - 1)) }
}

/**
 * Treemap de dos niveles: los hijos del nodo visible son distritos (con calles entre ellos) y sus hijos,
 * edificios. Superficie = importe; altura según `heightBy`.
 */
export function layoutCity(view: CityNode, { depth, heightBy, colorBy, size = 100 }: LayoutOptions): CityLayout {
  const tree = hierarchy<Wrap>(wrap(view, depth), (w) => w.children).sum((w) => (w.children ? 0 : Math.max(w.node.value, 1e-6)))
  const street = size * 0.014
  const lot = size * 0.0035
  const root = treemap<Wrap>()
    .tile(treemapSquarify.ratio(1))
    .size([size, size])
    .paddingInner((n) => (n.depth === 0 ? street : lot))
    .paddingOuter((n) => (n.depth === 0 ? 0 : size * 0.006))
    .round(false)(tree)

  const half = size / 2
  const rect = ({ x0, x1, y0, y1 }: { x0: number; x1: number; y0: number; y1: number }) => ({
    x: (x0 + x1) / 2 - half,
    z: (y0 + y1) / 2 - half,
    w: Math.max(x1 - x0, 0.05),
    d: Math.max(y1 - y0, 0.05),
  })

  const districts: Block[] = []
  const districtIndex = new Map<Wrap, number>()
  for (const n of root.children ?? []) {
    if (!n.children) continue
    districtIndex.set(n.data, districts.length)
    districts.push({ node: n.data.node, ...rect(n), h: PLINTH_H, color: n.data.node.color, district: -1 })
  }

  const leaves = root.leaves().filter((l) => l !== root)
  const metric = (n: CityNode) => (heightBy === 'count' ? n.count : heightBy === 'value' ? n.value : heightBy === 'avg' ? n.value / Math.max(n.count, 1) : 1)
  const maxMetric = Math.max(1e-9, ...leaves.map((l) => metric(l.data.node)))
  const maxValue = Math.max(1e-9, ...leaves.map((l) => l.data.node.value))

  const siblingsSeen = new Map<number, number>()
  const buildings: Block[] = leaves.map((l) => {
    const node = l.data.node
    const district = l.parent && l.parent !== root ? (districtIndex.get(l.parent.data) ?? -1) : -1
    const k = siblingsSeen.get(district) ?? 0
    siblingsSeen.set(district, k + 1)
    const h = heightBy === 'flat' ? 2.5 : H_MIN + (H_MAX - H_MIN) * Math.sqrt(metric(node) / maxMetric)
    // Cada barrio es de su color (el del distrito); los edificios vecinos se distinguen con un leve cambio de tono.
    const base = district >= 0 ? districts[district].color : node.color
    const color = colorBy === 'heat' ? heatColor(Math.sqrt(node.value / maxValue)) : shade(base, k % 3 === 0 ? 0 : k % 3 === 1 ? -0.14 : 0.12)
    return { node, ...rect(l), h, color, district }
  })

  return { size, districts, buildings }
}
