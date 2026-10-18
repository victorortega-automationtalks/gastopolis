import type { Kind } from '../model/types'
import { normalizeKey } from '../lib/text'
import type { Cell, SheetGrid } from './read'
import { parseKind } from './values'

export type Role = 'concept' | 'category' | 'date' | 'amount' | 'kind' | 'notes'

export const ROLES: Role[] = ['date', 'concept', 'category', 'amount', 'kind', 'notes']

export const ROLE_LABEL: Record<Role, string> = {
  date: 'Fecha',
  concept: 'Concepto',
  category: 'Categoría',
  amount: 'Importe',
  kind: 'Tipo',
  notes: 'Notas',
}

const SYNONYMS: Record<Role, string[]> = {
  concept: ['concepto', 'descripcion', 'description', 'concept', 'detalle', 'nombre', 'comercio', 'movimiento', 'beneficiario'],
  category: ['categoria', 'category', 'cat', 'grupo'],
  date: ['fecha', 'date', 'fecha operacion', 'fecha valor', 'f valor', 'f operacion', 'dia'],
  amount: ['importe', 'amount', 'cantidad', 'valor', 'monto', 'euros', 'eur', 'importe eur'],
  kind: ['tipo', 'type', 'kind', 'naturaleza', 'tipo de movimiento'],
  notes: ['notas', 'nota', 'notes', 'observaciones', 'comentario', 'comentarios'],
}

const HEADER_INDEX = new Map<string, Role>()
for (const role of ROLES) for (const s of SYNONYMS[role]) HEADER_INDEX.set(s, role)

/** "Importe (€)" → "importe"; "Fecha Operación" → "fecha operacion". Exacto a propósito: "Suma de Importe" no es cabecera. */
export function headerRole(cell: Cell): Role | null {
  if (typeof cell !== 'string') return null
  const k = normalizeKey(cell)
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return HEADER_INDEX.get(k) ?? null
}

export type ColumnMap = Partial<Record<Role, number>>

export interface DetectedTable {
  id: string
  sheet: string
  /** Índice de la fila de cabecera dentro de `SheetGrid.rows`. */
  headerRow: number
  firstCol: number
  lastCol: number
  /** Texto encima de la cabecera ("GASTOS", "INGRESOS") si lo hay. */
  label: string | null
  kindHint: Kind | null
  columns: ColumnMap
  bodyStart: number
  bodyEnd: number
}

const MAX_SCAN_ROWS = 400

/**
 * Busca tablas de movimientos: una fila con cabeceras reconocibles (al menos fecha e importe, más concepto o
 * categoría). Varias tablas pueden compartir fila de cabecera una al lado de la otra, como "GASTOS | INGRESOS".
 */
export function detectTables(sheet: SheetGrid): DetectedTable[] {
  const found: DetectedTable[] = []
  const rows = sheet.rows
  for (let r = 0; r < Math.min(rows.length, MAX_SCAN_ROWS); r++) {
    const row = rows[r] ?? []
    const hits: { col: number; role: Role }[] = []
    row.forEach((cell, col) => {
      const role = headerRole(cell)
      if (role) hits.push({ col, role })
    })
    if (hits.length < 3) continue

    // Se abre grupo nuevo cuando un rol se repite o hay un hueco de más de dos columnas.
    const groups: { col: number; role: Role }[][] = []
    for (const hit of hits) {
      const g = groups[groups.length - 1]
      if (!g || g.some((h) => h.role === hit.role) || hit.col - g[g.length - 1].col > 3) groups.push([hit])
      else g.push(hit)
    }

    for (const g of groups) {
      const columns: ColumnMap = {}
      for (const h of g) columns[h.role] = h.col
      if (columns.date == null || columns.amount == null || (columns.concept == null && columns.category == null)) continue
      const firstCol = g[0].col
      const lastCol = g[g.length - 1].col
      const label = findLabel(rows, r, firstCol, lastCol)
      found.push({
        id: `${sheet.name}!${r}:${firstCol}`,
        sheet: sheet.name,
        headerRow: r,
        firstCol,
        lastCol,
        label,
        kindHint: label ? parseKind(label) : null,
        columns,
        bodyStart: r + 1,
        bodyEnd: rows.length,
      })
    }
  }

  // Una tabla termina donde empieza otra cabecera más abajo que pisa sus columnas.
  for (const t of found) {
    for (const other of found) {
      if (other === t || other.headerRow <= t.headerRow) continue
      const overlaps = other.firstCol <= t.lastCol && other.lastCol >= t.firstCol
      if (overlaps && other.headerRow < t.bodyEnd) t.bodyEnd = other.headerRow
    }
  }
  return found
}

function findLabel(rows: Cell[][], headerRow: number, firstCol: number, lastCol: number): string | null {
  for (let r = headerRow - 1; r >= Math.max(0, headerRow - 3); r--) {
    const row = rows[r] ?? []
    for (let c = firstCol; c <= lastCol; c++) {
      const v = row[c]
      if (typeof v === 'string' && v.trim()) return v.trim()
    }
  }
  return null
}

/** Cabeceras del rango de una tabla, para el selector de columnas del asistente. */
export function headerOptions(sheet: SheetGrid, table: DetectedTable): { col: number; label: string }[] {
  const row = sheet.rows[table.headerRow] ?? []
  const width = Math.max(row.length, table.lastCol + 1)
  const out: { col: number; label: string }[] = []
  for (let c = Math.max(0, table.firstCol - 2); c < Math.min(width, table.lastCol + 3); c++) {
    const v = row[c]
    out.push({ col: c, label: v == null || v === '' ? `Columna ${columnLetter(c + sheet.colOffset)}` : String(v) })
  }
  return out
}

export function columnLetter(c: number): string {
  let s = ''
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}
