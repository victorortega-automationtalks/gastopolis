import { encodeWinAnsi, textWidth, type FontName } from './metrics'

/**
 * Escritor de PDF mínimo, sin dependencias: páginas A4, texto en Helvetica (fuente estándar, no se incrusta),
 * rectángulos (con esquinas redondeadas) y líneas. Coordenadas en puntos con el origen arriba a la izquierda, como en
 * pantalla; aquí se pasan a las de PDF (origen abajo). Los flujos de contenido van comprimidos.
 */

export const A4 = { width: 595.28, height: 841.89 }

export type Orientation = 'portrait' | 'landscape'

interface Page {
  width: number
  height: number
  ops: string[]
}

export interface TextOpts {
  font?: FontName
  size?: number
  color?: string
  align?: 'left' | 'right' | 'center'
}

const FONT_REF: Record<FontName, string> = { regular: 'F1', bold: 'F2' }

const n = (v: number) => (Math.round(v * 100) / 100).toString()

function rgb(hex: string): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h.slice(0, 6)
  const v = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
  return v.map((x) => n(Number.isFinite(x) ? x : 0)).join(' ')
}

const hexBytes = (bytes: number[]) => bytes.map((b) => b.toString(16).padStart(2, '0')).join('')

/** Texto para el diccionario Info: UTF-16BE con BOM, en hexadecimal (admite cualquier carácter). */
function utf16Hex(s: string): string {
  let out = 'FEFF'
  for (let i = 0; i < s.length; i++) out += s.charCodeAt(i).toString(16).padStart(4, '0')
  return `<${out}>`
}

function pdfDate(d: Date): string {
  const p = (x: number) => String(x).padStart(2, '0')
  return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

async function deflate(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export class PdfWriter {
  private pages: Page[] = []
  private current = -1
  private readonly title: string
  private readonly created: Date

  constructor(title: string, created = new Date()) {
    this.title = title
    this.created = created
  }

  get pageCount(): number {
    return this.pages.length
  }

  get width(): number {
    return this.pages[this.current].width
  }

  get height(): number {
    return this.pages[this.current].height
  }

  addPage(orientation: Orientation = 'portrait'): number {
    const [width, height] = orientation === 'portrait' ? [A4.width, A4.height] : [A4.height, A4.width]
    this.pages.push({ width, height, ops: [] })
    this.current = this.pages.length - 1
    return this.current
  }

  setPage(i: number): void {
    this.current = i
  }

  private op(s: string) {
    this.pages[this.current].ops.push(s)
  }

  private y(v: number): number {
    return this.height - v
  }

  /**
   * Rectángulo relleno. `radii` redondea cada esquina [arriba-izq, arriba-der, abajo-der, abajo-izq]: las columnas
   * llevan el extremo de datos redondeado y la base recta.
   */
  rect(x: number, y: number, w: number, h: number, color: string, radii: [number, number, number, number] = [0, 0, 0, 0]): void {
    if (w <= 0 || h <= 0) return
    const lim = Math.min(w, h) / 2
    const [tl, tr, br, bl] = radii.map((r) => Math.max(0, Math.min(r, lim)))
    const k = 0.5523 // Aproximación de un cuarto de círculo con una Bézier.
    const X = (v: number) => n(v)
    const Y = (v: number) => n(this.y(v))
    const path = [
      `${X(x + tl)} ${Y(y)} m`,
      `${X(x + w - tr)} ${Y(y)} l`,
      tr ? `${X(x + w - tr + tr * k)} ${Y(y)} ${X(x + w)} ${Y(y + tr - tr * k)} ${X(x + w)} ${Y(y + tr)} c` : '',
      `${X(x + w)} ${Y(y + h - br)} l`,
      br ? `${X(x + w)} ${Y(y + h - br + br * k)} ${X(x + w - br + br * k)} ${Y(y + h)} ${X(x + w - br)} ${Y(y + h)} c` : '',
      `${X(x + bl)} ${Y(y + h)} l`,
      bl ? `${X(x + bl - bl * k)} ${Y(y + h)} ${X(x)} ${Y(y + h - bl + bl * k)} ${X(x)} ${Y(y + h - bl)} c` : '',
      `${X(x)} ${Y(y + tl)} l`,
      tl ? `${X(x)} ${Y(y + tl - tl * k)} ${X(x + tl - tl * k)} ${Y(y)} ${X(x + tl)} ${Y(y)} c` : '',
    ]
    this.op(`${rgb(color)} rg ${path.filter(Boolean).join(' ')} h f`)
  }

  line(x1: number, y1: number, x2: number, y2: number, color: string, width = 0.5, dash?: number[]): void {
    this.op(`${rgb(color)} RG ${n(width)} w [${(dash ?? []).map(n).join(' ')}] 0 d ${n(x1)} ${n(this.y(y1))} m ${n(x2)} ${n(this.y(y2))} l S`)
  }

  /** Texto en una línea; `y` es la línea base. Devuelve el ancho. */
  text(s: string, x: number, y: number, { font = 'regular', size = 10, color = '#000000', align = 'left' }: TextOpts = {}): number {
    const bytes = encodeWinAnsi(s)
    if (!bytes.length) return 0
    const w = textWidth(s, font, size)
    const left = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x
    this.op(`BT ${rgb(color)} rg /${FONT_REF[font]} ${n(size)} Tf ${n(left)} ${n(this.y(y))} Td <${hexBytes(bytes)}> Tj ET`)
    return w
  }

  async toBytes(): Promise<Uint8Array> {
    // 1 catálogo, 2 árbol de páginas, 3–4 fuentes, 5 info; luego, por página, la página y su contenido.
    const objects: (string | Uint8Array)[] = []
    const pageIds = this.pages.map((_, i) => 6 + i * 2)
    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
    objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${this.pages.length} >>`
    objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
    objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
    objects[5] = `<< /Title ${utf16Hex(this.title)} /Producer ${utf16Hex('Gastópolis')} /CreationDate (${pdfDate(this.created)}) >>`
    for (const [i, p] of this.pages.entries()) {
      const id = pageIds[i]
      objects[id] =
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(p.width)} ${n(p.height)}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${id + 1} 0 R >>`
      objects[id + 1] = await deflate(p.ops.join('\n'))
    }

    const enc = new TextEncoder()
    const chunks: Uint8Array[] = []
    let length = 0
    const push = (part: string | Uint8Array) => {
      const b = typeof part === 'string' ? enc.encode(part) : part
      chunks.push(b)
      length += b.length
    }
    push('%PDF-1.4\n')
    const offsets: number[] = []
    for (let id = 1; id < objects.length; id++) {
      offsets[id] = length
      const o = objects[id]
      if (typeof o === 'string') push(`${id} 0 obj\n${o}\nendobj\n`)
      else {
        push(`${id} 0 obj\n<< /Length ${o.length} /Filter /FlateDecode >>\nstream\n`)
        push(o)
        push('\nendstream\nendobj\n')
      }
    }
    const xref = length
    push(`xref\n0 ${objects.length}\n0000000000 65535 f \n`)
    for (let id = 1; id < objects.length; id++) push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`)
    push(`trailer\n<< /Size ${objects.length} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`)

    const out = new Uint8Array(length)
    let at = 0
    for (const c of chunks) {
      out.set(c, at)
      at += c.length
    }
    return out
  }
}
