import { fitText, textWidth, wrapText, type FontName } from '../../lib/pdf/metrics'
import { PdfWriter, type Orientation } from '../../lib/pdf/writer'
import { bands, labelEvery, linear, niceTicks, placeLabels } from '../../ui/charts/scale'
import { fmtDate } from '../format'
import { REPORT_COLOR } from './build'
import { formatCell, isNumeric, type CellFormat } from './cells'
import type { ColumnsSection, KpisSection, RankingSection, ReportBundle, ReportDoc, Section, TableSection, TextSection, Tone } from './types'

/**
 * Maqueta los informes en PDF: cabecera y pie en cada página, indicadores en tarjetas, columnas y barras con las
 * reglas de los gráficos de la app (extremo redondeado, 2 pt entre barras, un solo eje) y tablas que siguen en la
 * página siguiente repitiendo la cabecera.
 */

const INK = '#12142a'
const MUTED = '#5b5f7a'
const FAINT = '#8b8fa8'
const LINE = '#e3e5ee'
const PANEL = '#f4f5f9'
const ZEBRA = '#fafbfd'
const TONE: Record<Tone, string> = { income: REPORT_COLOR.income, expense: REPORT_COLOR.expense, transfer: REPORT_COLOR.transfer, neutral: INK }

const MARGIN = 40
const TOP = 58
const BOTTOM = 46
const GAP = 22

class Layout {
  y = TOP
  private orientation: Orientation = 'portrait'
  /** Primera página de cada informe, para el índice. */
  readonly starts: number[] = []

  readonly pdf: PdfWriter
  readonly bundle: ReportBundle
  readonly fmt: CellFormat

  constructor(pdf: PdfWriter, bundle: ReportBundle, fmt: CellFormat) {
    this.pdf = pdf
    this.bundle = bundle
    this.fmt = fmt
  }

  get left() {
    return MARGIN
  }
  get right() {
    return this.pdf.width - MARGIN
  }
  get width() {
    return this.right - this.left
  }
  get bottom() {
    return this.pdf.height - BOTTOM
  }

  newPage(orientation = this.orientation) {
    this.orientation = orientation
    this.pdf.addPage(orientation)
    this.y = TOP
  }

  /** Salta de página si no caben `h` puntos más. */
  ensure(h: number): boolean {
    if (this.y + h <= this.bottom) return false
    this.newPage()
    return true
  }

  text(s: string, x: number, y: number, size: number, opts: { font?: FontName; color?: string; align?: 'left' | 'right' | 'center' } = {}) {
    return this.pdf.text(s, x, y, { size, font: opts.font ?? 'regular', color: opts.color ?? INK, align: opts.align })
  }

  sectionTitle(title: string) {
    this.text(title, this.left, this.y + 11, 11.5, { font: 'bold' })
    this.y += 22
  }
}

// ── Secciones ────────────────────────────────────────────────────────────────

function kpis(L: Layout, s: KpisSection) {
  const cols = L.width > 600 ? 4 : 3
  const gap = 10
  const w = (L.width - gap * (cols - 1)) / cols
  const hasSub = s.items.some((k) => k.sub)
  const h = hasSub ? 62 : 50
  for (let i = 0; i < s.items.length; i += cols) {
    L.ensure(h)
    s.items.slice(i, i + cols).forEach((k, j) => {
      const x = L.left + j * (w + gap)
      L.pdf.rect(x, L.y, w, h, PANEL, [6, 6, 6, 6])
      L.text(fitText(k.label.toUpperCase(), 'bold', 6.8, w - 20), x + 10, L.y + 15, 6.8, { font: 'bold', color: FAINT })
      const value = formatCell(k.value, k.type, L.fmt)
      L.text(fitText(value, 'bold', 15, w - 20), x + 10, L.y + 35, 15, { font: 'bold', color: TONE[k.tone ?? 'neutral'] })
      if (k.sub) L.text(fitText(k.sub, 'regular', 7.2, w - 20), x + 10, L.y + 50, 7.2, { color: MUTED })
    })
    L.y += h + gap
  }
  L.y += GAP - gap
}

function legend(L: Layout, series: { label: string; color: string }[], y: number) {
  let x = L.left
  for (const s of series) {
    L.pdf.rect(x, y - 6, 7, 7, s.color, [1.5, 1.5, 1.5, 1.5])
    x += 11 + L.text(s.label, x + 11, y, 8, { color: MUTED }) + 14
  }
}

