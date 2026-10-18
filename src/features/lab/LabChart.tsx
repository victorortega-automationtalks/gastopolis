import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmtMonth } from '../../model/format'
import { addMonths } from '../../model/series'

/** Proyección en 2D: una línea por escenario y una referencia por objetivo. */
export function LabChart({
  startMonth,
  series,
  goals,
  money,
}: {
  startMonth: string
  series: { id: string; label: string; color: string; values: number[] }[]
  goals: { name: string; color: string; target: number }[]
  money: (v: number) => string
}) {
  const n = Math.max(0, ...series.map((s) => s.values.length))
  const data = Array.from({ length: n }, (_, m) => {
    const row: Record<string, number | string> = { m, label: fmtMonth(addMonths(startMonth, m)) }
    for (const s of series) row[s.id] = Math.round(s.values[m] ?? 0)
    return row
  })
  const peak = Math.max(1, ...series.flatMap((s) => s.values))
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid stroke="var(--line)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: 'var(--ink-faint)', fontSize: 11 }}
          interval={Math.max(0, Math.round(n / 8) - 1)}
          tickLine={false}
          axisLine={false}
        />
        <YAxis tickFormatter={money} tick={{ fill: 'var(--ink-faint)', fontSize: 11 }} width={64} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{ background: 'var(--surface-solid)', border: '1px solid var(--line-strong)', borderRadius: 12, fontSize: 12 }}
          formatter={(v, name) => [money(Number(v)), series.find((s) => s.id === name)?.label ?? String(name)]}
        />
        {goals
          .filter((g) => g.target <= peak * 1.6)
          .map((g) => (
            <ReferenceLine
              key={g.name}
              y={g.target}
              stroke={g.color}
              strokeDasharray="4 4"
              label={{ value: g.name, fill: g.color, fontSize: 11, position: 'insideTopLeft' }}
            />
          ))}
        {series.map((s, i) => (
          <Line
            key={s.id}
            dataKey={s.id}
            stroke={s.color}
            strokeWidth={i === 0 ? 3 : 2}
            dot={false}
            isAnimationActive={false}
            strokeDasharray={s.id === 'base' ? '6 4' : undefined}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
