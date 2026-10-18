import * as XLSX from 'xlsx'

export type Cell = string | number | boolean | Date | null

export interface SheetGrid {
  name: string
  rows: Cell[][]
  /** Fila y columna (0-based) de la celda rows[0][0] dentro de la hoja original, para mostrar "fila 17". */
  rowOffset: number
  colOffset: number
  date1904: boolean
}

export interface SourceFile {
  fileName: string
  sheets: SheetGrid[]
}

export async function readFile(file: File): Promise<SourceFile> {
  const buf = await file.arrayBuffer()
  return readBuffer(file.name, buf)
}

export function readBuffer(fileName: string, buf: ArrayBuffer): SourceFile {
  if (/\.(csv|tsv|txt)$/i.test(fileName)) {
    const text = decodeText(new Uint8Array(buf))
    return { fileName, sheets: [{ name: fileName.replace(/\.[^.]+$/, ''), rows: parseDelimited(text), rowOffset: 0, colOffset: 0, date1904: false }] }
  }
  // Sin cellDates: las fechas llegan como número de serie y se convierten en UTC (ver values.ts).
  const wb = XLSX.read(buf, { type: 'array', cellDates: false, cellFormula: false, cellHTML: false, bookVBA: false })
  const date1904 = Boolean(wb.Workbook?.WBProps?.date1904)
  const sheets: SheetGrid[] = []
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]
    if (!ws || !ws['!ref']) continue
    const range = XLSX.utils.decode_range(ws['!ref'])
    const rows = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: null, blankrows: true })
    sheets.push({ name, rows, rowOffset: range.s.r, colOffset: range.s.c, date1904 })
  }
  return { fileName, sheets }
}

/** UTF-8 con BOM o sin él; si no es UTF-8 válido, Windows-1252 (los CSV de muchos bancos). */
function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '')
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

/** CSV/TSV con separador detectado (`,` `;` tab `|`) y comillas RFC 4180. */
export function parseDelimited(text: string): Cell[][] {
  const sample = text.split(/\r?\n/).slice(0, 20)
  const candidates = [';', ',', '\t', '|']
  const delim =
    candidates
      .map((d) => ({ d, score: sample.reduce((acc, line) => acc + line.split(d).length - 1, 0) }))
      .sort((a, b) => b.score - a.score)[0]?.d ?? ','

  const rows: Cell[][] = []
  let row: Cell[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
      continue
    }
    if (ch === '"' && field === '') quoted = true
    else if (ch === delim) {
      row.push(field === '' ? null : field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field === '' ? null : field)
      rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  if (field !== '' || row.length) {
    row.push(field === '' ? null : field)
    rows.push(row)
  }
  return rows
}
