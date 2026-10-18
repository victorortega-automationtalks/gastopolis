import { looksLikeTransfer } from '../model/defaults'
import type { Category, ISODate, Kind, Movement } from '../model/types'
import { cleanLabel, normalizeKey, preferredSpelling } from '../lib/text'
import type { ColumnMap, DetectedTable } from './detect'
import { headerRole } from './detect'
import type { SheetGrid, SourceFile } from './read'
import { parseAmount, parseDate, parseKind } from './values'

export type SignMode = 'auto' | 'asis' | 'invert'

export interface TableConfig extends DetectedTable {
  include: boolean
  signMode: SignMode
}

export interface PlannedRow {
  date: ISODate
  amount: number
  concept: string
  conceptKey: string
  notes?: string
  /** Tipo según la hoja (columna Tipo, rótulo de la tabla o signo). */
  sourceKind: Kind
  /** Clave de la categoría de origen: `${sourceKind}|${nombre normalizado}`. */
  categorySourceKey: string
  sheet: string
  tableId: string
  /** Número de fila tal como lo vería alguien en Excel (1-based). */
  rowNumber: number
  duplicate: boolean
}

export interface SkippedRow {
  sheet: string
  rowNumber: number
  reason: string
  preview: string
}

export interface PlannedCategory {
  sourceKey: string
  name: string
  sourceKind: Kind
  /** Tipo final: el de origen salvo que parezca transferencia (Ahorro, Cryptos…) o el usuario lo cambie. */
  kind: Kind
  /** Categoría ya existente con el mismo nombre y tipo, si la hay. */
  existingId: string | null
  count: number
  total: number
}

export interface ImportPlan {
  fileName: string
  rows: PlannedRow[]
  skipped: SkippedRow[]
  categories: PlannedCategory[]
  stats: { parsed: number; fresh: number; duplicates: number; skipped: number; newCategories: number }
}

export interface ExistingData {
  movements: Pick<Movement, 'date' | 'amount' | 'conceptKey'>[]
  categories: Pick<Category, 'id' | 'name' | 'kind'>[]
}

export const NO_CATEGORY = 'Sin categoría'

export function dedupKey(date: string, amount: number, conceptKey: string): string {
  return `${date}|${amount.toFixed(2)}|${conceptKey}`
}

export function categoryIdentity(kind: Kind, name: string): string {
  return `${kind}|${normalizeKey(name)}`
}

export function defaultTableConfig(t: DetectedTable): TableConfig {
  return { ...t, include: true, signMode: 'auto' }
}

export function buildPlan(source: SourceFile, tables: TableConfig[], existing: ExistingData, kindOverrides: Record<string, Kind> = {}): ImportPlan {
  const rows: PlannedRow[] = []
  const skipped: SkippedRow[] = []
  const catNames = new Map<string, string[]>()

  for (const table of tables) {
    if (!table.include) continue
    const sheet = source.sheets.find((s) => s.name === table.sheet)
    if (!sheet) continue
    const { rows: tableRows, skipped: tableSkipped } = readTable(sheet, table)
    for (const r of tableRows) {
      const key = r.categorySourceKey
      const names = catNames.get(key) ?? []
      names.push(r.categoryName)
      catNames.set(key, names)
      rows.push(r.row)
    }
    skipped.push(...tableSkipped)
  }

  // Duplicados frente a lo que ya hay: se descuenta por ocurrencias, así dos cafés iguales el mismo día no se pierden.
  const existingCounts = new Map<string, number>()
  for (const m of existing.movements) {
    const k = dedupKey(m.date, m.amount, m.conceptKey)
    existingCounts.set(k, (existingCounts.get(k) ?? 0) + 1)
  }
  for (const r of rows) {
    const k = dedupKey(r.date, r.amount, r.conceptKey)
    const left = existingCounts.get(k) ?? 0
    if (left > 0) {
      r.duplicate = true
      existingCounts.set(k, left - 1)
    }
  }

  const existingByIdentity = new Map(existing.categories.map((c) => [categoryIdentity(c.kind, c.name), c.id]))
  const categories: PlannedCategory[] = []
  for (const [sourceKey, names] of catNames) {
    const sourceKind = sourceKey.split('|')[0] as Kind
    const name = preferredSpelling(names)
    const kind = kindOverrides[sourceKey] ?? (looksLikeTransfer(name) ? 'transfer' : sourceKind)
    const fresh = rows.filter((r) => r.categorySourceKey === sourceKey && !r.duplicate)
    categories.push({
      sourceKey,
      name,
      sourceKind,
      kind,
      existingId: existingByIdentity.get(categoryIdentity(kind, name)) ?? null,
      count: fresh.length,
      total: fresh.reduce((a, r) => a + r.amount, 0),
    })
  }
  categories.sort((a, b) => a.total - b.total)

  // Dos categorías de origen pueden acabar en la misma (Cryptos de gastos y de ingresos → una transferencia).
  const newIdentities = new Set(categories.filter((c) => !c.existingId && c.count > 0).map((c) => categoryIdentity(c.kind, c.name)))
  const duplicates = rows.filter((r) => r.duplicate).length
  return {
    fileName: source.fileName,
    rows,
    skipped,
    categories,
    stats: { parsed: rows.length, fresh: rows.length - duplicates, duplicates, skipped: skipped.length, newCategories: newIdentities.size },
  }
}

