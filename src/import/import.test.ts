import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { detectTables, headerRole } from './detect'
import { buildPlan, defaultTableConfig } from './plan'
import { parseDelimited, readBuffer, type Cell, type SheetGrid, type SourceFile } from './read'
import { excelSerialToISO, parseAmount, parseDate, parseKind } from './values'

const d = (s: string) => {
  // Fecha → número de serie de Excel, como llega de un .xlsx.
  const [y, m, day] = s.split('-').map(Number)
  return (Date.UTC(y, m - 1, day) - Date.UTC(1899, 11, 30)) / 86_400_000
}

/** Misma forma que la hoja "2025" del Excel de JJ: título, filas vacías, rótulos, dos tablas en paralelo. */
function jjLikeSheet(): SheetGrid {
  const empty = (): Cell[] => Array(11).fill(null)
  const rows: Cell[][] = [[2025, ...Array(10).fill(null)]]
  for (let i = 0; i < 13; i++) rows.push(empty())
  rows.push(['GASTOS', null, null, null, null, null, 'INGRESOS', null, null, null, null])
  rows.push(empty())
  rows.push(['Concepto', 'Categoría', 'Fecha', 'Importe (€)', 'Tipo', null, 'Concepto', 'Categoría', 'Fecha', 'Importe (€)', 'Tipo'])
  const expenses: Cell[][] = [
    ['Pc', 'Electrónica', d('2025-01-01'), -600, 'gasto'],
    ['Mediamark ', 'Electrónica', d('2025-01-01'), -76, 'gasto'],
    ['Spotify', 'Otros', d('2025-01-01'), -9, 'gasto'],
    ['Repsol', 'Gasolina', d('2025-01-01'), -71.16, 'gasto'],
    ['Revolut', 'Cryptos', d('2025-01-13'), -200, 'gasto'],
    ['???', 'Otros', d('2025-01-13'), -11.25, 'gasto'],
    ['sin fecha', 'Otros', null, -5, 'gasto'],
    ['Spotify', 'Otros', d('2025-02-01'), -9, 'gasto'],
  ]
  const incomes: Cell[][] = [
    ['Nómina', 'Decathlon', d('2025-01-01'), 1544.44, 'ingreso'],
    ['SanDisk', 'Venta_2mano', d('2025-01-01'), 60, 'ingreso'],
    ['Ahorro 2024', 'Ahorro', d('2025-01-01'), 400, 'ingreso'],
    ['Nomina', 'Decathlon', d('2025-02-01'), 1289.97, 'ingreso'],
  ]
  for (let i = 0; i < expenses.length; i++) {
    const inc = incomes[i] ?? [null, null, null, null, null]
    rows.push([...expenses[i], null, ...inc])
  }
  return { name: '2025', rows, rowOffset: 0, colOffset: 0, date1904: false }
}

/** Tabla dinámica como la de la hoja "tabla": no debe confundirse con datos. */
function pivotSheet(): SheetGrid {
  return {
    name: 'tabla',
    rowOffset: 0,
    colOffset: 0,
    date1904: false,
    rows: [
      ['Suma de Importe (€)', 'Columnas', null],
      ['Conceptos', 'gasto', 'TOTAL'],
      ['devolucion amazon', -91.43, -91.43],
    ],
  }
}

const empty = { movements: [], categories: [] }

describe('valores', () => {
  it('lee importes en formato español e inglés', () => {
    expect(parseAmount('-1.234,56 €')).toBe(-1234.56)
    expect(parseAmount('1,234.56')).toBe(1234.56)
    expect(parseAmount('12,30')).toBe(12.3)
    expect(parseAmount('(12,30)')).toBe(-12.3)
    expect(parseAmount('12,30-')).toBe(-12.3)
    expect(parseAmount('1.234')).toBe(1234)
    expect(parseAmount('+60')).toBe(60)
    expect(parseAmount(-71.16)).toBe(-71.16)
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount('')).toBeNull()
  })

  it('lee fechas de Excel y de texto, día antes que mes', () => {
    expect(excelSerialToISO(d('2025-07-03'))).toBe('2025-07-03')
    expect(parseDate('03/07/2025')).toBe('2025-07-03')
    expect(parseDate('3-7-25')).toBe('2025-07-03')
    expect(parseDate('2025-07-03')).toBe('2025-07-03')
    expect(parseDate('31/02/2025')).toBeNull()
    expect(parseDate('mañana')).toBeNull()
  })

  it('reconoce el tipo', () => {
    expect(parseKind('gasto')).toBe('expense')
    expect(parseKind('INGRESOS')).toBe('income')
    expect(parseKind('Traspaso')).toBe('transfer')
    expect(parseKind('otra cosa')).toBeNull()
  })

  it('reconoce cabeceras exactas, no frases que las contienen', () => {
    expect(headerRole('Importe (€)')).toBe('amount')
    expect(headerRole('Categoría')).toBe('category')
    expect(headerRole('Fecha Operación')).toBe('date')
    expect(headerRole('Suma de Importe (€)')).toBeNull()
  })
})

