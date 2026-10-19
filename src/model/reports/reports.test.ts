import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { buildSample } from '../../data/sample'
import { encodeWinAnsi, fitText, textWidth, wrapText } from '../../lib/pdf/metrics'
import { PdfWriter } from '../../lib/pdf/writer'
import { totals } from '../aggregate'
import { DEFAULT_SETTINGS } from '../defaults'
import type { Goal } from '../types'
import { buildReports, type ReportInput } from './build'
import { REPORTS } from './catalog'
import { columnWidths, reportsToPdf } from './pdf'
import { reportsToCsv, reportsToXlsx } from './sheet'
import type { ReportBundle, ReportDoc, TableSection } from './types'

const NOW = new Date(2026, 9, 19)
const sample = buildSample(NOW)
const goal: Goal = {
  id: 'g1',
  name: 'Entrada del piso',
  icon: 'House',
  color: '#3987e5',
  target: 20000,
  deadline: '2028-06-30',
  initial: 3000,
  startDate: '2025-01-01',
  linkedCategoryIds: ['sample-ahorro'],
  contributions: [],
  priority: 0,
  createdAt: 0,
}

const input = (patch: Partial<ReportInput> = {}): ReportInput => ({
  ...sample,
  goals: [goal],
  decisions: [],
  scenarios: [],
  settings: DEFAULT_SETTINGS,
  period: { preset: 'thisYear' },
  periodLabel: 'Este año',
  categoryIds: [],
  kinds: ['expense', 'income', 'transfer'],
  today: '2026-10-19',
  ...patch,
})

const tables = (d: ReportDoc) => d.sections.filter((s): s is TableSection => s.kind === 'table')
const bundle = (docs: ReportDoc[]): ReportBundle => ({ title: 'Informe', period: 'Este año', generatedAt: NOW, currency: 'EUR', locale: 'es-ES', docs })
const latin1 = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('')

describe('PDF: métricas y escritor', () => {
  it('mide y codifica en WinAnsi (tildes, ñ y €) y omite lo que no existe', () => {
    expect(textWidth('Hola', 'regular', 10)).toBeCloseTo(20.56)
    expect(textWidth('Hola', 'bold', 10)).toBeGreaterThan(textWidth('Hola', 'regular', 10))
    expect(encodeWinAnsi('€ñá·')).toEqual([0x80, 0xf1, 0xe1, 0xb7])
    // Intl pone un espacio fino antes del % y del €: se escribe como espacio duro, no desaparece.
    expect(encodeWinAnsi('5 %')).toEqual([0x35, 0xa0, 0x25])
    expect(encodeWinAnsi('ok 🚀')).toEqual(encodeWinAnsi('ok '))
  })

  it('recorta con «…» y parte líneas por palabras', () => {
    const cut = fitText('Supermercado de la esquina', 'regular', 10, 60)
    expect(cut.endsWith('…')).toBe(true)
    expect(textWidth(cut, 'regular', 10)).toBeLessThanOrEqual(60)
    const lines = wrapText('Cargo mensual desde hace 96 pagos. ¿Lo sigues usando?', 'regular', 8, 90)
    expect(lines.length).toBeGreaterThan(1)
    for (const l of lines) expect(textWidth(l, 'regular', 8)).toBeLessThanOrEqual(90)
  })

  it('escribe un PDF válido: cabecera, objetos en su sitio según la tabla xref y final', async () => {
    const pdf = new PdfWriter('Prueba ñ €', NOW)
    pdf.addPage()
    pdf.text('Gastos 1.234,56 €', 40, 60, { size: 12 })
    pdf.rect(40, 80, 100, 20, '#e11d48', [4, 4, 0, 0])
    pdf.addPage('landscape')
    pdf.line(40, 40, 200, 40, '#000000')
    const bytes = await pdf.toBytes()
    const s = latin1(bytes)
    expect(s.startsWith('%PDF-1.4')).toBe(true)
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(s).toContain('/Count 2')
    const xrefAt = +s
      .slice(s.lastIndexOf('startxref') + 9)
      .trim()
      .split(/\s/)[0]
    expect(s.slice(xrefAt, xrefAt + 4)).toBe('xref')
    const entries = s
      .slice(xrefAt)
      .split('\n')
      .filter((l) => / 00000 n $/.test(l))
    entries.forEach((e, i) => expect(s.slice(+e.slice(0, 10)).startsWith(`${i + 1} 0 obj`)).toBe(true))
  })

  it('anchos de tabla: los números nunca se encogen; el texto corto se queda entero y el largo toma el resto', () => {
    const natural = [60, 80, 400, 70, 50]
    const isText = [true, true, true, false, false]
    const w = columnWidths(natural, isText, 500)
    expect(w[3]).toBe(70)
    expect(w[4]).toBe(50)
    expect(w[0]).toBe(60)
    expect(w[1]).toBe(80)
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(500)
    // Si sobra sitio, se lo quedan las de texto.
    const wide = columnWidths([50, 60], [true, false], 300)
    expect(wide).toEqual([240, 60])
  })
})

