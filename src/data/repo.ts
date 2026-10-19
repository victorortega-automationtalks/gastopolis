import { paletteColor } from '../lib/color'
import { newId } from '../lib/id'
import { normalizeKey } from '../lib/text'
import { signFor } from '../model/aggregate'
import { DEFAULT_SETTINGS, guessIcon } from '../model/defaults'
import type { Backup, Category, Kind, Movement, Settings } from '../model/types'
import { categoryIdentity, type ImportPlan } from '../import/plan'
import { db } from './db'

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get('settings')) ?? DEFAULT_SETTINGS
}

export async function saveSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<void> {
  const current = await getSettings()
  await db.settings.put({ ...current, ...patch, id: 'settings' })
}

// ── Importación ────────────────────────────────────────────────────────────

export interface ImportResult {
  batchId: string
  movements: number
  categories: number
}

export async function applyImport(plan: ImportPlan): Promise<ImportResult> {
  return db.transaction('rw', db.categories, db.movements, db.batches, async () => {
    const existing = await db.categories.toArray()
    const byIdentity = new Map(existing.map((c) => [categoryIdentity(c.kind, c.name), c]))
    let order = existing.reduce((max, c) => Math.max(max, c.order), -1) + 1
    let colorIndex = existing.length
    const created: Category[] = []
    const sourceToCategory = new Map<string, Category>()

    for (const pc of plan.categories) {
      if (pc.count === 0) continue
      const identity = categoryIdentity(pc.kind, pc.name)
      let cat = byIdentity.get(identity)
      if (!cat) {
        cat = {
          id: newId(),
          name: pc.name,
          kind: pc.kind,
          parentId: null,
          color: paletteColor(colorIndex++),
          icon: guessIcon(pc.name, pc.kind),
          order: order++,
        }
        byIdentity.set(identity, cat)
        created.push(cat)
      }
      sourceToCategory.set(pc.sourceKey, cat)
    }

    const batchId = newId()
    const now = Date.now()
    const movements: Movement[] = []
    for (const r of plan.rows) {
      if (r.duplicate) continue
      const cat = sourceToCategory.get(r.categorySourceKey)
      if (!cat) continue
      movements.push({
        id: newId(),
        date: r.date,
        amount: cat.kind === r.sourceKind ? r.amount : signFor(cat.kind, r.amount),
        kind: cat.kind,
        concept: r.concept,
        conceptKey: r.conceptKey,
        categoryId: cat.id,
        tags: [],
        notes: r.notes,
        source: 'import',
        importBatchId: batchId,
        createdAt: now,
      })
    }

    await db.categories.bulkAdd(created)
    await db.movements.bulkAdd(movements)
    await db.batches.add({ id: batchId, fileName: plan.fileName, importedAt: now, count: movements.length })
    return { batchId, movements: movements.length, categories: created.length }
  })
}

export async function undoImport(batchId: string): Promise<number> {
  return db.transaction('rw', db.movements, db.batches, async () => {
    const n = await db.movements.where('importBatchId').equals(batchId).delete()
    await db.batches.delete(batchId)
    return n
  })
}

// ── Movimientos ────────────────────────────────────────────────────────────

export interface MovementInput {
  date: string
  amount: number
  concept: string
  categoryId: string
  notes?: string
  tags?: string[]
}

export async function addMovement(input: MovementInput): Promise<string> {
  const cat = await db.categories.get(input.categoryId)
  if (!cat) throw new Error('Categoría inexistente')
  const id = newId()
  await db.movements.add({
    id,
    date: input.date,
    amount: signFor(cat.kind, input.amount),
    kind: cat.kind,
    concept: input.concept.trim(),
    conceptKey: normalizeKey(input.concept),
    categoryId: cat.id,
    tags: input.tags ?? [],
    notes: input.notes?.trim() || undefined,
    source: 'manual',
    createdAt: Date.now(),
  })
  return id
}

export async function updateMovement(id: string, input: MovementInput): Promise<void> {
  const cat = await db.categories.get(input.categoryId)
  if (!cat) throw new Error('Categoría inexistente')
  await db.movements.update(id, {
    date: input.date,
    amount: signFor(cat.kind, input.amount),
    kind: cat.kind,
    concept: input.concept.trim(),
    conceptKey: normalizeKey(input.concept),
    categoryId: cat.id,
    notes: input.notes?.trim() || undefined,
    tags: input.tags ?? [],
  })
}

