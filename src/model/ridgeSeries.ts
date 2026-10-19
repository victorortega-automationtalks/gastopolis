import { fmtDate, fmtMonth } from './format'
import { shiftDays } from './period'
import { rootIndex, type CategorySeries } from './series'
import { buildFrames, daysBetween, frameIndexOf, type Frame, type TimeStep } from './timeline'
import type { Category, ISODate, Kind, Movement } from './types'

/** Agrupación de la Cordillera: un punto de la cresta por día, semana o mes. */
export type Bucket = TimeStep
export type BucketChoice = Bucket | 'auto'

export const BUCKET_LABEL: Record<BucketChoice, string> = { auto: 'Auto', day: 'Días', week: 'Semanas', month: 'Meses' }

export interface BucketedSeries {
  bucket: Bucket
  /** Tramos consecutivos, sin huecos, del primer al último movimiento. */
  frames: Frame[]
  rows: CategorySeries[]
  max: number
}

/**
 * Con pocos datos, meses son dos puntos y la cordillera es una cuña: se baja a semanas o días para que haya relieve.
 * Hasta ~2 meses, días; hasta ~10, semanas; más, meses.
 */
export function autoBucket(first: ISODate, last: ISODate): Bucket {
  const span = daysBetween(first, last)
  return span <= 62 ? 'day' : span <= 300 ? 'week' : 'month'
}

/** Tramo anterior a `f` (para anteponer uno vacío cuando solo hay uno). */
function previousFrame(f: Frame, bucket: Bucket): Frame {
  if (bucket === 'day') return { from: shiftDays(f.from, 1), to: shiftDays(f.from, 1) }
  if (bucket === 'week') return { from: shiftDays(f.from, 7), to: shiftDays(f.from, 1) }
  const to = shiftDays(f.from, 1)
  return { from: `${to.slice(0, 7)}-01`, to }
}

/** Importe por categoría en cada tramo. Con un solo tramo se antepone otro a cero: así la cresta sube. */
export function seriesByBucket(movements: Movement[], categories: Category[], kind: Kind, level: 'root' | 'leaf', choice: BucketChoice): BucketedSeries {
  const ofKind = movements.filter((m) => m.kind === kind)
  if (!ofKind.length) return { bucket: choice === 'auto' ? 'month' : choice, frames: [], rows: [], max: 0 }
  let first = ofKind[0].date
  let last = first
  for (const m of ofKind) {
    if (m.date < first) first = m.date
    if (m.date > last) last = m.date
  }
  const bucket = choice === 'auto' ? autoBucket(first, last) : choice
  let frames = buildFrames(first, last, bucket)
  if (frames.length === 1) frames = [previousFrame(frames[0], bucket), frames[0]]
  const root = rootIndex(categories)
  const byId = new Map(categories.map((c) => [c.id, c]))
  const rows = new Map<string, CategorySeries>()
  for (const m of ofKind) {
    const id = level === 'root' ? root(m.categoryId) : m.categoryId
    let row = rows.get(id)
    if (!row) {
      const c = byId.get(id)
      row = {
        categoryId: id,
        name: c?.name ?? 'Sin categoría',
        color: c?.color ?? '#8b8fa8',
        icon: c?.icon ?? 'CircleDashed',
        values: frames.map(() => 0),
        total: 0,
      }
      rows.set(id, row)
    }
    const v = Math.abs(m.amount)
    row.values[frameIndexOf(frames, m.date)] += v
    row.total += v
  }
  const sorted = [...rows.values()].sort((a, b) => b.total - a.total)
  return { bucket, frames, rows: sorted, max: Math.max(0, ...sorted.flatMap((r) => r.values)) }
}

/** Rótulo corto de un tramo para el eje: «12 oct», «9 mar», «oct 2025». */
export function bucketLabel(f: Frame, bucket: Bucket, long = false): string {
  if (bucket === 'month') return fmtMonth(f.from.slice(0, 7), long)
  if (bucket === 'week') return long ? `semana del ${fmtDate(f.from)}` : fmtDate(f.from, false)
  return long ? fmtDate(f.from) : fmtDate(f.from, false)
}

/**
 * Posición continua de una fecha sobre los tramos (0 = inicio del primero, n − 1 = el último completo): para que la
 * reproducción levante la cordillera hasta el día exacto aunque los tramos sean meses.
 */
export function bucketPosition(frames: Frame[], date: ISODate): number {
  if (!frames.length) return 0
  if (date < frames[0].from) return 0
  if (date > frames[frames.length - 1].to) return frames.length - 1
  const i = frameIndexOf(frames, date)
  const f = frames[i]
  const len = daysBetween(f.from, f.to) + 1
  const into = (daysBetween(f.from, date) + 1) / len
  return Math.max(0, Math.min(frames.length - 1, i - 1 + into))
}
