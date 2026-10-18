import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { detectTables } from '../import/detect'
import { buildPlan, defaultTableConfig } from '../import/plan'
import type { SheetGrid } from '../import/read'
import { totals } from '../model/aggregate'
import { db } from './db'
import { queries } from './queries'
import {
  addMovement,
  applyImport,
  deleteCategory,
  exportBackup,
  loadSample,
  recategorize,
  removeSample,
  resetAll,
  restoreBackup,
  setCategoryKind,
  undoImport,
  updateCategory,
  validateBackup,
} from './repo'
import { buildSample } from './sample'

const sheet: SheetGrid = {
  name: 'Hoja',
  rowOffset: 0,
  colOffset: 0,
  date1904: false,
  rows: [
    ['GASTOS', null, null, null, null, 'INGRESOS'],
    ['Fecha', 'Concepto', 'Categoría', 'Importe', null, 'Fecha', 'Concepto', 'Categoría', 'Importe'],
    ['01/01/2025', 'Repsol', 'Gasolina', '-50', null, '01/01/2025', 'Nómina', 'Trabajo', '1500'],
    ['02/01/2025', 'Revolut', 'Cryptos', '-200', null, '05/01/2025', 'Ahorro 2024', 'Ahorro', '400'],
    ['03/01/2025', 'Repsol', 'Gasolina', '-40', null, null, null, null, null],
  ],
}
const source = { fileName: 'test.xlsx', sheets: [sheet] }

async function importOnce() {
  const existing = { movements: await db.movements.toArray(), categories: await db.categories.toArray() }
  const plan = buildPlan(source, detectTables(sheet).map(defaultTableConfig), existing)
  return applyImport(plan)
}

beforeEach(async () => {
  await resetAll()
})

describe('importación', () => {
  it('crea categorías y movimientos con el tipo correcto', async () => {
    const r = await importOnce()
    expect(r).toMatchObject({ movements: 5, categories: 4 })
    const cats = await db.categories.toArray()
    expect(cats.find((c) => c.name === 'Cryptos')?.kind).toBe('transfer')
    expect(cats.find((c) => c.name === 'Ahorro')?.kind).toBe('transfer')
    const t = totals(await db.movements.toArray())
    expect(t).toMatchObject({ income: 1500, expense: 90, transfer: 200, net: 1410 })
  })

  it('no duplica al importar dos veces el mismo archivo', async () => {
    await importOnce()
    const second = await importOnce()
    expect(second.movements).toBe(0)
    expect(await db.movements.count()).toBe(5)
  })

  it('deshace una importación', async () => {
    const r = await importOnce()
    await undoImport(r.batchId)
    expect(await db.movements.count()).toBe(0)
    expect(await db.batches.count()).toBe(0)
  })
})

describe('categorías', () => {
  it('al cambiar el tipo, los movimientos cambian de signo', async () => {
    await importOnce()
    const gasolina = (await db.categories.toArray()).find((c) => c.name === 'Gasolina')!
    await setCategoryKind(gasolina.id, 'income')
    const ms = await db.movements.where('categoryId').equals(gasolina.id).toArray()
    expect(ms.every((m) => m.kind === 'income' && m.amount > 0)).toBe(true)
  })

  it('fusiona al borrar y exige destino si hay movimientos', async () => {
    await importOnce()
    const cats = await db.categories.toArray()
    const gasolina = cats.find((c) => c.name === 'Gasolina')!
    const trabajo = cats.find((c) => c.name === 'Trabajo')!
    await expect(deleteCategory(gasolina.id, null)).rejects.toThrow()
    await deleteCategory(gasolina.id, trabajo.id)
    const moved = await db.movements.where('categoryId').equals(trabajo.id).toArray()
    expect(moved).toHaveLength(3)
    expect(moved.every((m) => m.amount > 0)).toBe(true)
  })

  it('impide ciclos y padres de otro tipo', async () => {
    const a = await db.categories.add({ id: 'a', name: 'A', kind: 'expense', parentId: null, color: '#fff', icon: 'X', order: 0 })
    await db.categories.add({ id: 'b', name: 'B', kind: 'expense', parentId: 'a', color: '#fff', icon: 'X', order: 1 })
    await db.categories.add({ id: 'c', name: 'C', kind: 'income', parentId: null, color: '#fff', icon: 'X', order: 2 })
    await expect(updateCategory(a, { parentId: 'b' })).rejects.toThrow(/ciclo/)
    await expect(updateCategory('b', { parentId: 'c' })).rejects.toThrow(/tipo/)
  })
})

describe('movimientos', () => {
  it('aplica el signo según la categoría', async () => {
    await importOnce()
    const cats = await db.categories.toArray()
    const gasolina = cats.find((c) => c.name === 'Gasolina')!
    const id = await addMovement({ date: '2025-02-01', amount: 30, concept: '  Cepsa ', categoryId: gasolina.id })
    const m = await db.movements.get(id)
    expect(m).toMatchObject({ amount: -30, kind: 'expense', concept: 'Cepsa', conceptKey: 'cepsa', source: 'manual' })
    const trabajo = cats.find((c) => c.name === 'Trabajo')!
    await recategorize([id], trabajo.id)
    expect((await db.movements.get(id))?.amount).toBe(30)
  })
})

describe('copias y ejemplo', () => {
  it('exporta y restaura una copia completa', async () => {
    await importOnce()
    const backup = await exportBackup()
    await resetAll()
    await restoreBackup(validateBackup(JSON.parse(JSON.stringify(backup))))
    expect(await db.movements.count()).toBe(5)
    expect(() => validateBackup({ app: 'otra' })).toThrow()
  })

  it('carga y retira los datos de ejemplo sin tocar los propios', async () => {
    await importOnce()
    const sample = buildSample(new Date(2025, 6, 3))
    await loadSample(sample)
    expect(await db.movements.count()).toBe(5 + sample.movements.length)
    await removeSample()
    expect(await db.movements.count()).toBe(5)
    expect((await db.categories.toArray()).some((c) => c.id.startsWith('sample-'))).toBe(false)
  })

  it('el ejemplo es determinista y no llega al futuro', () => {
    const a = buildSample(new Date(2025, 6, 3))
    const b = buildSample(new Date(2025, 6, 3))
    expect(a.movements.length).toBe(b.movements.length)
    expect(a.movements.every((m) => m.date <= '2025-07-03')).toBe(true)
    expect(a.movements.length).toBeGreaterThan(500)
  })
})

describe('consultas de los hooks', () => {
  it('todas funcionan con el esquema (índices incluidos)', async () => {
    await importOnce()
    for (const [name, q] of Object.entries(queries)) {
      await expect(q(), name).resolves.not.toThrow()
    }
    const cats = await queries.categoriesInOrder()
    expect(cats.map((c) => c.order)).toEqual([...cats.map((c) => c.order)].sort((a, b) => a - b))
  })
})