describe('informes', () => {
  it('el resumen cuadra con los totales de la app y no inventa meses futuros', () => {
    const { docs, period } = buildReports(['summary', 'monthly'], input())
    expect(period).toContain('1 ene 2026 – 19 oct 2026')
    const inYear = sample.movements.filter((m) => m.date >= '2026-01-01' && m.date <= '2026-10-19')
    const t = totals(inYear)
    const kpis = docs[0].sections.find((s) => s.kind === 'kpis')!
    expect(kpis.kind === 'kpis' && kpis.items.find((k) => k.label === 'Gastos')?.value).toBeCloseTo(t.expense)
    const month = tables(docs[1])[0]
    expect(month.rows.map((r) => r[0])).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'])
    expect(month.total?.[3]).toBeCloseTo(t.net)
  })

  it('por categoría: el peso de las raíces suma el 100 % y las subcategorías van debajo de su raíz', () => {
    const [doc] = buildReports(['categories'], input()).docs
    const gastos = tables(doc).find((t) => t.title === 'Gastos')!
    const roots = gastos.rows.filter((_, i) => !gastos.indent![i])
    expect(roots.reduce((a, r) => a + (r[2] as number), 0)).toBeCloseTo(1)
    expect(gastos.indent!.some(Boolean)).toBe(true)
  })

  it('el filtro de categorías acota los movimientos, y el listado respeta los tipos elegidos', () => {
    const hogar = sample.categories.find((c) => c.name === 'Hogar')!
    const [doc] = buildReports(['movements'], input({ categoryIds: [hogar.id], kinds: ['expense'] })).docs
    const rows = tables(doc)[0].rows
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r[3] === 'Gasto')).toBe(true)
    const hogarIds = new Set(sample.categories.filter((c) => c.id === hogar.id || c.parentId === hogar.id).map((c) => c.name))
    expect(rows.every((r) => hogarIds.has(r[2] as string))).toBe(true)
  })

  it('un periodo sin datos explica que no hay movimientos en vez de dar tablas vacías', () => {
    const { docs } = buildReports(['summary', 'matrix'], input({ period: { preset: 'year', year: 2010 } }))
    for (const d of docs) expect(d.sections).toEqual([{ kind: 'text', text: 'No hay movimientos en este periodo.' }])
  })

  it('todos los informes se construyen con los datos de ejemplo', () => {
    const { docs } = buildReports(
      REPORTS.map((r) => r.id),
      input({ period: { preset: 'all' } }),
    )
    expect(docs.map((d) => d.id)).toEqual(REPORTS.map((r) => r.id))
    for (const d of docs) expect(d.sections.length).toBeGreaterThan(0)
    const goals = tables(docs.find((d) => d.id === 'goals')!)[0]
    expect(goals.rows[0][0]).toBe('Entrada del piso')
  })
})

describe('salidas', () => {
  const all = buildReports(
    REPORTS.map((r) => r.id),
    input(),
  ).docs

  it('PDF: portada con índice y una página nueva por informe', async () => {
    const bytes = await reportsToPdf(bundle(all))
    const s = latin1(bytes)
    const count = +/\/Count (\d+)/.exec(s)![1]
    expect(count).toBeGreaterThan(all.length)
    // Hay páginas apaisadas (tablas anchas).
    expect(s).toContain('/MediaBox [0 0 841.89 595.28]')
  })

  it('Excel: una hoja por informe, importes como números con formato de moneda y fechas como fechas', () => {
    const wb = XLSX.read(reportsToXlsx(bundle(all)), { cellNF: true, cellDates: false })
    expect(wb.SheetNames).toHaveLength(all.length)
    expect(new Set(wb.SheetNames).size).toBe(all.length)
    const ws = wb.Sheets['Movimientos']
    const header = XLSX.utils.encode_cell({ r: 4, c: 0 })
    expect(ws[header].v).toBe('Fecha')
    const date = ws[XLSX.utils.encode_cell({ r: 5, c: 0 })]
    expect(date.t).toBe('n')
    expect(date.z).toBe('dd/mm/yyyy')
    const amount = ws[XLSX.utils.encode_cell({ r: 5, c: 4 })]
    expect(typeof amount.v).toBe('number')
    expect(amount.z).toContain('€')
    expect(Math.round(amount.v * 100)).toBe(amount.v * 100)
    expect(ws['!autofilter']?.ref).toMatch(/^A5:F\d+$/)
  })

  it('CSV: BOM, «;» y coma decimal, para abrirlo con Excel en español', () => {
    const csv = reportsToCsv(bundle(all.filter((d) => d.id === 'monthly')))
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    const lines = csv.split('\r\n')
    expect(lines).toContain('Mes;Ingresos;Gastos;Balance;Apartado;Tasa de ahorro;Balance acumulado;Movimientos')
    const jan = lines.find((l) => l.startsWith('01/2026;'))!
    expect(jan.split(';')[1]).toMatch(/^\d+,\d{2}$/)
    expect(jan.split(';')[5]).toMatch(/^-?\d+,\d%$/)
  })
})
