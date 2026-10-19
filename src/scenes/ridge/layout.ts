import type { Bucket, BucketedSeries } from '../../model/ridgeSeries'
import type { CategorySeries } from '../../model/series'
import type { Frame } from '../../model/timeline'

/**
 * Perfil suave que pasa por todos los puntos sin sobrepasarlos (interpolación cúbica monótona de Fritsch–Carlson):
 * entre dos meses iguales no aparece una joroba y nunca baja de cero.
 */
export function smoothProfile(values: number[], steps = 8): number[] {
  const n = values.length
  if (n === 0) return []
  if (n === 1) return [values[0]]
  const d = values.slice(1).map((v, i) => v - values[i])
  const m = values.map((_, i) => (i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2))
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0
      m[i + 1] = 0
      continue
    }
    const a = m[i] / d[i]
    const b = m[i + 1] / d[i]
    const s = a * a + b * b
    if (s > 9) {
      const t = 3 / Math.sqrt(s)
      m[i] = t * a * d[i]
      m[i + 1] = t * b * d[i]
    }
  }
  const out: number[] = []
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < steps; k++) {
      const t = k / steps
      const h00 = 2 * t ** 3 - 3 * t ** 2 + 1
      const h10 = t ** 3 - 2 * t ** 2 + t
      const h01 = -2 * t ** 3 + 3 * t ** 2
      const h11 = t ** 3 - t ** 2
      out.push(Math.max(0, h00 * values[i] + h10 * m[i] + h01 * values[i + 1] + h11 * m[i + 1]))
    }
  }
  out.push(values[n - 1])
  return out
}

export interface RidgeRow extends CategorySeries {
  /** Posición en profundidad: la fila de más importe va al fondo para no tapar a las demás. */
  z: number
  /** Alturas en unidades de escena, una por tramo. */
  heights: number[]
  /** Perfil suavizado (steps puntos por tramo). */
  profile: number[]
}

export interface RidgeLayout {
  bucket: Bucket
  frames: Frame[]
  rows: RidgeRow[]
  spacingX: number
  spacingZ: number
  /** Grosor de cada cresta (en z). */
  thickness: number
  steps: number
  width: number
  depth: number
  maxH: number
}

export interface RidgeOptions {
  maxRows?: number
  /** Ancho total al que se estira la cordillera, tenga los tramos que tenga. */
  targetWidth?: number
  spacingZ?: number
  maxH?: number
}

/** Puntos de perfil por tramo: con pocos tramos (meses) la curva necesita más para ser suave. */
const STEPS: Record<Bucket, number> = { month: 10, week: 6, day: 4 }

/**
 * Escala de alturas algo comprimida en días y semanas: el día del alquiler no debe aplastar al resto. Los meses,
 * lineales. Los importes exactos los dan los rótulos y el panel.
 */
const GAMMA: Record<Bucket, number> = { month: 1, week: 0.8, day: 0.6 }

/**
 * Coloca una cresta por categoría: x = tiempo, altura = importe, z = categoría. Las que sobran se pliegan en «Otras».
 * El ancho es siempre parecido: muchos días quedan juntos y pocos meses, separados.
 */
export function layoutRidge(data: BucketedSeries, { maxRows = 9, targetWidth = 72, spacingZ = 6, maxH = 22 }: RidgeOptions = {}): RidgeLayout {
  let rows = data.rows
  const n = data.frames.length
  if (rows.length > maxRows) {
    const rest = rows.slice(maxRows - 1)
    const values = data.frames.map((_, i) => rest.reduce((a, r) => a + r.values[i], 0))
    rows = [
      ...rows.slice(0, maxRows - 1),
      { categoryId: 'otras', name: `Otras (${rest.length})`, color: '#8b8fa8', icon: 'CircleDashed', values, total: values.reduce((a, b) => a + b, 0) },
    ]
  }
  const max = Math.max(1e-9, ...rows.flatMap((r) => r.values))
  const spacingX = n > 1 ? Math.min(6, Math.max(0.9, targetWidth / (n - 1))) : targetWidth
  const steps = STEPS[data.bucket]
  const k = rows.length
  return {
    bucket: data.bucket,
    frames: data.frames,
    spacingX,
    spacingZ,
    thickness: spacingZ * 0.5,
    steps,
    width: Math.max(1, n - 1) * spacingX,
    depth: Math.max(1, k - 1) * spacingZ,
    maxH,
    rows: rows.map((r, i) => {
      const heights = r.values.map((v) => Math.pow(v / max, GAMMA[data.bucket]) * maxH)
      // La cámara mira desde +z: la fila 0 (la de más importe) queda al fondo, en z negativo.
      return { ...r, z: (i - (k - 1) / 2) * spacingZ, heights, profile: smoothProfile(heights, steps) }
    }),
  }
}

/** Tramos con rótulo en el eje: unos 9 repartidos, y siempre el último. */
export function axisTicks(layout: Pick<RidgeLayout, 'frames'>): number[] {
  const n = layout.frames.length
  const every = Math.max(1, Math.ceil(n / 9))
  return layout.frames.map((_, i) => i).filter((i) => i % every === 0 || i === n - 1)
}
