/**
 * Geometría de una cresta, a mano y sin ExtrudeGeometry: lámina superior, caras delantera y trasera y tapas. Las
 * normales son analíticas (de la pendiente), nunca de triángulos degenerados: un solo NaN en una normal se convierte
 * en un píxel NaN, y el bloom lo extiende hasta dejar la imagen negra.
 *
 * Las alturas se pueden reescalar cada fotograma (`applyReveal`) para la animación sin reconstruir nada.
 */

export interface RidgeBuffers {
  positions: Float32Array
  normals: Float32Array
  colors: Float32Array
  index: Uint32Array
  /** Altura final de cada vértice (0 en la base) y su x, para la animación. */
  baseY: Float32Array
  xs: Float32Array
  /** Índices de los vértices de la lámina superior (los que tienen normal que depende de la pendiente). */
  topCount: number
  /** Cinta luminosa en el borde delantero: posiciones e índices. */
  crest: { positions: Float32Array; index: Uint32Array; baseY: Float32Array; xs: Float32Array }
}

export interface RGB {
  r: number
  g: number
  b: number
}

/** Altura mínima: la cresta nunca es una lámina de grosor cero (y deja ver el camino cuando aún no ha crecido). */
export const MIN_H = 0.04
const CREST_BAND = 0.22

/**
 * `peak` es la altura de referencia para el color: los valles quedan oscuros y las cumbres con todo su color (si no,
 * los días sin gasto se ven como anchas franjas claras).
 */
export function buildRidge(profile: number[], width: number, thickness: number, top: RGB, base: RGB, peak?: number): RidgeBuffers {
  const n = profile.length
  const hz = thickness / 2
  const xAt = (i: number) => (n > 1 ? (i / (n - 1)) * width : 0) - width / 2
  const h = profile.map((v) => Math.max(MIN_H, Number.isFinite(v) ? v : 0))
  // Lámina (2n) + delantera (2n) + trasera (2n) + dos tapas (4 + 4).
  const count = 6 * n + 8
  const positions = new Float32Array(count * 3)
  const normals = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const baseY = new Float32Array(count)
  const xs = new Float32Array(count)
  let v = 0
  const put = (x: number, y: number, z: number, nx: number, ny: number, nz: number, c: RGB) => {
    positions.set([x, y, z], v * 3)
    normals.set([nx, ny, nz], v * 3)
    colors.set([c.r, c.g, c.b], v * 3)
    baseY[v] = y
    xs[v] = x
    return v++
  }
  const mix = (a: RGB, b: RGB, t: number): RGB => ({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t })
  const lit = mix(top, { r: 1, g: 1, b: 1 }, 0.1)
  const ref = Math.max(1e-6, peak ?? Math.max(...h))
  // Color según la altura: el valle casi en sombra, todo el color en cuanto sube algo (curva suave). La mezcla es
  // en espacio lineal: un 8 % aquí se ve como un tercio en pantalla.
  const byHeight = (c: RGB, y: number) => {
    const t = Math.min(1, y / (ref * 0.3))
    return mix(base, c, 0.08 + 0.92 * t * (2 - t))
  }

  const idx: number[] = []
  // Lámina superior.
  const topStart = v
  for (let i = 0; i < n; i++) {
    const [nx, ny] = slopeNormal(h, i, width / Math.max(1, n - 1))
    put(xAt(i), h[i], hz, nx, ny, 0, byHeight(lit, h[i]))
    put(xAt(i), h[i], -hz, nx, ny, 0, byHeight(lit, h[i]))
  }
  for (let i = 0; i < n - 1; i++) {
    const a = topStart + 2 * i
    idx.push(a, a + 2, a + 1, a + 2, a + 3, a + 1)
  }
  const topCount = v - topStart
  // Caras delantera (+z) y trasera (−z): degradado de la cresta a la base, más oscura.
  for (const side of [1, -1]) {
    const start = v
    for (let i = 0; i < n; i++) {
      put(xAt(i), h[i], side * hz, 0, 0, side, byHeight(top, h[i]))
      put(xAt(i), 0, side * hz, 0, 0, side, base)
    }
    for (let i = 0; i < n - 1; i++) {
      const t0 = start + 2 * i
      const b0 = t0 + 1
      const t1 = t0 + 2
      const b1 = t0 + 3
      if (side === 1) idx.push(b0, b1, t0, b1, t1, t0)
      else idx.push(b0, t0, b1, b1, t0, t1)
    }
  }
  // Tapas en los extremos.
  for (const [i, side] of [
    [0, -1],
    [n - 1, 1],
  ] as const) {
    const x = xAt(i)
    const p0 = put(x, 0, hz, side, 0, 0, base)
    const p1 = put(x, h[i], hz, side, 0, 0, byHeight(top, h[i]))
    const p2 = put(x, h[i], -hz, side, 0, 0, byHeight(top, h[i]))
    const p3 = put(x, 0, -hz, side, 0, 0, base)
    if (side === -1) idx.push(p0, p1, p2, p0, p2, p3)
    else idx.push(p0, p2, p1, p0, p3, p2)
  }

  // Cinta luminosa: una banda fina en lo alto de la cara delantera, algo separada para no pelearse con ella.
  const cp = new Float32Array(n * 2 * 3)
  const cy = new Float32Array(n * 2)
  const cx = new Float32Array(n * 2)
  const ci: number[] = []
  for (let i = 0; i < n; i++) {
    const x = xAt(i)
    cp.set([x, h[i], hz + 0.02, x, Math.max(0, h[i] - CREST_BAND), hz + 0.02], i * 6)
    cy[2 * i] = h[i]
    cy[2 * i + 1] = -CREST_BAND
    cx[2 * i] = cx[2 * i + 1] = x
  }
  for (let i = 0; i < n - 1; i++) {
    const t0 = 2 * i
    ci.push(t0 + 1, t0 + 3, t0, t0 + 3, t0 + 2, t0)
  }

  return {
    positions,
    normals,
    colors,
    index: new Uint32Array(idx),
    baseY,
    xs,
    topCount,
    crest: { positions: cp, index: new Uint32Array(ci), baseY: cy, xs: cx },
  }
}

