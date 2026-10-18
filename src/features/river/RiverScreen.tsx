import { useMemo, useState } from 'react'
import { useCategories, useMovements, useSettings } from '../../data/hooks'
import { applyFilters } from '../../model/aggregate'
import { moneyFlow, type FlowNode } from '../../model/flow'
import { fmtMoney, fmtPercent } from '../../model/format'
import { today } from '../../model/period'
import { KINDS } from '../../model/types'
import { useSceneColors } from '../../scenes/common'
import { useUI } from '../../store/ui'
import { Button, Card, Segmented } from '../../ui/components/primitives'
import { useOpenInCity } from '../city/openInCity'
import { RiverChart } from './RiverChart'

type Detail = 'destinos' | 'categorias'

/** El Río: de dónde viene tu dinero y a dónde va, en el periodo de los filtros. */
export function RiverScreen() {
  const { movements } = useMovements()
  const categories = useCategories()
  const settings = useSettings()
  const filters = useUI((s) => s.filters)
  const resetFilters = useUI((s) => s.resetFilters)
  const colors = useSceneColors()
  const openInCity = useOpenInCity()
  // En el móvil no cabe una tercera columna con holgura: empieza en «Destinos».
  const [detail, setDetail] = useState<Detail>(() => (matchMedia('(min-width: 640px)').matches ? 'categorias' : 'destinos'))

  const scoped = useMemo(
    () => applyFilters(movements, { ...filters, kinds: KINDS }, categories, today(), settings.fiscalYearStart),
    [movements, filters, categories, settings.fiscalYearStart],
  )
  const flow = useMemo(
    () =>
      moneyFlow(scoped, categories, {
        splitExpenses: detail === 'categorias',
        expenseColor: colors.expense,
        leftoverColor: colors.income,
        deficitColor: colors.transfer,
      }),
    [scoped, categories, detail, colors],
  )
  const money = (v: number) => fmtMoney(v, { currency: settings.currency, locale: settings.locale })
  const pct = (v: number) => fmtPercent(v / Math.max(flow.total, 1e-9), settings.locale)
  const get = (id: string) => flow.nodes.find((n) => n.id === id)?.value ?? 0
  const income = flow.nodes.filter((n) => n.column === 0 && n.kind === 'income').reduce((a, n) => a + n.value, 0)
  const saved = flow.nodes.filter((n) => n.column === 1 && n.kind === 'transfer').reduce((a, n) => a + n.value, 0)
  const spent = get('1:gastos')
  const left = get('1:sobra')
  const deficit = get('0:deficit')
  const pick = (n: FlowNode) => n.categoryId && n.kind && openInCity(n.categoryId, n.kind)

  if (!flow.nodes.length) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-3 py-16 text-center">
        <h2 className="font-display text-2xl font-semibold">Aquí no corre el agua todavía</h2>
        <p className="text-ink-muted">Con ingresos y gastos en el periodo elegido verás de dónde viene tu dinero y a dónde va.</p>
        {movements.length > 0 && <Button onClick={resetFilters}>Quitar filtros</Button>}
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Entra" value={money(income)} tone="text-income" />
        <Stat label="Se gasta" value={money(spent)} sub={pct(spent)} tone="text-expense" />
        <Stat label="Se aparta" value={money(saved)} sub={pct(saved)} tone="text-transfer" />
        {deficit > 0 ? (
          <Stat label="Gastado de más" value={money(deficit)} sub="más de lo que entró" tone="text-warn" />
        ) : (
          <Stat label="Sin gastar" value={money(left)} sub={pct(left)} tone="text-ink" />
        )}
      </div>

      <Card className="relative overflow-hidden p-4 sm:p-6">
        <div className="absolute -top-24 left-1/3 h-56 w-1/2 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-semibold">De dónde viene y a dónde va tu dinero</h2>
            <p className="text-sm text-ink-muted">Pasa por una cinta para ver cuánto lleva; clic en un nodo para abrirlo en la Ciudad.</p>
          </div>
          <Segmented<Detail>
            value={detail}
            onChange={setDetail}
            options={[
              { value: 'destinos', label: 'Destinos' },
              { value: 'categorias', label: 'Con categorías' },
            ]}
          />
        </div>
        <RiverChart flow={flow} money={money} locale={settings.locale} height={Math.max(340, Math.min(540, flow.nodes.length * 44))} onPick={pick} />
      </Card>
    </div>
  )
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs font-medium tracking-wider text-ink-faint uppercase">{label}</div>
      <div className={`num mt-1 truncate text-xl font-semibold ${tone}`}>{value}</div>
      {sub && <div className="text-xs text-ink-muted">{sub}</div>}
    </Card>
  )
}
