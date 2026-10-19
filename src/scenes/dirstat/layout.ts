import type { CityNode } from '../../model/hierarchy'

/**
 * Vista WinDirStat: treemap con «cojines» (van Wijk y van de Wetering, como SequoiaView y WinDirStat). Cada nodo se
 * reparte en filas cuadradas (squarified) y cada nivel añade un relieve parabólico a su rectángulo; al pintar, la luz
 * sobre esa superficie da el brillo de cada píxel. Lógica pura: el lienzo solo copia los píxeles.
 */

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface DsLeaf {
  node: CityNode
  rect: Rect
  /** Coeficientes de la superficie del cojín: z = s0·x² + s1·y² + s2·x + s3·y. */
  surface: [number, number, number, number]
}

export interface DsLayout {
  leaves: DsLeaf[]
  /** Rectángulo de cada nodo (también los intermedios), para marcar la selección. */
  rects: Map<string, Rect>
}

/** Parámetros de WinDirStat por defecto: altura del cojín y cuánto se aplana en cada nivel. */
export const CUSHION_HEIGHT = 0.38
export const CUSHION_SCALE = 0.91

function addRidge(r: Rect, s: [number, number, number, number], h: number): [number, number, number, number] {
  const out: [number, number, number, number] = [...s]
  const h4 = 4 * h
  if (r.w > 0) {
    const wf = h4 / r.w
    out[2] += wf * (2 * r.x + r.w)
    out[0] -= wf
  }
  if (r.h > 0) {
    const hf = h4 / r.h
    out[3] += hf * (2 * r.y + r.h)
    out[1] -= hf
  }
  return out
}

/** Peor proporción de una fila (cuanto más cerca de 1, más cuadrados). */
function worst(row: number[], side: number, scale: number): number {
  let sum = 0
  let max = 0
  let min = Infinity
  for (const v of row) {
    sum += v
    if (v > max) max = v
    if (v < min) min = v
  }
  const area = sum * scale
  if (area <= 0 || side <= 0) return Infinity
  const s2 = side * side
  const a2 = area * area
  return Math.max((s2 * max * scale) / a2, a2 / (s2 * min * scale))
}

/** Reparte `values` (de mayor a menor) en `r` con filas lo más cuadradas posible. */
export function squarify(values: number[], r: Rect): Rect[] {
  const total = values.reduce((a, v) => a + v, 0)
  const out: Rect[] = values.map(() => ({ x: r.x, y: r.y, w: 0, h: 0 }))
  if (total <= 0 || r.w <= 0 || r.h <= 0) return out
  let { x, y, w, h } = r
  let rest = total
  let i = 0
  while (i < values.length) {
    const scale = (w * h) / rest
    const side = Math.min(w, h)
    const row = [values[i]]
    let j = i + 1
    while (j < values.length && worst([...row, values[j]], side, scale) <= worst(row, side, scale)) row.push(values[j++])
    const rowSum = row.reduce((a, v) => a + v, 0)
    const thick = (rowSum * scale) / side
    let off = 0
    for (let k = 0; k < row.length; k++) {
      const len = rowSum > 0 ? (row[k] / rowSum) * side : 0
      out[i + k] = w >= h ? { x, y: y + off, w: thick, h: len } : { x: x + off, y, w: len, h: thick }
      off += len
    }
    if (w >= h) {
      x += thick
      w -= thick
    } else {
      y += thick
      h -= thick
    }
    rest -= rowSum
    i = j
  }
  return out
}

export function cushionLayout(root: CityNode, width: number, height: number): DsLayout {
  const leaves: DsLeaf[] = []
  const rects = new Map<string, Rect>()
  const walk = (node: CityNode, r: Rect, surface: [number, number, number, number], h: number) => {
    rects.set(node.id, r)
    const kids = (node.children ?? []).filter((c) => c.value > 0)
    if (!kids.length) {
      if (r.w > 0 && r.h > 0) leaves.push({ node, rect: r, surface })
      return
    }
    const sorted = [...kids].sort((a, b) => b.value - a.value)
    const parts = squarify(
      sorted.map((c) => c.value),
      r,
    )
    sorted.forEach((c, i) => walk(c, parts[i], addRidge(parts[i], surface, h), h * CUSHION_SCALE))
  }
  const box = { x: 0, y: 0, w: width, h: height }
  walk(root, box, addRidge(box, [0, 0, 0, 0], CUSHION_HEIGHT), CUSHION_HEIGHT * CUSHION_SCALE)
  return { leaves, rects }
}

const hex = (c: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim())
  if (!m) return [150, 150, 170]
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Luz como en WinDirStat: de arriba a la izquierda, algo de ambiente. */
const LIGHT = (() => {
  const [x, y, z] = [-1, -1, 10]
  const len = Math.hypot(x, y, z)
  return [x / len, y / len, z / len]
})()
const AMBIENT = 0.15
const BRIGHTNESS = 1.15

/**
 * Pinta los cojines en un búfer RGBA de `width`×`height` (píxeles ya escalados por `scale`). Sin NaN: los
 * rectángulos vacíos se saltan y el coseno se acota antes de usarlo.
 */
export function renderCushions(
  leaves: DsLeaf[],
  width: number,
  height: number,
  scale = 1,
  background: [number, number, number] = [0, 0, 0],
  colorOf: (n: CityNode) => string = (n) => n.color,
): Uint8ClampedArray<ArrayBuffer> {
  const px = new Uint8ClampedArray(new ArrayBuffer(width * height * 4))
  for (let i = 0; i < px.length; i += 4) {
    px[i] = background[0]
    px[i + 1] = background[1]
    px[i + 2] = background[2]
    px[i + 3] = 255
  }
  for (const leaf of leaves) {
    const [r, g, b] = hex(colorOf(leaf.node))
    const s = leaf.surface
    const x0 = Math.max(0, Math.round(leaf.rect.x * scale))
    const y0 = Math.max(0, Math.round(leaf.rect.y * scale))
    const x1 = Math.min(width, Math.round((leaf.rect.x + leaf.rect.w) * scale))
    const y1 = Math.min(height, Math.round((leaf.rect.y + leaf.rect.h) * scale))
    for (let iy = y0; iy < y1; iy++) {
      const y = (iy + 0.5) / scale
      const ny = -(2 * s[1] * y + s[3])
      for (let ix = x0; ix < x1; ix++) {
        const x = (ix + 0.5) / scale
        const nx = -(2 * s[0] * x + s[2])
        let cos = (nx * LIGHT[0] + ny * LIGHT[1] + LIGHT[2]) / Math.sqrt(nx * nx + ny * ny + 1)
        if (!(cos > 0)) cos = 0
        if (cos > 1) cos = 1
        const light = (AMBIENT + (1 - AMBIENT) * cos) * BRIGHTNESS
        const o = (iy * width + ix) * 4
        px[o] = r * light
        px[o + 1] = g * light
        px[o + 2] = b * light
      }
    }
  }
  return px
}

/** La hoja bajo un punto (en coordenadas del layout). */
export function leafAt(leaves: DsLeaf[], x: number, y: number): DsLeaf | undefined {
  return leaves.find((l) => x >= l.rect.x && x < l.rect.x + l.rect.w && y >= l.rect.y && y < l.rect.y + l.rect.h)
}
