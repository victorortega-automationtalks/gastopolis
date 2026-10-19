/**
 * Escalas para los gráficos SVG propios (sin Recharts). Puro, con tests.
 */

/** Paso «redondo» (1, 2, 2,5 o 5 × 10ⁿ) para unos `count` intervalos entre min y max. */
function niceStep(span: number, count: number): number {
  const raw = span / Math.max(1, count)
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const f = raw / mag
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag
}

/**
 * Marcas del eje con números redondos que cubren [min, max] e incluyen el cero si el rango lo cruza. Devuelve
 * también el dominio redondeado (de la primera a la última marca).
 */
export function niceTicks(min: number, max: number, count = 4): { ticks: number[]; lo: number; hi: number } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { ticks: [0], lo: 0, hi: 1 }
  if (min === max) {
    if (min === 0) return { ticks: [0, 1], lo: 0, hi: 1 }
    min = Math.min(0, min)
    max = Math.max(0, max)
  }
  const step = niceStep(max - min, count)
  const lo = Math.floor(min / step + 1e-9) * step
  const hi = Math.ceil(max / step - 1e-9) * step
  const ticks: number[] = []
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.abs(v) < step / 1e6 ? 0 : Math.round(v * 1e6) / 1e6)
  return { ticks, lo, hi }
}

/** Escala lineal: valor → píxel. */
export function linear(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0)
  return (v) => r0 + (v - d0) * k
}

/**
 * Bandas para columnas agrupadas: cada categoría ocupa `slot` píxeles y sus `groups` barras van centradas, de como
 * mucho `maxBar` píxeles y separadas por `gap`. El aire que sobra se queda alrededor, no ensancha las barras.
 */
export function bands(n: number, width: number, groups = 1, maxBar = 24, gap = 2): { slot: number; bar: number; x: (i: number, g?: number) => number } {
  const slot = n > 0 ? width / n : width
  const usable = slot * 0.72
  const bar = Math.max(1, Math.min(maxBar, (usable - gap * (groups - 1)) / groups))
  const group = bar * groups + gap * (groups - 1)
  return { slot, bar, x: (i, g = 0) => i * slot + (slot - group) / 2 + g * (bar + gap) }
}

/** Índices de las etiquetas del eje x que caben (cada `every`), siempre con la última. */
export function labelEvery(n: number, width: number, minGap = 44): number[] {
  if (n <= 0) return []
  const every = Math.max(1, Math.ceil((n * minGap) / Math.max(1, width)))
  const out: number[] = []
  for (let i = 0; i < n; i += every) out.push(i)
  if (out[out.length - 1] !== n - 1) {
    // Si la última queda demasiado pegada a la anterior, la penúltima cede su sitio.
    if (out.length > 1 && n - 1 - out[out.length - 1] < every / 2) out.pop()
    out.push(n - 1)
  }
  return out
}

/** Trazado SVG de una columna con el extremo de datos redondeado (4 px) y la base recta. */
export function columnPath(x: number, w: number, y0: number, y1: number, r = 4): string {
  const h = Math.abs(y1 - y0)
  if (h < 0.5) return ''
  const rr = Math.min(r, w / 2, h)
  if (y1 < y0) {
    // Hacia arriba: redondeada arriba.
    return `M${x},${y0}V${y1 + rr}Q${x},${y1} ${x + rr},${y1}H${x + w - rr}Q${x + w},${y1} ${x + w},${y1 + rr}V${y0}Z`
  }
  // Hacia abajo (valores negativos): redondeada abajo.
  return `M${x},${y0}V${y1 - rr}Q${x},${y1} ${x + rr},${y1}H${x + w - rr}Q${x + w},${y1} ${x + w},${y1 - rr}V${y0}Z`
}