describe('detección de tablas', () => {
  it('encuentra las dos tablas en paralelo con su rótulo', () => {
    const tables = detectTables(jjLikeSheet())
    expect(tables).toHaveLength(2)
    const [g, i] = tables
    expect(g.label).toBe('GASTOS')
    expect(g.kindHint).toBe('expense')
    expect(g.columns).toEqual({ concept: 0, category: 1, date: 2, amount: 3, kind: 4 })
    expect(i.label).toBe('INGRESOS')
    expect(i.kindHint).toBe('income')
    expect(i.columns).toEqual({ concept: 6, category: 7, date: 8, amount: 9, kind: 10 })
  })

  it('ignora tablas dinámicas', () => {
    expect(detectTables(pivotSheet())).toHaveLength(0)
  })

  it('corta una tabla donde empieza otra debajo', () => {
    const sheet: SheetGrid = {
      name: 's',
      rowOffset: 0,
      colOffset: 0,
      date1904: false,
      rows: [
        ['Fecha', 'Concepto', 'Importe'],
        ['01/01/2025', 'a', '-1'],
        [null, null, null],
        ['Fecha', 'Concepto', 'Importe'],
        ['02/01/2025', 'b', '-2'],
      ],
    }
    const [a, b] = detectTables(sheet)
    expect(a.bodyEnd).toBe(3)
    expect(b.bodyStart).toBe(4)
  })
})

describe('plan de importación', () => {
  const source: SourceFile = { fileName: 'jj.xlsm', sheets: [jjLikeSheet(), pivotSheet()] }
  const tables = () => source.sheets.flatMap(detectTables).map(defaultTableConfig)

  it('importa gastos e ingresos y salta filas sin fecha con su número de fila', () => {
    const plan = buildPlan(source, tables(), empty)
    expect(plan.stats.parsed).toBe(11)
    expect(plan.skipped).toEqual([{ sheet: '2025', rowNumber: 24, reason: 'Fecha vacía o no reconocida', preview: '-5 · sin fecha · Otros' }])
    const pc = plan.rows.find((r) => r.concept === 'Pc')!
    expect(pc).toMatchObject({ date: '2025-01-01', amount: -600, sourceKind: 'expense', rowNumber: 18 })
  })

  it('normaliza conceptos para agrupar', () => {
    const plan = buildPlan(source, tables(), empty)
    expect(plan.rows.find((r) => r.concept === 'Mediamark')?.conceptKey).toBe('mediamark')
    const nominas = plan.rows.filter((r) => r.conceptKey === 'nomina')
    expect(nominas).toHaveLength(2)
  })

  it('convierte Ahorro y Cryptos en transferencias aunque vengan como gasto o ingreso', () => {
    const plan = buildPlan(source, tables(), empty)
    const byName = Object.fromEntries(plan.categories.map((c) => [`${c.sourceKind}:${c.name}`, c.kind]))
    expect(byName['expense:Cryptos']).toBe('transfer')
    expect(byName['income:Ahorro']).toBe('transfer')
    expect(byName['expense:Gasolina']).toBe('expense')
    expect(byName['income:Venta_2mano']).toBe('income')
  })

  it('separa "Otros" de gastos y de ingresos, y respeta el tipo que elija el usuario', () => {
    const plan = buildPlan(source, tables(), empty, { 'expense|cryptos': 'expense' })
    expect(plan.categories.find((c) => c.sourceKey === 'expense|cryptos')?.kind).toBe('expense')
  })

  it('marca duplicados contra lo ya importado, por ocurrencias', () => {
    const first = buildPlan(source, tables(), empty)
    const existing = {
      movements: first.rows.filter((r) => r.concept === 'Pc' || r.concept === 'Spotify').slice(0, 2),
      categories: [{ id: 'c1', name: 'electronica', kind: 'expense' as const }],
    }
    const plan = buildPlan(source, tables(), existing)
    expect(plan.stats.duplicates).toBe(2)
    // El Spotify de febrero no es duplicado del de enero.
    expect(plan.rows.filter((r) => r.concept === 'Spotify' && !r.duplicate)).toHaveLength(1)
    expect(plan.categories.find((c) => c.name === 'Electrónica')?.existingId).toBe('c1')
  })

  it('invierte el signo de tablas de gastos apuntadas en positivo', () => {
    const sheet: SheetGrid = {
      name: 'banco',
      rowOffset: 0,
      colOffset: 0,
      date1904: false,
      rows: [['GASTOS'], ['Fecha', 'Concepto', 'Importe'], ['01/01/2025', 'a', '10'], ['02/01/2025', 'b', '20'], ['03/01/2025', 'c', '5,5']],
    }
    const src = { fileName: 'b.csv', sheets: [sheet] }
    const plan = buildPlan(src, detectTables(sheet).map(defaultTableConfig), empty)
    expect(plan.rows.map((r) => r.amount)).toEqual([-10, -20, -5.5])
  })
})

describe('lectura de archivos', () => {
  it('lee un .xlsx real con fechas como número de serie', () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Fecha', 'Concepto', 'Categoría', 'Importe'],
      [new Date(Date.UTC(2025, 6, 3)), 'funda navaja', 'Amazon', -8.99],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Hoja1')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const src = readBuffer('t.xlsx', buf)
    const plan = buildPlan(src, src.sheets.flatMap(detectTables).map(defaultTableConfig), empty)
    expect(plan.rows).toHaveLength(1)
    expect(plan.rows[0]).toMatchObject({ date: '2025-07-03', amount: -8.99, concept: 'funda navaja' })
  })

  it('lee CSV con punto y coma, comillas y BOM', () => {
    const rows = parseDelimited('Fecha;Concepto;Importe\n01/02/2025;"Bar ""El Rincón""";-3,50\r\n')
    expect(rows).toEqual([
      ['Fecha', 'Concepto', 'Importe'],
      ['01/02/2025', 'Bar "El Rincón"', '-3,50'],
    ])
    const bytes = new TextEncoder().encode('﻿Fecha,Concepto,Importe\n2025-02-01,Café,-1.5\n')
    const src = readBuffer('x.csv', bytes.buffer as ArrayBuffer)
    expect(src.sheets[0].rows[0][0]).toBe('Fecha')
  })
})