function columns(L: Layout, s: ColumnsSection) {
  const plotH = 130
  L.ensure(22 + 18 + plotH + 26)
  L.sectionTitle(s.title)
  if (s.series.length > 1) {
    legend(L, s.series, L.y + 6)
    L.y += 16
  }
  const all = s.series.flatMap((x) => x.values)
  const { ticks, lo, hi } = niceTicks(Math.min(0, ...all), Math.max(0, ...all), 4)
  const tick = (v: number) => formatCell(v, 'money', L.fmt, { compact: true })
  const axisW = Math.max(...ticks.map((t) => textWidth(tick(t), 'regular', 7))) + 8
  const x0 = L.left + axisW
  const plotW = L.right - x0
  const top = L.y + 4
  const y = linear(lo, hi, top + plotH, top)
  for (const t of ticks) {
    L.pdf.line(x0, y(t), L.right, y(t), t === 0 ? '#c9ccd9' : LINE, 0.5)
    L.text(tick(t), x0 - 6, y(t) + 2.5, 7, { color: FAINT, align: 'right' })
  }
  const b = bands(s.labels.length, plotW, s.series.length, 22, 2)
  s.series.forEach((ser, g) =>
    ser.values.forEach((v, i) => {
      const x = x0 + b.x(i, g)
      const y1 = y(v)
      const y0 = y(0)
      if (Math.abs(y0 - y1) < 0.3) return
      if (v >= 0) L.pdf.rect(x, y1, b.bar, y0 - y1, ser.color, [2, 2, 0, 0])
      else L.pdf.rect(x, y0, b.bar, y1 - y0, ser.color, [0, 0, 2, 2])
    }),
  )
  const cx = (i: number) => x0 + i * b.slot + b.slot / 2
  const lw = (i: number) => textWidth(s.labels[i], 'regular', 7)
  const maxW = Math.max(...s.labels.map((_, i) => lw(i)), 10)
  for (const l of placeLabels(labelEvery(s.labels.length, plotW, maxW + 8), cx, lw, x0, L.right, 6))
    L.text(s.labels[l.i], l.x, top + plotH + 12, 7, { color: MUTED, align: l.anchor === 'start' ? 'left' : l.anchor === 'end' ? 'right' : 'center' })
  L.y = top + plotH + 18 + GAP
}

function ranking(L: Layout, s: RankingSection) {
  const rowH = 15
  L.ensure(22 + rowH * Math.min(4, s.items.length))
  L.sectionTitle(s.title)
  const labelW = Math.min(150, Math.max(...s.items.map((i) => textWidth(i.label, 'regular', 8))) + 10)
  const values = s.items.map((i) => formatCell(i.value, 'money', L.fmt))
  const valueW = Math.max(...values.map((v) => textWidth(v, 'bold', 8))) + 8
  const barX = L.left + labelW
  const barW = L.width - labelW - valueW
  const max = Math.max(...s.items.map((i) => i.value), 1e-9)
  s.items.forEach((it, i) => {
    if (L.ensure(rowH)) L.y += 4
    const w = Math.max(0, (it.value / max) * barW)
    L.text(fitText(it.label, 'regular', 8, labelW - 10), L.left, L.y + 10, 8)
    L.pdf.rect(barX, L.y + 2.5, w, 9, it.color, [0, 2, 2, 0])
    L.text(values[i], barX + w + 5, L.y + 10, 8, { font: 'bold' })
    L.y += rowH
  })
  L.y += GAP
}

/**
 * Anchos de columna. Las de números y fechas nunca se encogen (un importe cortado no sirve). Las de texto se reparten
 * el resto con justicia: las cortas se quedan enteras y las largas (detalle, notas) toman lo que sobra y parten
 * líneas. Solo si ni las fijas caben (tablas muy anchas) se escala todo.
 */
export function columnWidths(natural: number[], isText: boolean[], avail: number): number[] {
  const fixed = natural.reduce((a, w, j) => a + (isText[j] ? 0 : w), 0)
  const total = natural.reduce((a, b) => a + b, 0)
  if (total <= avail) {
    const flex = isText.some(Boolean) ? isText : natural.map(() => true)
    const share = natural.reduce((a, w, j) => a + (flex[j] ? w : 0), 0)
    return natural.map((w, j) => (flex[j] ? w + ((avail - total) * w) / share : w))
  }
  const out = [...natural]
  let remaining = avail - fixed
  const pending = natural.map((_, j) => j).filter((j) => isText[j])
  pending.sort((x, y) => natural[x] - natural[y])
  while (pending.length) {
    const share = remaining / pending.length
    if (natural[pending[0]] <= share) {
      remaining -= natural[pending[0]]
      pending.shift()
    } else {
      for (const j of pending) out[j] = Math.max(share, 40)
      break
    }
  }
  const sum = out.reduce((a, b) => a + b, 0)
  return sum > avail ? out.map((w) => (w * avail) / sum) : out
}