/** Cambia la categoría de varios movimientos; si cambia el tipo, ajusta el signo. */
export async function recategorize(ids: string[], categoryId: string): Promise<void> {
  await db.transaction('rw', db.movements, db.categories, async () => {
    const cat = await db.categories.get(categoryId)
    if (!cat) throw new Error('Categoría inexistente')
    const ms = await db.movements.bulkGet(ids)
    await db.movements.bulkPut(
      ms
        .filter((m): m is Movement => !!m)
        .map((m) => ({ ...m, categoryId, kind: cat.kind, amount: m.kind === cat.kind ? m.amount : signFor(cat.kind, m.amount) })),
    )
  })
}

export async function deleteMovements(ids: string[]): Promise<void> {
  await db.movements.bulkDelete(ids)
}

/** Vuelve a poner movimientos borrados (deshacer). */
export async function restoreMovements(ms: Movement[]): Promise<void> {
  await db.movements.bulkPut(ms)
}

const STARTER: [string, Kind][] = [
  ['Supermercado', 'expense'],
  ['Restaurantes', 'expense'],
  ['Hogar', 'expense'],
  ['Transporte', 'expense'],
  ['Ropa', 'expense'],
  ['Ocio', 'expense'],
  ['Salud', 'expense'],
  ['Suscripciones', 'expense'],
  ['Otros', 'expense'],
  ['Nómina', 'income'],
  ['Otros ingresos', 'income'],
  ['Ahorro', 'transfer'],
]

/** Categorías básicas para quien empieza sin Excel. No duplica las que ya existan. */
export async function createStarterCategories(): Promise<number> {
  const existing = new Set((await db.categories.toArray()).map((c) => categoryIdentity(c.kind, c.name)))
  let n = 0
  for (const [name, kind] of STARTER) {
    if (existing.has(categoryIdentity(kind, name))) continue
    await createCategory({ name, kind })
    n++
  }
  return n
}

// ── Categorías ─────────────────────────────────────────────────────────────

export async function createCategory(input: { name: string; kind: Kind; parentId?: string | null; color?: string; icon?: string }): Promise<string> {
  const all = await db.categories.toArray()
  const id = newId()
  await db.categories.add({
    id,
    name: input.name.trim(),
    kind: input.kind,
    parentId: input.parentId ?? null,
    color: input.color ?? paletteColor(all.length),
    icon: input.icon ?? guessIcon(input.name, input.kind),
    order: all.reduce((max, c) => Math.max(max, c.order), -1) + 1,
  })
  return id
}

export async function updateCategory(
  id: string,
  patch: Partial<Pick<Category, 'name' | 'color' | 'icon' | 'budgetMonthly' | 'parentId' | 'order'>>,
): Promise<void> {
  if (patch.parentId) {
    // Evita ciclos: el nuevo padre no puede ser la propia categoría ni una descendiente.
    const all = await db.categories.toArray()
    const byId = new Map(all.map((c) => [c.id, c]))
    for (let p: string | null = patch.parentId; p; p = byId.get(p)?.parentId ?? null) if (p === id) throw new Error('Esa jerarquía crearía un ciclo')
    if (byId.get(patch.parentId)?.kind !== byId.get(id)?.kind) throw new Error('El padre debe ser del mismo tipo')
  }
  await db.categories.update(id, patch)
}

/** Cambia el tipo de una categoría y de todos sus movimientos. Se desengancha de padre e hijos de otro tipo. */
export async function setCategoryKind(id: string, kind: Kind): Promise<void> {
  await db.transaction('rw', db.categories, db.movements, async () => {
    const cat = await db.categories.get(id)
    if (!cat || cat.kind === kind) return
    await db.categories.update(id, { kind, parentId: null })
    await db.categories.where('parentId').equals(id).modify({ parentId: null })
    await db.movements
      .where('categoryId')
      .equals(id)
      .modify((m) => {
        m.amount = signFor(kind, m.amount)
        m.kind = kind
      })
  })
}

