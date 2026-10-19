import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { detectTables } from '../import/detect'
import { buildPlan, defaultTableConfig } from '../import/plan'
import type { SheetGrid } from '../import/read'
import { totals } from '../model/aggregate'
import { db, GastopolisDB } from './db'
import { queries } from './queries'
import Dexie from 'dexie'
import {
  addContribution,
  addMovement,
  applyImport,
  applyRulesToExisting,
  createGoal,
  createRule,
  decideLeak,
  getSettings,
  moveRule,
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

describe('reglas en el repositorio', () => {
  it('se aplican al importar y a lo ya guardado', async () => {
    await importOnce()
    const cats = await db.categories.toArray()
    const trabajo = cats.find((c) => c.name === 'Trabajo')!
    const cryptos = cats.find((c) => c.name === 'Cryptos')!
    // Una regla que lleva «Repsol» a Cryptos (transferencia): cambia el tipo y conserva el signo.
    await createRule({ matchType: 'contains', pattern: 'repsol', categoryId: cryptos.id })
    expect(await applyRulesToExisting()).toBe(2)
    const repsol = await db.movements.filter((m) => m.concept === 'Repsol').toArray()
    expect(repsol.every((m) => m.categoryId === cryptos.id && m.kind === 'transfer' && m.amount < 0)).toBe(true)
    // Una regla de gasto a ingreso no se aplica.
    await createRule({ matchType: 'equals', pattern: 'revolut', categoryId: trabajo.id })
    expect(await applyRulesToExisting()).toBe(0)
  })

  it('el plan de importación usa las reglas y no crea categorías vacías', async () => {
    await importOnce()
    await resetAll()
    await db.categories.add({ id: 'gas', name: 'Combustible', kind: 'expense', parentId: null, color: '#fff', icon: 'Fuel', order: 0 })
    await createRule({ matchType: 'contains', pattern: 'repsol', categoryId: 'gas' })
    const existing = { movements: [], categories: await db.categories.toArray(), rules: await db.rules.toArray() }
    const plan = buildPlan(source, detectTables(sheet).map(defaultTableConfig), existing)
    expect(plan.stats.ruled).toBe(2)
    expect(plan.categories.find((c) => c.name === 'Gasolina')?.count).toBe(0)
    const r = await applyImport(plan)
    expect(await db.movements.where('categoryId').equals('gas').count()).toBe(2)
    expect((await db.categories.toArray()).some((c) => c.name === 'Gasolina')).toBe(false)
    expect(r.movements).toBe(5)
  })

  it('reordena por prioridad', async () => {
    await db.categories.add({ id: 'a', name: 'A', kind: 'expense', parentId: null, color: '#fff', icon: 'X', order: 0 })
    const r1 = await createRule({ matchType: 'contains', pattern: 'x', categoryId: 'a' })
    const r2 = await createRule({ matchType: 'contains', pattern: 'y', categoryId: 'a' })
    await moveRule(r2, -1)
    expect((await queries.rulesByPriority()).map((r) => r.id)).toEqual([r2, r1])
  })
})

describe('objetivos y fugas en el repositorio', () => {
  it('una categoría de ahorro solo alimenta un objetivo', async () => {
    const base = { icon: 'House', color: '#fff', target: 1000, initial: 0, startDate: '2025-01-01' }
    const a = await createGoal({ ...base, name: 'Casa', linkedCategoryIds: ['ahorro'] })
    const b = await createGoal({ ...base, name: 'Coche', linkedCategoryIds: ['ahorro', 'otro'] })
    expect((await db.goals.get(a))?.linkedCategoryIds).toEqual([])
    expect((await db.goals.get(b))?.linkedCategoryIds).toEqual(['ahorro', 'otro'])
    await addContribution(b, { date: '2025-02-01', amount: 50 })
    expect((await db.goals.get(b))?.contributions).toHaveLength(1)
  })

  it('las decisiones viajan en la copia y se borran con todo', async () => {
    await decideLeak('fees', 'kept', 72)
    const backup = await exportBackup()
    expect(backup.decisions).toHaveLength(1)
    await resetAll()
    expect(await db.decisions.count()).toBe(0)
    await restoreBackup(validateBackup(JSON.parse(JSON.stringify(backup))))
    expect(await db.decisions.count()).toBe(1)
    // Copias antiguas sin decisiones también valen.
    const { decisions: _omit, ...old } = backup
    void _omit
    expect(validateBackup(old).decisions).toEqual([])
  })

  it('los ajustes guardados antes reciben los valores nuevos por defecto', async () => {
    await db.settings.put({ id: 'settings', currency: 'USD', locale: 'es-ES', fiscalYearStart: 1, theme: 'neon', quality: 'auto' })
    expect(await getSettings()).toMatchObject({ currency: 'USD', leakAntMax: 5, leakDupDays: 2 })
    expect(await queries.settings()).toMatchObject({ leakAntMax: 5 })
  })
})

describe('migración de la base de datos', () => {
  it('una base v1 abre en v2 conservando los datos', async () => {
    const name = 'mig-' + Math.random()
    const v1 = new Dexie(name)
    v1.version(1).stores({
      movements: 'id, date, kind, categoryId, conceptKey, importBatchId',
      categories: 'id, kind, parentId, order',
      merchants: 'id',
      rules: 'id, priority',
      goals: 'id',
      batches: 'id, importedAt',
      settings: 'id',
    })
    await v1.table('categories').add({ id: 'c', name: 'C', kind: 'expense', parentId: null, color: '#fff', icon: 'X', order: 0 })
    v1.close()
    const v2 = new GastopolisDB(name)
    expect(await v2.categories.count()).toBe(1)
    await v2.decisions.add({ id: 'x', status: 'ignored', decidedAt: 0, yearlyCost: 0 })
    expect(await v2.decisions.count()).toBe(1)
    v2.close()
  })
})
