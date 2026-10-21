import type { ISODate, Movement } from './types'

/**
 * Calendario: el mes en semanas de lunes a domingo, con lo gastado e ingresado cada día. Lógica pura; la pantalla
 * solo la pinta. Los traspasos no cuentan como gasto ni como ingreso (se ven dentro del día).
 */

export interface DayCell {
  iso: ISODate
  day: number
  inMonth: boolean
  isToday: boolean
  isFuture: boolean
  weekend: boolean
  /** En positivo. */
  expense: number
  income: number
  count: number
}

export interface CalendarMonth {
  weeks: DayCell[][]
  weekTotals: { expense: number; income: number }[]
  expense: number
  income: number
  /** El día que más se gastó (si se gastó algo). */
  maxDay?: DayCell
  /** Días ya pasados del mes sin ningún gasto. */
  noSpendDays: number
  /** Racha más larga de días seguidos sin gastar dentro del mes (hasta hoy). */
  bestStreak: number
  /** Días del mes que ya han pasado (o todos, si el mes ya acabó). */
  elapsed: number
  /** Gasto medio por día transcurrido. */
  perDay: number
}

const pad = (n: number) => String(n).padStart(2, '0')
const isoUTC = (d: Date): ISODate => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`

export const monthOf = (iso: ISODate) => iso.slice(0, 7)

/** «2026-10» ± n meses. */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`
}

/** «2026-10-17» ± n días. */
export function shiftDay(iso: ISODate, n: number): ISODate {
  const [y, m, d] = iso.split('-').map(Number)
  return isoUTC(new Date(Date.UTC(y, m - 1, d + n)))
}

export function calendarMonth(
  movements: Pick<Movement, 'date' | 'amount' | 'kind'>[],
  month: string,
  today: ISODate,
  dateOf: (m: Pick<Movement, 'date' | 'amount' | 'kind'>) => ISODate = (m) => m.date,
): CalendarMonth {
  const [y, mo] = month.split('-').map(Number)
  const first = new Date(Date.UTC(y, mo - 1, 1))
  // Lunes de la semana del día 1.
  const start = new Date(Date.UTC(y, mo - 1, 1 - ((first.getUTCDay() + 6) % 7)))
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate()

  const byDay = new Map<ISODate, { expense: number; income: number; count: number }>()
  for (const m of movements) {
    const d = dateOf(m)
    if (d.slice(0, 7) !== month && !(d >= isoUTC(start))) continue
    const e = byDay.get(d) ?? { expense: 0, income: 0, count: 0 }
    e.count++
    if (m.kind === 'expense') e.expense += -m.amount
    else if (m.kind === 'income') e.income += m.amount
    byDay.set(d, e)
  }

  const weeks: DayCell[][] = []
  const weekTotals: { expense: number; income: number }[] = []
  const cursor = new Date(start)
  // Seis semanas como mucho; se paran cuando el mes ya ha terminado.
  for (let w = 0; w < 6; w++) {
    const week: DayCell[] = []
    for (let i = 0; i < 7; i++) {
      const iso = isoUTC(cursor)
      const e = byDay.get(iso)
      week.push({
        iso,
        day: cursor.getUTCDate(),
        inMonth: iso.slice(0, 7) === month,
        isToday: iso === today,
        isFuture: iso > today,
        weekend: i >= 5,
        expense: round(e?.expense ?? 0),
        income: round(e?.income ?? 0),
        count: e?.count ?? 0,
      })
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    weeks.push(week)
    const inside = week.filter((d) => d.inMonth)
    weekTotals.push({ expense: round(sum(inside.map((d) => d.expense))), income: round(sum(inside.map((d) => d.income))) })
    if (isoUTC(cursor).slice(0, 7) !== month && cursor.getUTCDate() <= 7 && w >= 3) break
  }

  const days = weeks.flat().filter((d) => d.inMonth)
  const past = days.filter((d) => !d.isFuture)
  let streak = 0
  let bestStreak = 0
  for (const d of past) {
    streak = d.expense > 0 ? 0 : streak + 1
    bestStreak = Math.max(bestStreak, streak)
  }
  const expense = round(sum(days.map((d) => d.expense)))
  const maxDay = days.reduce<DayCell | undefined>((best, d) => (d.expense > 0 && (!best || d.expense > best.expense) ? d : best), undefined)
  const elapsed = Math.min(past.length, daysInMonth)
  return {
    weeks,
    weekTotals,
    expense,
    income: round(sum(days.map((d) => d.income))),
    maxDay,
    noSpendDays: past.filter((d) => d.expense === 0).length,
    bestStreak,
    elapsed,
    perDay: elapsed ? round(expense / elapsed) : 0,
  }
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const round = (n: number) => Math.round(n * 100) / 100

/** Intensidad (0–1) del color de un día según lo gastado: raíz para que los días normales no se vean todos vacíos. */
export function heat(expense: number, max: number): number {
  if (expense <= 0 || max <= 0) return 0
  return Math.min(1, Math.sqrt(expense / max))
}
