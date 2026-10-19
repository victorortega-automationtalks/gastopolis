import { fmtMonth } from '../../model/format'
import { addMonths } from '../../model/series'
import { LineChart } from '../../ui/charts/Charts'

/** Proyección en 2D: una línea por escenario y una marca vertical en el mes en que se alcanza cada objetivo. */
export function LabChart({
  startMonth,
  series,
  goals,
  money,
}: {
  startMonth: string
  series: { id: string; label: string; color: string; values: number[] }[]
  goals: { name: string; color: string; month: number | null }[]
  money: (v: number) => string
}) {
  const n = Math.max(0, ...series.map((s) => s.values.length))
  const labels = Array.from({ length: n }, (_, m) => fmtMonth(addMonths(startMonth, m)))
  return (
    <LineChart
      labels={labels}
      series={series.map((s) => ({ ...s, dashed: s.id === 'base' }))}
      markers={goals.filter((g) => g.month != null).map((g) => ({ index: g.month!, label: g.name, color: g.color }))}
      height={380}
      format={money}
      ariaLabel="Proyección de lo que tendrías mes a mes"
    />
  )
}
