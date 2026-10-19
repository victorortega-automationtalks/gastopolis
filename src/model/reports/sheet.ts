import { utils, write } from 'xlsx'
import { asTable } from './cells'
import type { Cell, ReportBundle, ReportDoc, TableSection, ValueType } from './types'

/**
 * Informes en Excel (.xlsx) y CSV. En Excel cada informe es una hoja; los importes van como números con formato de
 * moneda, las fechas como fechas y los porcentajes como porcentajes, para que se pueda seguir calculando con ellos.
 * Este módulo lo carga la pantalla solo al exportar (SheetJS pesa).
 */

type Row = (string | number | null)[]

/** Bloques de una hoja: título, cabecera, filas, total y nota. `typeAt` dice el tipo de cada celda (fila -1: total). */
interface Block {
  title?: string
  header?: string[]
  typeAt: (row: number, col: number) => ValueType | undefined
  rows: Cell[][]
  total?: Cell[]
  note?: string
  /** Tabla de datos (no indicadores ni texto): si es la única del informe, lleva autofiltro en Excel. */
  data?: boolean
}

function blocksOf(doc: ReportDoc): Block[] {
  const out: Block[] = []
  for (const s of doc.sections) {
    if (s.kind === 'text') out.push({ rows: [[s.text]], typeAt: () => 'text' })
    else if (s.kind === 'kpis')
      out.push({
        title: 'Indicadores',
        header: ['Indicador', 'Valor', ''],
        // Cada indicador tiene su propio tipo (dinero, porcentaje, número).
        typeAt: (r, c) => (c === 1 ? s.items[r]?.type : 'text'),
        rows: s.items.map((k) => [k.label, k.value, k.sub ?? '']),
      })
    else {
      const t: TableSection = s.kind === 'table' ? s : asTable(s)
      out.push({
        title: t.title,
        header: t.columns.map((c) => c.label),
        typeAt: (_, c) => t.columns[c]?.type,
        rows: t.indent ? t.rows.map((r, i) => (t.indent![i] ? [`   ${r[0]}`, ...r.slice(1)] : r)) : t.rows,
        total: t.total,
        note: t.note,
        data: true,
      })
    }
  }
  return out
}

// ── Excel ────────────────────────────────────────────────────────────────────

const EXCEL_EPOCH = Date.UTC(1899, 11, 30)
const serial = (iso: string) => (Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, iso.length > 7 ? +iso.slice(8, 10) : 1) - EXCEL_EPOCH) / 86_400_000

function currencySymbol(currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? currency
  } catch {
    return currency
  }
}

function sheetName(title: string, used: Set<string>): string {
  const base =
    title
      .replace(/[[\]:*?/\\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 31) || 'Informe'
  let name = base
  for (let k = 2; used.has(name.toLowerCase()); k++) name = `${base.slice(0, 28)} ${k}`
  used.add(name.toLowerCase())
  return name
}

export function reportsToXlsx(bundle: ReportBundle): Uint8Array {
  const sym = currencySymbol(bundle.currency, bundle.locale).replace(/"/g, '')
  const FORMAT: Partial<Record<ValueType, string>> = {
    money: `#,##0.00 "${sym}";[Red]-#,##0.00 "${sym}"`,
    percent: '0.0%',
    int: '#,##0',
    date: 'dd/mm/yyyy',
    month: 'mmm yyyy',
  }
  const wb = utils.book_new()
  wb.Props = { Title: `${bundle.title} · ${bundle.period}`, Author: 'Gastópolis', CreatedDate: bundle.generatedAt }
  const used = new Set<string>()

  for (const doc of bundle.docs) {
    const aoa: Row[] = [[doc.title], [doc.period], []]
    const typed: { r: number; c: number; type: ValueType }[] = []
    const widths: number[] = []
    const blocks = blocksOf(doc)
    const dataBlocks = blocks.filter((b) => b.data).length
    let filter: string | null = null
    const put = (row: Cell[], typeOf: (c: number) => ValueType | undefined) => {
      const r = aoa.length
      aoa.push(
        row.map((v, c) => {
          const type = typeOf(c)
          const text = typeof v === 'string' ? v : v == null ? '' : String(v)
          widths[c] = Math.max(widths[c] ?? 0, Math.min(60, text.length + 2))
          if (!type || v == null || v === '') return v
          if ((type === 'date' || type === 'month') && typeof v === 'string' && /^\d{4}-\d{2}/.test(v)) {
            typed.push({ r, c, type })
            return serial(v)
          }
          if (typeof v === 'number' && FORMAT[type]) {
            typed.push({ r, c, type })
            // Sin ruido de coma flotante (1411,7799999…): céntimos en importes, cuatro decimales en porcentajes.
            return type === 'money' ? Math.round(v * 100) / 100 : type === 'percent' ? Math.round(v * 10000) / 10000 : v
          }
          return v
        }),
      )
    }
    for (const b of blocks) {
      if (b.title) aoa.push([b.title])
      if (b.header) {
        if (dataBlocks === 1 && b.data && b.rows.length > 1)
          filter = `A${aoa.length + 1}:${utils.encode_col(b.header.length - 1)}${aoa.length + 1 + b.rows.length}`
        put(b.header, () => 'text')
      }
      b.rows.forEach((row, i) => put(row, (c) => b.typeAt(i, c)))
      if (b.total) put(b.total, (c) => b.typeAt(-1, c))
      if (b.note) aoa.push([b.note])
      aoa.push([])
    }
    const ws = utils.aoa_to_sheet(aoa)
    for (const { r, c, type } of typed) {
      const cell = ws[utils.encode_cell({ r, c })]
      if (cell) {
        cell.t = 'n'
        cell.z = FORMAT[type]
      }
    }
    ws['!cols'] = widths.map((w) => ({ wch: Math.max(10, Math.round(w ?? 0)) }))
    if (filter) ws['!autofilter'] = { ref: filter }
    utils.book_append_sheet(wb, ws, sheetName(doc.title, used))
  }
  return new Uint8Array(write(wb, { type: 'array', bookType: 'xlsx', compression: true }) as ArrayBuffer)
}

// ── CSV ──────────────────────────────────────────────────────────────────────

/** CSV para Excel en español: separador «;», coma decimal, fechas dd/mm/aaaa y BOM para que lea bien las tildes. */
export function reportsToCsv(bundle: ReportBundle): string {
  const esc = (s: string) => (/[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const dec = (v: number, d: number) => v.toFixed(d).replace('.', ',')
  const value = (v: Cell, type: ValueType | undefined): string => {
    if (v == null) return ''
    if (typeof v === 'string') {
      if (type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}`
      if (type === 'month' && /^\d{4}-\d{2}$/.test(v)) return `${v.slice(5, 7)}/${v.slice(0, 4)}`
      return esc(v)
    }
    if (type === 'percent') return `${dec(v * 100, 1)}%`
    if (type === 'int') return String(Math.round(v))
    return dec(v, 2)
  }
  const lines: string[] = []
  for (const doc of bundle.docs) {
    lines.push(esc(doc.title), esc(doc.period), '')
    for (const b of blocksOf(doc)) {
      if (b.title) lines.push(esc(b.title))
      if (b.header) lines.push(b.header.map(esc).join(';'))
      b.rows.forEach((r, i) => lines.push(r.map((v, c) => value(v, b.typeAt(i, c))).join(';')))
      if (b.total) lines.push(b.total.map((v, c) => value(v, b.typeAt(-1, c))).join(';'))
      if (b.note) lines.push(esc(b.note))
      lines.push('')
    }
  }
  return '﻿' + lines.join('\r\n')
}