function table(L: Layout, s: TableSection) {
  const many = s.columns.length > 8
  const size = many ? 7 : 7.8
  const lineH = size + 2.6
  const pad = 10
  const hierarchical = s.indent?.some(Boolean) ?? false
  const lead = (j: number) => (j === 0 ? (s.colors ? 10 : 0) + (hierarchical ? 10 : 0) : 0)
  const sample = s.rows.length > 400 ? s.rows.slice(0, 400) : s.rows
  const natural = s.columns.map((c, j) => {
    let w = textWidth(c.label, 'bold', size - 0.5)
    for (const r of sample) w = Math.max(w, textWidth(formatCell(r[j], c.type, L.fmt), 'bold', size))
    if (s.total) w = Math.max(w, textWidth(formatCell(s.total[j], c.type, L.fmt), 'bold', size))
    return w + pad + lead(j)
  })
  const widths = columnWidths(
    natural,
    s.columns.map((c) => c.type === 'text'),
    L.width,
  )
  const xs: number[] = []
  widths.forEach((_, i) => xs.push(i ? xs[i - 1] + widths[i - 1] : L.left))

  /** Texto de cada celda en líneas (como mucho dos; las de números, una). */
  const linesOf = (cells: (string | number | null)[], font: FontName) =>
    s.columns.map((c, j) => {
      const w = widths[j] - pad - lead(j)
      const text = formatCell(cells[j], c.type, L.fmt)
      if (c.type !== 'text') return [fitText(text, font, size, w)]
      const lines = wrapText(text, font, size, w)
      return lines.length <= 2 ? lines : [lines[0], fitText(lines.slice(1).join(' '), font, size, w)]
    })
  const heightOf = (lines: string[][]) => Math.max(1, ...lines.map((l) => l.length)) * lineH + 4

  const headerH = lineH + 6
  const header = () => {
    L.pdf.rect(L.left, L.y, L.width, headerH, '#eceef5', [3, 3, 3, 3])
    s.columns.forEach((c, j) => {
      const num = isNumeric(c.type)
      const label = fitText(c.label, 'bold', size - 0.5, widths[j] - 8)
      L.text(label, num ? xs[j] + widths[j] - 5 : xs[j] + 5, L.y + headerH - 5, size - 0.5, { font: 'bold', color: MUTED, align: num ? 'right' : 'left' })
    })
    L.y += headerH
  }

  const row = (cells: (string | number | null)[], i: number, opts: { bold?: boolean; zebra?: boolean } = {}) => {
    const sub = s.indent?.[i] ?? false
    const font: FontName = opts.bold || (hierarchical && !sub && i >= 0) ? 'bold' : 'regular'
    const lines = linesOf(cells, font)
    const h = heightOf(lines)
    if (L.ensure(h)) header()
    if (opts.zebra) L.pdf.rect(L.left, L.y, L.width, h, ZEBRA)
    s.columns.forEach((c, j) => {
      let x = xs[j] + 5
      if (j === 0) {
        if (sub) x += 10
        const color = i >= 0 ? s.colors?.[i] : null
        if (color) L.pdf.rect(x, L.y + 2 + lineH / 2 - 2.6, 5.2, 5.2, color, [1.2, 1.2, 1.2, 1.2])
        if (s.colors) x += 10
      }
      const num = isNumeric(c.type)
      const value = cells[j]
      const color = num && typeof value === 'number' && value < 0 && c.type === 'money' ? REPORT_COLOR.expense : sub ? MUTED : INK
      lines[j].forEach((t, k) =>
        L.text(t, num ? xs[j] + widths[j] - 5 : x, L.y + 2 + lineH * (k + 1) - 2.6, size, { font, color, align: num ? 'right' : 'left' }),
      )
    })
    L.y += h
  }

  // El título no se queda solo al pie: con él caben la cabecera y unas filas.
  L.ensure(22 + headerH + lineH * 4)
  L.sectionTitle(s.title)
  header()
  s.rows.forEach((r, i) => row(r, i, { zebra: i % 2 === 1 }))
  if (s.total) {
    if (L.ensure(lineH + 6)) header()
    L.pdf.line(L.left, L.y + 0.5, L.right, L.y + 0.5, INK, 0.8)
    L.y += 1
    row(s.total, -1, { bold: true })
  }
  if (s.note) {
    const lines = wrapText(s.note, 'regular', 7.5, L.width)
    L.ensure(lines.length * 10 + 6)
    L.y += 4
    for (const l of lines) {
      L.text(l, L.left, L.y + 8, 7.5, { color: FAINT })
      L.y += 10
    }
  }
  L.y += GAP
}

