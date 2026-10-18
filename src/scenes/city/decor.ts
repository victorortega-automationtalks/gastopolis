import { mulberry32 } from '../../lib/random'
import type { ResolvedQuality } from '../common'
import type { CityLayout } from './layout'

/**
 * Decorado de la Ciudad: todo lo que no son datos (calles con tráfico, farolas, ronda, río, extrarradio, parques,
 * azoteas). Puro y determinista: misma semilla, misma ciudad. Nada de esto se puede seleccionar.
 */

export interface Rect {
  x0: number
  z0: number
  x1: number
  z1: number
}

/** Recorrido cerrado de coches alrededor de un rectángulo, en sentido horario visto desde arriba (+y). */
export interface CarLoop {
  rect: Rect
  /** Posiciones iniciales a lo largo del perímetro (0..perímetro). */
  starts: number[]
  speed: number
  /** Sentido contrario (para el carril exterior de la ronda). */
  reverse: boolean
}

export interface Lamp {
  x: number
  z: number
}

export interface Tree {
  x: number
  z: number
  s: number
}

export interface Lot {
  x: number
  z: number
  w: number
  d: number
  h: number
  /** Índice de tono en la paleta del extrarradio. */
  tone: number
}

export interface RoofItem {
  /** Edificio de `layout.buildings` y torre suya sobre la que va. */
  building: number
  tower: number
  dx: number
  dz: number
  w: number
  d: number
  h: number
  antenna: boolean
}

export interface Boat {
  z: number
  speed: number
  phase: number
  len: number
}

export interface CityDecorData {
  half: number
  ring: { inner: number; outer: number }
  river: Rect
  outskirtsRadius: number
  lamps: Lamp[]
  trees: Tree[]
  parks: Rect[]
  lots: Lot[]
  loops: CarLoop[]
  roof: RoofItem[]
  boats: Boat[]
  /** Marcas viales de la ronda: centro y orientación (true = a lo largo de x). */
  dashes: { x: number; z: number; alongX: boolean }[]
}

const SIDEWALK = 1.5
const RING_WIDTH = 5
const LANE = 0.6
const LAMP_OFFSET = 0.25

export function perimeter(r: Rect): number {
  return 2 * (r.x1 - r.x0 + (r.z1 - r.z0))
}

/** Punto y orientación a distancia `s` del inicio del recorrido (esquina x0,z0), en sentido horario. */
export function pointOnLoop(r: Rect, s: number): { x: number; z: number; angle: number } {
  const w = r.x1 - r.x0
  const d = r.z1 - r.z0
  const p = 2 * (w + d)
  let t = ((s % p) + p) % p
  if (t < w) return { x: r.x0 + t, z: r.z0, angle: 0 }
  t -= w
  if (t < d) return { x: r.x1, z: r.z0 + t, angle: -Math.PI / 2 }
  t -= d
  if (t < w) return { x: r.x1 - t, z: r.z1, angle: Math.PI }
  t -= w
  return { x: r.x0, z: r.z1 - t, angle: Math.PI / 2 }
}

const expand = (r: Rect, by: number): Rect => ({ x0: r.x0 - by, z0: r.z0 - by, x1: r.x1 + by, z1: r.z1 + by })

/** Puntos repartidos a lo largo de un rectángulo, esquinas incluidas. */
function alongRect(r: Rect, spacing: number): Lamp[] {
  const out: Lamp[] = []
  const p = perimeter(r)
  const n = Math.max(4, Math.round(p / spacing))
  for (let i = 0; i < n; i++) {
    const { x, z } = pointOnLoop(r, (i / n) * p)
    out.push({ x, z })
  }
  return out
}