/** Borra una categoría pasando sus movimientos a otra (fusión). Las hijas suben un nivel. */
export async function deleteCategory(id: string, reassignTo: string | null): Promise<void> {
  await db.transaction('rw', db.categories, db.movements, async () => {
    const cat = await db.categories.get(id)
    if (!cat) return
    const count = await db.movements.where('categoryId').equals(id).count()
    if (count > 0) {
      if (!reassignTo) throw new Error('Hay movimientos en esta categoría: elige a cuál pasarlos')
      const target = await db.categories.get(reassignTo)
      if (!target) throw new Error('Categoría destino inexistente')
      await db.movements
        .where('categoryId')
        .equals(id)
        .modify((m) => {
          m.categoryId = target.id
          if (m.kind !== target.kind) m.amount = signFor(target.kind, m.amount)
          m.kind = target.kind
        })
    }
    await db.categories.where('parentId').equals(id).modify({ parentId: cat.parentId })
    await db.categories.delete(id)
  })
}

// ── Copias de seguridad ────────────────────────────────────────────────────

export async function exportBackup(): Promise<Backup> {
  const [settings, categories, movements, merchants, rules, goals, batches] = await Promise.all([
    getSettings(),
    db.categories.toArray(),
    db.movements.toArray(),
    db.merchants.toArray(),
    db.rules.toArray(),
    db.goals.toArray(),
    db.batches.toArray(),
  ])
  return { app: 'gastopolis', version: 1, exportedAt: new Date().toISOString(), settings, categories, movements, merchants, rules, goals, batches }
}

export function validateBackup(data: unknown): Backup {
  const b = data as Partial<Backup>
  if (!b || b.app !== 'gastopolis' || b.version !== 1 || !Array.isArray(b.movements) || !Array.isArray(b.categories)) {
    throw new Error('No es una copia de Gastópolis válida')
  }
  const catIds = new Set(b.categories.map((c) => c.id))
  const orphan = b.movements.find((m) => !catIds.has(m.categoryId))
  if (orphan) throw new Error(`Copia corrupta: el movimiento "${orphan.concept}" apunta a una categoría que no existe`)
  return { merchants: [], rules: [], goals: [], batches: [], settings: DEFAULT_SETTINGS, ...b } as Backup
}

/** Sustituye todo por el contenido de la copia. */
export async function restoreBackup(b: Backup): Promise<void> {
  await db.transaction('rw', [db.categories, db.movements, db.merchants, db.rules, db.goals, db.batches, db.settings], async () => {
    await Promise.all([db.categories.clear(), db.movements.clear(), db.merchants.clear(), db.rules.clear(), db.goals.clear(), db.batches.clear()])
    await db.categories.bulkAdd(b.categories)
    await db.movements.bulkAdd(b.movements)
    await db.merchants.bulkAdd(b.merchants)
    await db.rules.bulkAdd(b.rules)
    await db.goals.bulkAdd(b.goals)
    await db.batches.bulkAdd(b.batches)
    await db.settings.put({ ...DEFAULT_SETTINGS, ...b.settings, id: 'settings' })
  })
}

export async function resetAll(): Promise<void> {
  await db.transaction('rw', [db.categories, db.movements, db.merchants, db.rules, db.goals, db.batches], async () => {
    await Promise.all([db.categories.clear(), db.movements.clear(), db.merchants.clear(), db.rules.clear(), db.goals.clear(), db.batches.clear()])
  })
}

/** Añade datos de ejemplo a lo que haya (normalmente, nada). */
export async function loadSample(data: { categories: Category[]; movements: Movement[] }): Promise<void> {
  await db.transaction('rw', db.categories, db.movements, async () => {
    await db.categories.bulkAdd(data.categories)
    await db.movements.bulkAdd(data.movements)
  })
}

export async function removeSample(): Promise<void> {
  await db.transaction('rw', db.categories, db.movements, async () => {
    await db.movements.filter((m) => m.source === 'sample').delete()
    const used = new Set((await db.movements.toArray()).map((m) => m.categoryId))
    await db.categories.filter((c) => c.id.startsWith('sample-') && !used.has(c.id)).delete()
  })
}

export function toCSV(movements: Movement[], categories: Category[]): string {
  const name = new Map(categories.map((c) => [c.id, c.name]))
  const kind: Record<Kind, string> = { expense: 'gasto', income: 'ingreso', transfer: 'transferencia' }
  const esc = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const lines = ['Fecha;Concepto;Categoría;Importe;Tipo;Notas']
  for (const m of [...movements].sort((a, b) => a.date.localeCompare(b.date))) {
    lines.push([m.date, esc(m.concept), esc(name.get(m.categoryId) ?? ''), m.amount.toFixed(2).replace('.', ','), kind[m.kind], esc(m.notes ?? '')].join(';'))
  }
  return '﻿' + lines.join('\n')
}