function text(L: Layout, s: TextSection) {
  for (const l of wrapText(s.text, 'regular', 9.5, L.width)) {
    L.ensure(14)
    L.text(l, L.left, L.y + 10, 9.5, { color: MUTED })
    L.y += 14
  }
  L.y += GAP - 6
}

function section(L: Layout, s: Section) {
  if (s.kind === 'kpis') kpis(L, s)
  else if (s.kind === 'columns') columns(L, s)
  else if (s.kind === 'ranking') ranking(L, s)
  else if (s.kind === 'table') table(L, s)
  else text(L, s)
}

function docTitle(L: Layout, doc: ReportDoc) {
  L.text(doc.title, L.left, L.y + 18, 20, { font: 'bold' })
  L.text(doc.period, L.left, L.y + 36, 9.5, { color: MUTED })
  L.y += 58
}

function cover(L: Layout) {
  const b = L.bundle
  L.y = 150
  L.text('Gastópolis', L.left, L.y, 12, { font: 'bold', color: REPORT_COLOR.accent })
  L.text(b.title, L.left, L.y + 34, 28, { font: 'bold' })
  L.text(b.period, L.left, L.y + 58, 11, { color: MUTED })
  L.y += 110
  L.text('CONTENIDO', L.left, L.y, 7.5, { font: 'bold', color: FAINT })
  L.y += 10
}

function chrome(L: Layout, page: number, pages: number, title: string) {
  const { pdf } = L
  pdf.setPage(page)
  const generated = `Generado el ${fmtDate(isoLocal(L.bundle.generatedAt))} · Gastópolis, sin conexión: los datos no salen de tu dispositivo`
  L.text('Gastópolis', L.left, 30, 8, { font: 'bold', color: REPORT_COLOR.accent })
  L.text(fitText(title, 'regular', 8, L.width - 80), L.right, 30, 8, { color: FAINT, align: 'right' })
  pdf.line(L.left, 38, L.right, 38, LINE, 0.6)
  pdf.line(L.left, pdf.height - 34, L.right, pdf.height - 34, LINE, 0.6)
  L.text(fitText(generated, 'regular', 7, L.width - 80), L.left, pdf.height - 22, 7, { color: FAINT })
  L.text(`Página ${page + 1} de ${pages}`, L.right, pdf.height - 22, 7, { color: FAINT, align: 'right' })
}

const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** PDF de uno o varios informes. Con varios, lleva portada con índice y cada informe empieza en página nueva. */
export async function reportsToPdf(bundle: ReportBundle): Promise<Uint8Array> {
  const pdf = new PdfWriter(`${bundle.title} · ${bundle.period}`, bundle.generatedAt)
  const L = new Layout(pdf, bundle, { currency: bundle.currency, locale: bundle.locale })
  const withCover = bundle.docs.length > 1
  if (withCover) L.newPage('portrait')
  const titleOf: string[] = []
  for (const doc of bundle.docs) {
    L.newPage(doc.landscape ? 'landscape' : 'portrait')
    L.starts.push(pdf.pageCount - 1)
    docTitle(L, doc)
    for (const s of doc.sections) section(L, s)
    while (titleOf.length < pdf.pageCount) titleOf.push(doc.title)
  }
  if (withCover) {
    pdf.setPage(0)
    cover(L)
    bundle.docs.forEach((d, i) => {
      L.text(d.title, L.left, L.y + 14, 11)
      L.text(String(L.starts[i] + 1), L.right, L.y + 14, 11, { color: MUTED, align: 'right' })
      L.pdf.line(L.left, L.y + 20, L.right, L.y + 20, LINE, 0.5)
      L.y += 24
    })
    titleOf[0] = bundle.title
  }
  for (let p = 0; p < pdf.pageCount; p++) chrome(L, p, pdf.pageCount, titleOf[p])
  return pdf.toBytes()
}