export function buildDecor(layout: CityLayout, { quality, seed }: { quality: ResolvedQuality; seed: number }): CityDecorData {
  const rnd = mulberry32(seed)
  const high = quality === 'high'
  const half = layout.size / 2
  const ringInner = half + SIDEWALK
  const ringOuter = ringInner + RING_WIDTH
  const outskirtsRadius = half + (high ? 75 : 40)
  const river: Rect = { x0: -outskirtsRadius - 20, x1: outskirtsRadius + 20, z0: ringOuter + 3, z1: ringOuter + 21 }

  // Manzanas: distritos si los hay; si no, los propios edificios.
  const blocks: Rect[] = (layout.districts.length ? layout.districts : layout.buildings).map((b) => ({
    x0: b.x - b.w / 2,
    z0: b.z - b.d / 2,
    x1: b.x + b.w / 2,
    z1: b.z + b.d / 2,
  }))

  const lamps: Lamp[] = []
  const loops: CarLoop[] = []
  const carEvery = high ? 11 : 26
  for (const b of blocks) {
    // Las manzanas diminutas no tienen calle propia que se vea.
    if (b.x1 - b.x0 < 1.2 || b.z1 - b.z0 < 1.2) continue
    lamps.push(...alongRect(expand(b, LAMP_OFFSET), high ? 5 : 9))
    const path = expand(b, LANE)
    const p = perimeter(path)
    const n = Math.max(1, Math.round(p / carEvery))
    const phase = rnd() * p
    loops.push({ rect: path, starts: Array.from({ length: n }, (_, i) => phase + (i / n) * p + rnd() * 2), speed: 2.6 + rnd() * 1.6, reverse: false })
  }

  // Ronda: dos carriles en sentidos opuestos, farolas en la acera interior y árboles en la exterior.
  const ringPath = (off: number): Rect => expand({ x0: -half, z0: -half, x1: half, z1: half }, SIDEWALK + off)
  for (const [off, reverse] of [
    [1.3, false],
    [3.7, true],
  ] as const) {
    const path = ringPath(off)
    const p = perimeter(path)
    const n = Math.round(p / (high ? 9 : 22))
    loops.push({ rect: path, starts: Array.from({ length: n }, (_, i) => (i / n) * p + rnd() * 3), speed: 4 + rnd() * 1.5, reverse })
  }
  lamps.push(...alongRect(ringPath(-0.6), high ? 6 : 12))
  const dashes: CityDecorData['dashes'] = []
  const mid = ringPath(RING_WIDTH / 2)
  for (let s = 0; s < perimeter(mid); s += 3) {
    const { x, z, angle } = pointOnLoop(mid, s)
    dashes.push({ x, z, alongX: Math.abs(Math.sin(angle)) < 0.5 })
  }

  const trees: Tree[] = []
  for (const t of alongRect(ringPath(RING_WIDTH + 1.2), high ? 3.4 : 7)) trees.push({ ...t, s: 0.8 + rnd() * 0.5 })

  // Paseo del río: farolas en las dos orillas (se reflejan en el agua).
  for (let x = river.x0; x <= river.x1; x += high ? 6 : 12) {
    lamps.push({ x, z: river.z0 - 0.8 }, { x: x + 3, z: river.z1 + 0.8 })
  }

  // Extrarradio: cuadrícula de solares alrededor de la ronda; algunos son parques, otros plazas vacías.
  const lots: Lot[] = []
  const parks: Rect[] = []
  const cell = 7.5
  const lot = 5.6
  const clear = ringOuter + 2.5
  const count = Math.ceil(outskirtsRadius / cell)
  for (let i = -count; i <= count; i++) {
    for (let j = -count; j <= count; j++) {
      const cx = i * cell
      const cz = j * cell
      const r = Math.max(Math.abs(cx), Math.abs(cz))
      if (r - lot / 2 < clear || r > outskirtsRadius) continue
      if (cz + lot / 2 > river.z0 - 1.5 && cz - lot / 2 < river.z1 + 1.5) continue
      const roll = rnd()
      if (roll < 0.12) {
        parks.push({ x0: cx - lot / 2, z0: cz - lot / 2, x1: cx + lot / 2, z1: cz + lot / 2 })
        const n = 3 + Math.floor(rnd() * 4)
        for (let k = 0; k < n; k++) trees.push({ x: cx + (rnd() - 0.5) * (lot - 1), z: cz + (rnd() - 0.5) * (lot - 1), s: 0.7 + rnd() * 0.7 })
        continue
      }
      if (roll < 0.2) continue
      // Más alto cerca del centro, más bajo hacia las afueras.
      const fall = Math.max(0.25, 1 - (r - clear) / (outskirtsRadius - clear))
      const split = rnd() < 0.4 ? 2 : 1
      const sub = (lot - (split - 1) * 0.6) / split
      for (let a = 0; a < split; a++)
        for (let b = 0; b < split; b++) {
          const w = sub * (0.7 + rnd() * 0.3)
          const d = sub * (0.7 + rnd() * 0.3)
          lots.push({
            x: cx - lot / 2 + sub / 2 + a * (sub + 0.6),
            z: cz - lot / 2 + sub / 2 + b * (sub + 0.6),
            w,
            d,
            h: 1 + rnd() ** 2 * 10 * fall,
            tone: Math.floor(rnd() * 5),
          })
        }
    }
  }

  // Azoteas: máquinas en los edificios con techo amplio y antenas en los tres más altos.
  const roof: RoofItem[] = []
  const tallest = layout.buildings
    .map((b, i) => [b.h, i] as const)
    .sort((a, b) => b[0] - a[0])
    .slice(0, 3)
    .filter(([h]) => h > 8)
    .map(([, i]) => i)
  layout.buildings.forEach((b, i) => {
    b.towers.forEach((t, ti) => {
      if (Math.min(t.w, t.d) < 2.2 || t.h < 1.5) return
      const n = 1 + Math.floor(rnd() * (high ? 3 : 1.5))
      for (let k = 0; k < n; k++) {
        const w = Math.min(0.3 + rnd() * 0.4, t.w - 1)
        const d = Math.min(0.3 + rnd() * 0.4, t.d - 1)
        roof.push({
          building: i,
          tower: ti,
          dx: t.dx + (rnd() - 0.5) * (t.w - w - 0.8),
          dz: t.dz + (rnd() - 0.5) * (t.d - d - 0.8),
          w,
          d,
          h: 0.25 + rnd() * 0.55,
          antenna: false,
        })
      }
    })
  })
  for (const i of tallest) {
    const b = layout.buildings[i]
    const ti = b.towers.reduce((best, t, k) => (t.h > b.towers[best].h ? k : best), 0)
    roof.push({ building: i, tower: ti, dx: b.towers[ti].dx, dz: b.towers[ti].dz, w: 0.12, d: 0.12, h: 2.5 + rnd() * 2, antenna: true })
  }

  const riverMid = (river.z0 + river.z1) / 2
  const boats: Boat[] = Array.from({ length: high ? 4 : 2 }, (_, k) => ({
    z: riverMid + (k % 2 === 0 ? -4 : 4),
    speed: (1.2 + rnd() * 1.5) * (k % 2 === 0 ? 1 : -1),
    phase: rnd() * (river.x1 - river.x0),
    len: 2.2 + rnd() * 1.6,
  }))

  return { half, ring: { inner: ringInner, outer: ringOuter }, river, outskirtsRadius, lamps, trees, parks, lots, loops, roof, boats, dashes }
}
