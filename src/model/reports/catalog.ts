import type { ReportId } from './types'

export interface ReportInfo {
  id: ReportId
  title: string
  blurb: string
  /** Mira el periodo elegido (los de «a hoy» miran hasta el final del periodo). */
  period: 'range' | 'asOf'
  /** Se puede acotar a unas categorías. */
  categories: boolean
}

export const REPORTS: ReportInfo[] = [
  {
    id: 'summary',
    title: 'Resumen del periodo',
    blurb: 'Ingresos, gastos, balance, tasa de ahorro y en qué se va el dinero.',
    period: 'range',
    categories: true,
  },
  {
    id: 'monthly',
    title: 'Evolución mes a mes',
    blurb: 'Cada mes: ingresos, gastos, balance, lo apartado, tasa de ahorro y acumulado.',
    period: 'range',
    categories: true,
  },
  {
    id: 'categories',
    title: 'Por categoría',
    blurb: 'Categorías y subcategorías: importe, peso, media al mes y presupuesto.',
    period: 'range',
    categories: true,
  },
  { id: 'matrix', title: 'Categorías en el tiempo', blurb: 'Tabla cruzada de categorías por mes, trimestre o año.', period: 'range', categories: true },
  { id: 'concepts', title: 'Por concepto', blurb: 'Los comercios y conceptos que más suman, cuántas veces y su media.', period: 'range', categories: true },
  {
    id: 'compare',
    title: 'Comparativa anual',
    blurb: 'El periodo frente al mismo periodo del año anterior, por categoría.',
    period: 'range',
    categories: true,
  },
  { id: 'budgets', title: 'Presupuestos', blurb: 'Presupuesto contra gasto real y los meses en que te pasaste.', period: 'range', categories: true },
  {
    id: 'recurring',
    title: 'Suscripciones y cargos fijos',
    blurb: 'Cargos periódicos detectados, su coste al año y las subidas de precio.',
    period: 'asOf',
    categories: true,
  },
  {
    id: 'goals',
    title: 'Objetivos',
    blurb: 'Progreso de cada objetivo, ritmo, lo que hace falta al mes y llegada estimada.',
    period: 'asOf',
    categories: false,
  },
  { id: 'leaks', title: 'Fugas de dinero', blurb: 'Avisos del detector de fugas con su coste y lo que decidiste.', period: 'asOf', categories: true },
  {
    id: 'lab',
    title: 'Escenarios del Laboratorio',
    blurb: 'Tus escenarios guardados y lo que tendrías en 1, 3, 5 y 10 años.',
    period: 'asOf',
    categories: false,
  },
  {
    id: 'movements',
    title: 'Listado de movimientos',
    blurb: 'Todos los movimientos del periodo, con su categoría y notas.',
    period: 'range',
    categories: true,
  },
]

export const reportInfo = (id: ReportId) => REPORTS.find((r) => r.id === id)!
