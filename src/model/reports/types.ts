/**
 * Un informe es un documento neutro (indicadores, gráficos y tablas con valores sin formatear) que luego se escribe en
 * PDF, Excel o CSV, y se enseña en pantalla. Cada salida decide cómo formatear; el informe solo dice qué es cada cosa.
 */

export type ReportId =
  'summary' | 'monthly' | 'categories' | 'matrix' | 'concepts' | 'movements' | 'budgets' | 'recurring' | 'goals' | 'leaks' | 'compare' | 'lab'

/** Tipo de una columna o un indicador: decide el formato (y, en Excel, el formato de número de la celda). */
export type ValueType = 'text' | 'money' | 'percent' | 'int' | 'date' | 'month'

export type Cell = string | number | null

export interface Column {
  label: string
  type: ValueType
}

export interface TableSection {
  kind: 'table'
  title: string
  columns: Column[]
  rows: Cell[][]
  /** Fila de totales (en negrita). */
  total?: Cell[]
  /** Color de la muestra al lado de la primera celda de cada fila (p. ej., el de la categoría). */
  colors?: (string | null)[]
  /** Filas que son subnivel de la anterior (subcategorías): van sangradas. */
  indent?: boolean[]
  note?: string
}

/** Columnas agrupadas por periodo (meses, trimestres o años), con una serie por cada cosa que se compara. */
export interface ColumnsSection {
  kind: 'columns'
  title: string
  labels: string[]
  series: { label: string; color: string; values: number[] }[]
}

/** Barras horizontales ordenadas (las categorías que más pesan). */
export interface RankingSection {
  kind: 'ranking'
  title: string
  items: { label: string; value: number; color: string }[]
}

export type Tone = 'income' | 'expense' | 'transfer' | 'neutral'

export interface Kpi {
  label: string
  value: number | null
  type: Exclude<ValueType, 'text' | 'date' | 'month'>
  tone?: Tone
  sub?: string
}

export interface KpisSection {
  kind: 'kpis'
  items: Kpi[]
}

export interface TextSection {
  kind: 'text'
  text: string
}

export type Section = TableSection | ColumnsSection | RankingSection | KpisSection | TextSection

export interface ReportDoc {
  id: ReportId
  title: string
  /** «Año 2026», «1 ene 2026 – 19 oct 2026»… */
  period: string
  /** Tablas anchas (meses en columnas): página apaisada. */
  landscape?: boolean
  sections: Section[]
}

/** Lo que se exporta: uno o varios informes (el «informe completo» son todos). */
export interface ReportBundle {
  title: string
  period: string
  generatedAt: Date
  currency: string
  locale: string
  docs: ReportDoc[]
}
