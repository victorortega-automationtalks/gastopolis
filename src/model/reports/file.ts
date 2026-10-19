export type ReportFormat = 'pdf' | 'xlsx' | 'csv'

export const FORMAT_INFO: Record<ReportFormat, { label: string; ext: string; mime: string; blurb: string }> = {
  pdf: { label: 'PDF', ext: 'pdf', mime: 'application/pdf', blurb: 'Para leer, imprimir o enviar: con gráficos, tablas y portada.' },
  xlsx: {
    label: 'Excel',
    ext: 'xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    blurb: 'Una hoja por informe, con importes y fechas de verdad para seguir calculando.',
  },
  csv: { label: 'CSV', ext: 'csv', mime: 'text/csv', blurb: 'Texto separado por «;» para cualquier programa (o Excel en español).' },
}

/** «Categorías por mes» → «categorias-por-mes». Sin tildes ni símbolos: el nombre viaja bien por cualquier sistema. */
export function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** gastopolis-resumen-del-periodo-este-ano-20261019.pdf */
export function reportFileName(title: string, periodLabel: string, format: ReportFormat, date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp = `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}`
  return `gastopolis-${[slug(title), slug(periodLabel), stamp].filter(Boolean).join('-')}.${FORMAT_INFO[format].ext}`
}
