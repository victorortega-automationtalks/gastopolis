/** OKLCH → sRGB hex, reduciendo croma hasta entrar en gama. */
export function oklchToHex(l: number, c: number, hDeg: number): string {
  for (let chroma = c; chroma >= 0; chroma -= 0.005) {
    const rgb = oklchToRgb(l, chroma, hDeg)
    if (rgb.every((v) => v >= -0.0005 && v <= 1.0005)) return rgbToHex(rgb)
  }
  return rgbToHex(oklchToRgb(l, 0, hDeg))
}

function oklchToRgb(L: number, C: number, hDeg: number): [number, number, number] {
  const h = (hDeg * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  return lin.map((v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)) as [number, number, number]
}

function rgbToHex(rgb: number[]): string {
  return (
    '#' +
    rgb
      .map((v) =>
        Math.round(Math.min(1, Math.max(0, v)) * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  )
}

/**
 * Paleta categórica validada (skill dataviz, validate_palette.js) sobre el fondo oscuro #06070c y sobre blanco:
 * banda de luminosidad, croma, separación con daltonismo entre vecinos ≥ 8,4 y contraste ≥ 3:1.
 * El orden es parte de la validación: no reordenar.
 */
export const CATEGORY_PALETTE = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']

/**
 * Color de la n-ésima categoría. Pasadas las 8 primeras se repiten los tonos en variante clara y luego oscura;
 * a partir de ahí la identidad la llevan las etiquetas (chips, rótulos de distrito), no solo el color.
 */
export function paletteColor(i: number): string {
  const base = CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]
  const round = Math.floor(i / CATEGORY_PALETTE.length) % 3
  return round === 0 ? base : shade(base, round === 1 ? 0.3 : -0.3)
}

/** Muestras para el selector de color: la paleta validada y sus variantes. */
export const SWATCHES: string[] = Array.from({ length: 24 }, (_, i) => paletteColor(i))

export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0')
  return hex.length === 7 ? hex + a : hex
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Aclara (amt > 0) u oscurece (amt < 0) mezclando con blanco o negro. */
export function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex)
  const t = amt < 0 ? 0 : 255
  const p = Math.abs(amt)
  return rgbToHex([r, g, b].map((v) => (v + (t - v) * p) / 255))
}

/** Rampa secuencial de un solo tono (brasa): 0 apagado → 1 incandescente. Sobre fondo oscuro, más valor = más luz. */
export function heatColor(t: number): string {
  const x = Math.min(1, Math.max(0, t))
  return oklchToHex(0.36 + 0.46 * x, 0.07 + 0.12 * x, 38)
}
