import { describe, expect, it } from 'vitest'
import { buildSample } from '../data/sample'
import { layoutRidge, smoothProfile } from '../scenes/ridge/layout'
import { balanceSnapshot } from './balance'
import { budgetStatus, dataAsOf, monthEndOf, monthProjection, noSpendStreak, previousRange } from './insights'
import { detectRecurring, upcomingCharges } from './recurring'
import { addMonths, cumulativeNet, monthlyByCategory, monthlyTotals, monthRange, monthsOf } from './series'
import type { Category, Kind, Movement } from './types'

let seq = 0
const mov = (date: string, amount: number, categoryId: string, concept = 'x', kind: Kind = amount < 0 ? 'expense' : 'income'): Movement => ({
  id: `m${seq++}`,
  date,
  amount,
  kind,
  concept,
  conceptKey: concept.toLowerCase(),
  categoryId,
  tags: [],
  source: 'manual',
  createdAt: 0,
})
const cat = (id: string, kind: Kind, parentId: string | null = null, budgetMonthly?: number): Category => ({
  id,
  name: id,
  kind,
  parentId,
  color: '#3987e5',
  icon: 'X',
  order: 0,
  budgetMonthly,
})

describe('series', () => {
  it('cuenta meses sin huecos', () => {
    expect(addMonths('2025-11', 3)).toBe('2026-02')
    expect(addMonths('2025-01', -1)).toBe('2024-12')
    expect(monthRange('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })

  it('agrupa por categoría raíz y rellena meses vacíos con cero', () => {
    const cats = [cat('ocio', 'expense'), cat('cine', 'expense', 'ocio'), cat('casa', 'expense')]
    const ms = [mov('2025-01-05', -10, 'cine'), mov('2025-03-02', -30, 'ocio'), mov('2025-01-09', -100, 'casa')]
    const r = monthlyByCategory(ms, cats, 'expense')
    expect(r.months).toEqual(['2025-01', '2025-02', '2025-03'])
    expect(r.rows.map((x) => [x.categoryId, x.values])).toEqual([
      ['casa', [100, 0, 0]],
      ['ocio', [10, 0, 30]],
    ])
    expect(r.max).toBe(100)
  })

  it('totales por mes y saldo acumulado', () => {
    const ms = [mov('2025-01-01', 1000, 'n'), mov('2025-01-05', -400, 'c'), mov('2025-03-01', -100, 'c'), mov('2025-02-01', -50, 'a', 'ahorro', 'transfer')]
    const t = monthlyTotals(ms, monthsOf(ms))
    expect(t.map((r) => r.net)).toEqual([600, 0, -100])
    expect(t[1].transfer).toBe(-50)
    expect(cumulativeNet(t).map((r) => r.value)).toEqual([600, 600, 500])
  })
})

describe('recurrentes', () => {
  const now = new Date(2026, 9, 18)
  const sample = buildSample(now)
  const found = detectRecurring(sample.movements, '2026-10-18')
  const byLabel = (l: string) => found.find((r) => r.label === l)

  it('encuentra suscripciones y recibos con su cadencia', () => {
    expect(byLabel('Netflix')?.cadence).toBe('monthly')
    expect(byLabel('Alquiler piso')?.cadence).toBe('monthly')
    expect(byLabel('Comisión mantenimiento cuenta')?.cadence).toBe('quarterly')
  })

  it('reconoce cargos anuales: tres pagos, o dos idénticos', () => {
    const seguro = ['2023-03-09', '2024-03-10', '2025-03-12'].map((d, i) => mov(d, -(400 + i * 15), 'seg', 'Seguro'))
    const [r] = detectRecurring(seguro, '2025-06-01')
    expect(r).toMatchObject({ cadence: 'yearly', nextDate: '2026-03-12', active: true })
    const dominio = detectRecurring([mov('2024-05-02', -12, 'web', 'Dominio'), mov('2025-05-02', -12, 'web', 'Dominio')], '2025-06-01')
    expect(dominio[0]?.cadence).toBe('yearly')
  })

  it('un viaje cada verano con importes distintos no es un recibo anual', () => {
    const viaje = detectRecurring([mov('2024-08-09', -334.56, 'v', 'Hotel Lisboa'), mov('2025-08-09', -342.69, 'v', 'Hotel Lisboa')], '2025-09-01')
    expect(viaje).toHaveLength(0)
  })

  it('detecta la subida de Spotify', () => {
    const s = byLabel('Spotify')!
    expect(s.priceChanges).toHaveLength(1)
    expect(s.priceChanges[0]).toMatchObject({ from: 10.99, to: 11.99 })
    expect(s.yearly).toBeCloseTo(11.99 * 12)
  })

  it('no confunde la compra del súper con una suscripción', () => {
    expect(byLabel('Mercadona')).toBeUndefined()
    expect(byLabel('Repsol')).toBeUndefined()
  })

  it('marca como inactivo lo que dejó de cobrarse y calcula los próximos cargos', () => {
    const ms = ['2025-01-03', '2025-02-03', '2025-03-03', '2025-04-03'].map((d) => mov(d, -7.99, 'subs', 'Revista'))
    const [r] = detectRecurring(ms, '2025-09-01')
    expect(r.active).toBe(false)
    const [live] = detectRecurring(ms, '2025-04-20')
    expect(live.nextDate).toBe('2025-05-03')
    expect(upcomingCharges([live], '2025-04-20', 14)).toHaveLength(1)
    expect(upcomingCharges([live], '2025-04-10', 14)).toHaveLength(0)
  })
})

describe('indicadores', () => {
  it('usa hoy como referencia salvo que los datos se queden atrás', () => {
    const ms = [mov('2025-07-03', -5, 'c')]
    expect(dataAsOf(ms, '2025-07-20')).toEqual({ asOf: '2025-07-20', stale: false })
    expect(dataAsOf(ms, '2025-08-10')).toEqual({ asOf: '2025-08-10', stale: false })
    expect(dataAsOf(ms, '2026-10-18')).toEqual({ asOf: '2025-07-03', stale: true })
    expect(dataAsOf([], '2026-10-18')).toEqual({ asOf: '2026-10-18', stale: false })
    expect(monthEndOf('2024-02')).toBe('2024-02-29')
  })

  it('periodo anterior de la misma duración', () => {
    expect(previousRange({ from: '2025-03-01', to: '2025-03-31' })).toEqual({ from: '2025-01-29', to: '2025-02-28' })
  })

  it('proyección de cierre de mes con el ritmo de los 90 días anteriores', () => {
    const ms = [mov('2025-04-10', -900, 'c'), mov('2025-06-05', -50, 'c'), mov('2025-01-10', -5000, 'c')]
    const p = monthProjection(ms, '2025-06-10')
    expect(p.spent).toBe(50)
    expect(p.dailyAvg).toBeCloseTo(10)
    expect(p.daysLeft).toBe(20)
    expect(p.projected).toBeCloseTo(250)
  })

  it('racha de días sin gastar', () => {
    const ms = [mov('2025-06-01', -5, 'c'), mov('2025-06-04', -5, 'c'), mov('2025-06-08', 100, 'n')]
    expect(noSpendStreak(ms, '2025-06-09')).toBe(5)
    expect(noSpendStreak(ms, '2025-06-04')).toBe(0)
  })

  it('presupuesto del mes con subcategorías y ritmo', () => {
    const cats = [cat('ocio', 'expense', null, 100), cat('cine', 'expense', 'ocio')]
    const ms = [mov('2025-06-02', -30, 'cine'), mov('2025-06-12', -45, 'ocio'), mov('2025-05-30', -99, 'ocio')]
    const [b] = budgetStatus(ms, cats, '2025-06-15')
    expect(b.spent).toBe(75)
    expect(b.ratio).toBeCloseTo(0.75)
    expect(b.pace).toBeCloseTo(0.5)
  })
})

describe('cordillera', () => {
  it('el perfil pasa por los puntos, no baja de cero ni hace jorobas entre iguales', () => {
    const p = smoothProfile([0, 10, 10, 0, 5], 4)
    expect(p).toHaveLength(17)
    expect([p[0], p[4], p[8], p[12], p[16]]).toEqual([0, 10, 10, 0, 5])
    expect(Math.min(...p)).toBeGreaterThanOrEqual(0)
    for (let k = 4; k <= 8; k++) expect(p[k]).toBeCloseTo(10)
  })

  it('pone la categoría más grande al fondo y pliega el resto en «Otras»', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ categoryId: `c${i}`, name: `c${i}`, color: '#fff', icon: 'X', values: [12 - i, 1], total: 13 - i }))
    const l = layoutRidge({ months: ['2025-01', '2025-02'], rows, max: 12 }, { maxRows: 5 })
    expect(l.rows).toHaveLength(5)
    expect(l.rows[4].name).toBe('Otras (8)')
    expect(l.rows[4].values[0]).toBe(8 + 7 + 6 + 5 + 4 + 3 + 2 + 1)
    expect(l.rows[0].z).toBeLessThan(l.rows[1].z)
    expect(Math.max(...l.rows.flatMap((r) => r.heights))).toBeCloseTo(24)
  })

  it('con un solo mes, antepone el anterior a cero para que haya cresta', () => {
    const one = [{ categoryId: 'a', name: 'A', color: '#000', icon: 'Tag', values: [12], total: 12 }]
    const l = layoutRidge({ months: ['2026-01'], rows: one, max: 12 })
    expect(l.months).toEqual(['2025-12', '2026-01'])
    expect(l.width).toBeGreaterThan(0)
    expect(l.rows[0].values).toEqual([0, 12])
    expect(l.rows[0].profile.every(Number.isFinite)).toBe(true)
  })
})