interface RawRow {
  row: PlannedRow
  categoryName: string
  categorySourceKey: string
}

function readTable(sheet: SheetGrid, table: TableConfig): { rows: RawRow[]; skipped: SkippedRow[] } {
  const cols: ColumnMap = table.columns
  const out: { date: ISODate; amount: number; concept: string; notes?: string; kind: Kind; category: string; rowIndex: number }[] = []
  const skipped: SkippedRow[] = []
  const at = (row: SheetGrid['rows'][number], c: number | undefined) => (c == null ? null : (row[c] ?? null))

  for (let r = table.bodyStart; r < table.bodyEnd; r++) {
    const row = sheet.rows[r] ?? []
    const cells = [cols.date, cols.amount, cols.concept, cols.category].map((c) => at(row, c))
    if (cells.every((v) => v == null || v === '')) continue
    // Cabecera repetida a mitad de tabla.
    if (headerRole(at(row, cols.date)) === 'date' || headerRole(at(row, cols.amount)) === 'amount') continue

    const rowNumber = r + sheet.rowOffset + 1
    const date = parseDate(at(row, cols.date), sheet.date1904)
    const preview = [date ?? cells[0], ...cells.slice(1)]
      .filter((v) => v != null && v !== '')
      .map(String)
      .join(' · ')
    if (!date) {
      skipped.push({ sheet: sheet.name, rowNumber, reason: 'Fecha vacía o no reconocida', preview })
      continue
    }
    const amount = parseAmount(at(row, cols.amount))
    if (amount == null || amount === 0) {
      skipped.push({ sheet: sheet.name, rowNumber, reason: amount === 0 ? 'Importe cero' : 'Importe vacío o no numérico', preview })
      continue
    }
    const conceptRaw = at(row, cols.concept)
    const categoryRaw = at(row, cols.category)
    const category = categoryRaw != null && String(categoryRaw).trim() ? cleanLabel(String(categoryRaw)) : NO_CATEGORY
    const concept = conceptRaw != null && String(conceptRaw).trim() ? cleanLabel(String(conceptRaw)) : category
    const notesRaw = at(row, cols.notes)
    const kind = parseKind(at(row, cols.kind)) ?? table.kindHint ?? (amount < 0 ? 'expense' : 'income')
    out.push({ date, amount, concept, notes: notesRaw ? String(notesRaw) : undefined, kind, category, rowIndex: r })
  }

  // Signo: los gastos salen en negativo y los ingresos en positivo. Si una tabla de gastos viene
  // casi entera en positivo es que se apuntaron como magnitudes, y se invierte.
  const flip = new Set<Kind>()
  if (table.signMode === 'auto') {
    for (const kind of ['expense', 'income'] as Kind[]) {
      const ofKind = out.filter((o) => o.kind === kind)
      if (ofKind.length < 3) continue
      const wrong = ofKind.filter((o) => (kind === 'expense' ? o.amount > 0 : o.amount < 0)).length
      if (wrong / ofKind.length > 0.8) flip.add(kind)
    }
  }

  const rows: RawRow[] = out.map((o) => {
    const amount = table.signMode === 'invert' || flip.has(o.kind) ? -o.amount : o.amount
    const categorySourceKey = `${o.kind}|${normalizeKey(o.category)}`
    return {
      categoryName: o.category,
      categorySourceKey,
      row: {
        date: o.date,
        amount,
        concept: o.concept,
        conceptKey: normalizeKey(o.concept),
        notes: o.notes,
        sourceKind: o.kind,
        categorySourceKey,
        sheet: sheet.name,
        tableId: table.id,
        rowNumber: o.rowIndex + sheet.rowOffset + 1,
        duplicate: false,
      },
    }
  })
  return { rows, skipped }
}
