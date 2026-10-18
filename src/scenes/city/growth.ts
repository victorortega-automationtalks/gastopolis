import { movementsOf } from '../../model/hierarchy'
import type { ISODate } from '../../model/types'
import type { CityLayout } from './layout'

export interface Growth {
  /** 0…1 por edificio: cuánto de su altura final tiene en la fecha. */
  ratio: Float32Array
  /** Importe acumulado por edificio en la fecha. */
  value: Float64Array
  /** Suma de todo lo visible en la fecha. */
  total: number
}

/**
 * Para reproducir la Ciudad en el tiempo: el plano no cambia (cada edificio en su solar) y cada uno crece según lo
 * gastado hasta la fecha. Con altura por nº de movimientos, crece por movimientos; si no, por importe.
 * Prepara una vez sumas acumuladas por edificio; cada fotograma es una búsqueda binaria por edificio.
 */
export function growthIndex(layout: CityLayout, by: 'value' | 'count'): (to: ISODate) => Growth {
  const series = layout.buildings.map((b) => {
    const ms = movementsOf(b.node).sort((x, y) => x.date.localeCompare(y.date))
    const dates = ms.map((m) => m.date)
    const cum = new Float64Array(ms.length)
    let acc = 0
    ms.forEach((m, i) => (cum[i] = acc += Math.abs(m.amount)))
    return { dates, cum, final: acc, count: ms.length }
  })
  return (to) => {
    const ratio = new Float32Array(series.length)
    const value = new Float64Array(series.length)
    let total = 0
    series.forEach((s, i) => {
      // Cuántos movimientos caen hasta `to` (incluido).
      let lo = 0
      let hi = s.dates.length
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (s.dates[mid] <= to) lo = mid + 1
        else hi = mid
      }
      value[i] = lo ? s.cum[lo - 1] : 0
      total += value[i]
      ratio[i] = by === 'count' ? (s.count ? lo / s.count : 0) : s.final > 0 ? value[i] / s.final : 0
    })
    return { ratio, value, total }
  }
}