describe('balanza', () => {
  const cats = [cat('nomina', 'income'), cat('casa', 'expense'), cat('ocio', 'expense'), cat('ahorro', 'transfer')]
  const ms = [
    mov('2025-01-28', 1500, 'nomina'),
    mov('2025-01-02', -700, 'casa'),
    mov('2025-01-20', -100, 'ocio'),
    mov('2025-01-29', -300, 'ahorro', 'ahorro', 'transfer'),
    mov('2025-02-28', 1500, 'nomina'),
    mov('2025-02-02', -1700, 'casa'),
  ]
  const months = ['2025-01', '2025-02']

  it('mes a mes: en febrero pesan más los gastos', () => {
    const jan = balanceSnapshot(ms, cats, months, 0, 'month')
    expect(jan).toMatchObject({ incomeTotal: 1500, expenseTotal: 800, saved: 300, net: 700 })
    expect(jan.tilt).toBeLessThan(0)
    const feb = balanceSnapshot(ms, cats, months, 1, 'month')
    expect(feb.tilt).toBeGreaterThan(0)
    expect(feb.expense[0]).toMatchObject({ categoryId: 'casa', value: 1700 })
  })

  it('acumulado suma todos los meses hasta el elegido', () => {
    const acc = balanceSnapshot(ms, cats, months, 1, 'cumulative')
    expect(acc).toMatchObject({ incomeTotal: 3000, expenseTotal: 2500, net: 500, saved: 300 })
  })
})

describe('colores de hermanos', () => {
  it('familyColor: el primero es el del padre y los demás se distinguen bien', async () => {
    const { familyColor, hexToOklch } = await import('../lib/color')
    const base = '#3987e5'
    const colors = Array.from({ length: 12 }, (_, i) => familyColor(base, i))
    expect(colors[0]).toBe(base)
    expect(new Set(colors).size).toBe(12)
    // Vecinos con tonos claramente distintos (más de 40° de diferencia de matiz).
    for (let i = 1; i < colors.length - 1; i++) {
      const d = Math.abs(hexToOklch(colors[i])[2] - hexToOklch(colors[i + 1])[2]) % 360
      expect(Math.min(d, 360 - d)).toBeGreaterThan(40)
    }
  })
})
