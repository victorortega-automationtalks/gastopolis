/**
 * Horizonte: cada escenario es una cinta que se aleja hacia el horizonte (z negativo = futuro) a la altura de lo
 * que tendrías cada mes. Los objetivos son pórticos en el mes en que se alcanzan (según su propio ritmo, el mismo
 * dato que la lista de objetivos) y a la altura de la cinta principal en ese mes: la cinta los atraviesa.
 * Puro, para poder probarlo; el lienzo solo pinta.
 */

export interface HorizonSeriesIn {
  id: string
  label: string
  color: string
  /** Patrimonio al cierre de cada mes; índice 0 = hoy. */
  values: number[]
}

export interface HorizonGoalIn {
  id: string
  name: string
  color: string
  icon: string
  target: number
  /** Meses desde hoy hasta alcanzarlo con los cambios; null si no llega nunca. */
  month: number | null
  /** Cuántos meses antes que sin cambios (si se sabe). */
  sooner: number | null
}

export interface HorizonSeries extends HorizonSeriesIn {
  x: number
  points: [number, number, number][]
}

export interface HorizonGate extends HorizonGoalIn {
  /** Altura del dintel: algo por encima de la cinta principal en ese mes. */
  y: number
  z: number
  /** Si se alcanza dentro del horizonte (si no, el pórtico queda al fondo, apagado). */
  inside: boolean
}

export interface HorizonLayout {
  series: HorizonSeries[]
  gates: HorizonGate[]
  months: number
  length: number
  width: number
  maxH: number
  /** Escala: unidades de escena por euro. */
  scaleY: number
  /** Altura del cero: si alguna cinta baja de cero, el suelo queda por debajo y se ve hasta dónde baja. */
  zeroY: number
  /** z de cada cambio de año (mes 12, 24…). */
  years: { month: number; z: number }[]
}

export interface HorizonOptions {
  length?: number
  maxH?: number
  laneGap?: number
}

export function layoutHorizon(
  seriesIn: HorizonSeriesIn[],
  goalsIn: HorizonGoalIn[],
  { length = 120, maxH = 34, laneGap = 4.5 }: HorizonOptions = {},
): HorizonLayout {
  const months = Math.max(1, ...seriesIn.map((s) => s.values.length - 1))
  const dz = length / months
  const all = seriesIn.flatMap((s) => s.values)
  const top = Math.max(0, ...all)
  const bottom = Math.min(0, ...all)
  // La escala abarca de lo más bajo a lo más alto: con números rojos, el cero sube y la cinta se ve bajar.
  const scaleY = maxH / Math.max(1, top - bottom)
  const zeroY = bottom < 0 ? -bottom * scaleY : 0
  const n = seriesIn.length
  const series = seriesIn.map((s, i) => {
    const x = (i - (n - 1) / 2) * laneGap
    const points = s.values.map((v, m): [number, number, number] => [x, zeroY + v * scaleY, -m * dz])
    return { ...s, x, points }
  })
  const main = series[0]?.points ?? []
  const gates = goalsIn.map((g) => {
    const inside = g.month != null && g.month <= months
    const m = inside ? g.month! : months
    const ribbonY = main[Math.min(m, main.length - 1)]?.[1] ?? 0
    return { ...g, y: Math.max(2, ribbonY + 2.5), z: -m * dz, inside }
  })
  const years = Array.from({ length: Math.floor(months / 12) }, (_, k) => ({ month: (k + 1) * 12, z: -(k + 1) * 12 * dz }))
  return { series, gates, months, length, width: Math.max(1, n) * laneGap, maxH, scaleY, zeroY, years }
}
