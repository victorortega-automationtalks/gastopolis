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
 * Color n-ésimo de la paleta de categorías: ángulo áureo en el tono y dos niveles de luminosidad
 * alternos, así categorías consecutivas nunca se parecen.
 */
export function paletteColor(i: number): string {
  const hue = (285 + i * 137.508) % 360
  const light = i % 2 === 0 ? 0.76 : 0.68
  return oklchToHex(light, 0.17, hue)
}

/** Muestras para el selector de color. */
export const SWATCHES: string[] = Array.from({ length: 24 }, (_, i) => oklchToHex(i < 12 ? 0.76 : 0.64, 0.17, (i % 12) * 30 + 15))

export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0')
  return hex.length === 7 ? hex + a : hex
}
