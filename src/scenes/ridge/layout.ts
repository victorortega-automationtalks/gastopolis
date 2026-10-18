import { addMonths, type CategorySeries } from '../../model/series'

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
  /** Alturas en unidades de escena, una por mes. */
  heights: number[]
  /** Perfil suavizado (steps puntos por mes). */
  profile: number[]
}

export interface RidgeLayout {
  months: string[]
  rows: RidgeRow[]
  spacingX: number
  spacingZ: number
  steps: number
  width: number
  depth: number
  maxH: number
}

export interface RidgeOptions {
  maxRows?: number
  spacingX?: number
  spacingZ?: number
  maxH?: number
  steps?: number
}

const MIN_WIDTH = 30

/** Coloca una cresta por categoría: x = mes, altura = importe, z = categoría. Las que sobran se pliegan en «Otras». */
export function layoutRidge(
  data: { months: string[]; rows: CategorySeries[]; max: number },
  { maxRows = 10, spacingX = 4, spacingZ = 6, maxH = 24, steps = 8 }: RidgeOptions = {},
): RidgeLayout {
  // Con un solo mes no hay cresta que dibujar (ancho cero): se antepone el mes anterior a cero y la cresta sube.
  if (data.months.length === 1) {
    data = { ...data, months: [addMonths(data.months[0], -1), data.months[0]], rows: data.rows.map((r) => ({ ...r, values: [0, ...r.values] })) }
  }
  let rows = data.rows
  if (rows.length > maxRows) {
    const rest = rows.slice(maxRows - 1)
    const values = data.months.map((_, i) => rest.reduce((a, r) => a + r.values[i], 0))
    rows = [
      ...rows.slice(0, maxRows - 1),
      { categoryId: 'otras', name: `Otras (${rest.length})`, color: '#8b8fa8', icon: 'CircleDashed', values, total: values.reduce((a, b) => a + b, 0) },
    ]
  }
  const max = Math.max(1e-9, ...rows.flatMap((r) => r.values))
  const n = rows.length
  // Con pocos meses, los meses se separan más: una cordillera de 2 meses no puede ser una aguja.
  if (data.months.length > 1) spacingX = Math.max(spacingX, MIN_WIDTH / (data.months.length - 1))
  const width = Math.max(1, data.months.length - 1) * spacingX
  return {
    months: data.months,
    spacingX,
    spacingZ,
    steps,
    width,
    depth: Math.max(1, n - 1) * spacingZ,
    maxH,
    rows: rows.map((r, i) => {
      const heights = r.values.map((v) => (v / max) * maxH)
      // La cámara mira desde +z: la fila 0 (la de más importe) queda al fondo, en z negativo.
      return { ...r, z: (i - (n - 1) / 2) * spacingZ, heights, profile: smoothProfile(heights, steps) }
    }),
  }
}