/** Normal de la lámina superior en el punto i: perpendicular a la pendiente. Nunca es cero. */
function slopeNormal(h: number[], i: number, dx: number): [number, number] {
  const a = h[Math.max(0, i - 1)]
  const b = h[Math.min(h.length - 1, i + 1)]
  const run = (Math.min(h.length - 1, i + 1) - Math.max(0, i - 1)) * dx || 1
  const s = (b - a) / run
  const len = Math.hypot(s, 1)
  return [-s / len, 1 / len]
}

/** Cuánto ha crecido la cordillera en x: 1 detrás del frente de la ola, 0 delante, con una subida suave. */
export function revealAt(x: number, front: number, wave: number): number {
  if (x <= front - wave) return 1
  if (x >= front) return 0
  const t = (front - x) / wave
  return t * t * (3 - 2 * t)
}

/**
 * Reescala las alturas para un frente de ola en `front` (unidades de escena) y recalcula las normales de la lámina
 * superior con la pendiente resultante. Devuelve la altura visible en cada punto del perfil (para los destellos).
 */
export function applyReveal(
  b: RidgeBuffers,
  front: number,
  wave: number,
  positions: Float32Array,
  normals: Float32Array,
  crest: Float32Array,
  colors?: Float32Array,
): void {
  for (let v = 0; v < b.baseY.length; v++) {
    const y0 = b.baseY[v]
    const r = revealAt(b.xs[v], front, wave)
    positions[v * 3 + 1] = y0 > 0 ? Math.max(MIN_H, y0 * r) : 0
    // Lo que aún no ha llegado se queda en penumbra: el camino se intuye pero no compite con lo ya crecido.
    if (colors) {
      const k = 0.16 + 0.84 * r
      for (let c = 0; c < 3; c++) colors[v * 3 + c] = b.colors[v * 3 + c] * k
    }
  }
  // Normales de la lámina con la pendiente ya escalada.
  const pairs = b.topCount / 2
  for (let i = 0; i < pairs; i++) {
    const prev = Math.max(0, i - 1)
    const next = Math.min(pairs - 1, i + 1)
    const run = b.xs[next * 2] - b.xs[prev * 2] || 1
    const s = (positions[next * 6 + 1] - positions[prev * 6 + 1]) / run
    const len = Math.hypot(s, 1)
    for (const k of [0, 1]) {
      const o = (i * 2 + k) * 3
      normals[o] = -s / len
      normals[o + 1] = 1 / len
      normals[o + 2] = 0
    }
  }
  // Cinta: el borde superior sigue a la cresta y el inferior queda una banda por debajo.
  for (let v = 0; v < b.crest.baseY.length; v += 2) {
    const top = Math.max(MIN_H, b.crest.baseY[v] * revealAt(b.crest.xs[v], front, wave))
    crest[v * 3 + 1] = top
    crest[(v + 1) * 3 + 1] = Math.max(0, top + b.crest.baseY[v + 1])
  }
}
