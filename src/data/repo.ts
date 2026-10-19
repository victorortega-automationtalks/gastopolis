import { paletteColor } from '../lib/color'
import { newId } from '../lib/id'
import { normalizeKey } from '../lib/text'
import { signFor } from '../model/aggregate'
import { findCategory, type AutoCategory, type AutoGroup } from '../model/autocat'
import { DEFAULT_SETTINGS, guessIcon } from '../model/defaults'
import { previewRules } from '../model/rules'
import type {
  Account,
  AccountKind,
  Backup,
  BankLink,
  BankSecret,
  Category,
  Goal,
  GoalContribution,
  Kind,
  LeakStatus,
  Movement,
  Rule,
  Scenario,
  Settings,
} from '../model/types'
import { categoryIdentity, type ImportPlan } from '../import/plan'
import { db } from './db'

/** Ajustes guardados, con los valores por defecto de los campos que se han ido añadiendo. */
export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await db.settings.get('settings')) }
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
    const byId = new Map(existing.map((c) => [c.id, c]))
    for (const r of plan.rows) {
      if (r.duplicate) continue
      const cat = (r.ruleCategoryId && byId.get(r.ruleCategoryId)) || sourceToCategory.get(r.categorySourceKey)
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
  /** Cuenta (efectivo, banco…). Sin ella, el movimiento no es de ninguna. */
  accountId?: string
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
    accountId: input.accountId || undefined,
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
    accountId: input.accountId || undefined,
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

/** Lo que se guarda de un movimiento: nunca la fecha contable de la nómina inteligente, siempre la real. */
export function toStored({ realDate, ...m }: Movement): Movement {
  return realDate ? { ...m, date: realDate } : m
}

/** Vuelve a poner movimientos borrados (deshacer). */
export async function restoreMovements(ms: Movement[]): Promise<void> {
  await db.movements.bulkPut(ms.map(toStored))
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
  const [settings, categories, movements, merchants, rules, goals, batches, decisions, scenarios] = await Promise.all([
    getSettings(),
    db.categories.toArray(),
    db.movements.toArray(),
    db.merchants.toArray(),
    db.rules.toArray(),
    db.goals.toArray(),
    db.batches.toArray(),
    db.decisions.toArray(),
    db.scenarios.toArray(),
  ])
  // La credencial de Enable Banking no viaja en las copias: se vuelve a cargar el .pem en el otro equipo.
  const accounts = await db.accounts.toArray()
  return {
    app: 'gastopolis',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
    categories,
    movements,
    merchants,
    rules,
    goals,
    batches,
    decisions,
    scenarios,
    accounts,
  }
}

export function validateBackup(data: unknown): Backup {
  const b = data as Partial<Backup>
  if (!b || b.app !== 'gastopolis' || b.version !== 1 || !Array.isArray(b.movements) || !Array.isArray(b.categories)) {
    throw new Error('No es una copia de Gastópolis válida')
  }
  const catIds = new Set(b.categories.map((c) => c.id))
  const orphan = b.movements.find((m) => !catIds.has(m.categoryId))
  if (orphan) throw new Error(`Copia corrupta: el movimiento "${orphan.concept}" apunta a una categoría que no existe`)
  return { merchants: [], rules: [], goals: [], batches: [], decisions: [], scenarios: [], settings: DEFAULT_SETTINGS, ...b } as Backup
}

/** Sustituye todo por el contenido de la copia. */
export async function restoreBackup(b: Backup): Promise<void> {
  await db.transaction(
    'rw',
    [db.categories, db.movements, db.merchants, db.rules, db.goals, db.batches, db.decisions, db.scenarios, db.accounts, db.settings],
    async () => {
      await clearAll()
      await db.categories.bulkAdd(b.categories)
      await db.movements.bulkAdd(b.movements)
      await db.merchants.bulkAdd(b.merchants)
      await db.rules.bulkAdd(b.rules)
      await db.goals.bulkAdd(b.goals)
      await db.batches.bulkAdd(b.batches)
      await db.decisions.bulkAdd(b.decisions ?? [])
      await db.scenarios.bulkAdd(b.scenarios ?? [])
      await db.accounts.bulkAdd(b.accounts ?? [])
      await db.settings.put({ ...DEFAULT_SETTINGS, ...b.settings, id: 'settings' })
    },
  )
}

function clearAll() {
  return Promise.all([db.categories, db.movements, db.merchants, db.rules, db.goals, db.batches, db.decisions, db.scenarios, db.accounts].map((t) => t.clear()))
}

/** Borra todos los datos (los ajustes se conservan). */
export async function resetAll(): Promise<void> {
  await db.transaction('rw', [db.categories, db.movements, db.merchants, db.rules, db.goals, db.batches, db.decisions, db.scenarios, db.accounts], clearAll)
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

// ── Reglas ─────────────────────────────────────────────────────────────────

export interface RuleInput {
  matchType: Rule['matchType']
  pattern: string
  categoryId: string
}

/** Crea una regla con la menor prioridad (se evalúa la última). */
export async function createRule(input: RuleInput): Promise<string> {
  const all = await db.rules.toArray()
  const id = newId()
  await db.rules.add({
    id,
    name: input.pattern.trim(),
    matchType: input.matchType,
    pattern: input.pattern.trim(),
    set: { categoryId: input.categoryId },
    priority: all.reduce((max, r) => Math.max(max, r.priority), -1) + 1,
    enabled: true,
  })
  return id
}

export async function updateRule(id: string, patch: Partial<Pick<Rule, 'matchType' | 'pattern' | 'enabled' | 'set'>>): Promise<void> {
  await db.rules.update(id, patch.pattern ? { ...patch, name: patch.pattern } : patch)
}

export async function deleteRule(id: string): Promise<void> {
  await db.rules.delete(id)
}

/** Sube o baja una regla un puesto (las primeras mandan). */
export async function moveRule(id: string, dir: -1 | 1): Promise<void> {
  await db.transaction('rw', db.rules, async () => {
    const rules = await db.rules.orderBy('priority').toArray()
    const i = rules.findIndex((r) => r.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= rules.length) return
    ;[rules[i], rules[j]] = [rules[j], rules[i]]
    await db.rules.bulkPut(rules.map((r, k) => ({ ...r, priority: k })))
  })
}

/** Aplica las reglas a los movimientos ya guardados. Devuelve cuántos cambiaron. */
export async function applyRulesToExisting(onlyRuleId?: string): Promise<number> {
  return db.transaction('rw', db.rules, db.movements, db.categories, async () => {
    const [rules, categories, movements] = await Promise.all([db.rules.toArray(), db.categories.toArray(), db.movements.toArray()])
    const changes = previewRules(onlyRuleId ? rules.filter((r) => r.id === onlyRuleId) : rules, categories, movements)
    const kindOf = new Map(categories.map((c) => [c.id, c.kind]))
    await db.movements.bulkPut(
      changes.map(({ movement: m, toCategoryId }) => {
        const kind = kindOf.get(toCategoryId)!
        return { ...m, categoryId: toCategoryId, kind, amount: m.kind === kind ? m.amount : signFor(kind, m.amount) }
      }),
    )
    return changes.length
  })
}

// ── Objetivos ──────────────────────────────────────────────────────────────

export type GoalInput = Pick<Goal, 'name' | 'icon' | 'color' | 'target' | 'deadline' | 'initial' | 'startDate' | 'linkedCategoryIds'>

/** Una categoría de ahorro solo alimenta un objetivo: al vincularla aquí se quita de los demás. */
async function unlinkFromOthers(goalId: string, categoryIds: string[]) {
  if (!categoryIds.length) return
  const others = await db.goals.filter((g) => g.id !== goalId && g.linkedCategoryIds.some((c) => categoryIds.includes(c))).toArray()
  await db.goals.bulkPut(others.map((g) => ({ ...g, linkedCategoryIds: g.linkedCategoryIds.filter((c) => !categoryIds.includes(c)) })))
}

export async function createGoal(input: GoalInput): Promise<string> {
  return db.transaction('rw', db.goals, async () => {
    const all = await db.goals.toArray()
    const id = newId()
    await unlinkFromOthers(id, input.linkedCategoryIds)
    await db.goals.add({ ...input, id, contributions: [], priority: all.length, createdAt: Date.now() })
    return id
  })
}

export async function updateGoal(id: string, patch: Partial<GoalInput & Pick<Goal, 'archived'>>): Promise<void> {
  await db.transaction('rw', db.goals, async () => {
    if (patch.linkedCategoryIds) await unlinkFromOthers(id, patch.linkedCategoryIds)
    await db.goals.update(id, patch)
  })
}

export async function deleteGoal(id: string): Promise<void> {
  await db.goals.delete(id)
}

export async function addContribution(goalId: string, c: Omit<GoalContribution, 'id'>): Promise<void> {
  const g = await db.goals.get(goalId)
  if (!g) throw new Error('Objetivo inexistente')
  await db.goals.update(goalId, { contributions: [...g.contributions, { ...c, id: newId() }] })
}

export async function removeContribution(goalId: string, contributionId: string): Promise<void> {
  const g = await db.goals.get(goalId)
  if (!g) return
  await db.goals.update(goalId, { contributions: g.contributions.filter((c) => c.id !== contributionId) })
}

// ── Fugas ──────────────────────────────────────────────────────────────────

export async function decideLeak(id: string, status: LeakStatus, yearlyCost: number): Promise<void> {
  await db.decisions.put({ id, status, yearlyCost, decidedAt: Date.now() })
}

export async function undecideLeak(id: string): Promise<void> {
  await db.decisions.delete(id)
}

// ── Laboratorio ────────────────────────────────────────────────────────────

/** Guarda un escenario (nuevo si no trae id). Devuelve su id. */
export async function saveScenario(s: Omit<Scenario, 'id' | 'createdAt'> & { id?: string }): Promise<string> {
  const id = s.id ?? newId()
  const prev = s.id ? await db.scenarios.get(s.id) : undefined
  await db.scenarios.put({ ...s, id, name: s.name.trim() || 'Escenario', createdAt: prev?.createdAt ?? Date.now() })
  return id
}

export async function deleteScenario(id: string): Promise<void> {
  await db.scenarios.delete(id)
}

// ── Cuentas ────────────────────────────────────────────────────────────────

const ACCOUNT_COLORS: Record<AccountKind, string> = { cash: '#16a34a', bank: '#2563eb', other: '#7c3aed' }

export async function createAccount(input: { name: string; kind: AccountKind; color?: string; bank?: BankLink }): Promise<string> {
  const id = newId()
  const order = (await db.accounts.count()) + 1
  await db.accounts.add({
    id,
    name: input.name.trim() || 'Cuenta',
    kind: input.kind,
    color: input.color ?? ACCOUNT_COLORS[input.kind],
    order,
    bank: input.bank,
  })
  return id
}

export async function updateAccount(id: string, patch: Partial<Omit<Account, 'id'>>): Promise<void> {
  await db.accounts.update(id, patch)
}

/** Cambia solo el enlace con el banco (estado de la sincronización, sesión renovada…). */
export async function updateBankLink(id: string, patch: Partial<BankLink>): Promise<void> {
  await db.transaction('rw', db.accounts, async () => {
    const a = await db.accounts.get(id)
    if (a?.bank) await db.accounts.update(id, { bank: { ...a.bank, ...patch } })
  })
}

/**
 * Borra una cuenta. Sus movimientos se quedan (sin cuenta) salvo que se pida borrarlos: es lo que se espera al
 * desconectar un banco del que no quieres nada.
 */
export async function deleteAccount(id: string, withMovements = false): Promise<void> {
  await db.transaction('rw', db.accounts, db.movements, async () => {
    if (withMovements) await db.movements.filter((m) => m.accountId === id).delete()
    else await db.movements.filter((m) => m.accountId === id).modify((m) => void delete m.accountId)
    await db.accounts.delete(id)
  })
}

export async function saveBankSecret(secret: Omit<BankSecret, 'id'>): Promise<void> {
  await db.secrets.put({ ...secret, id: 'enablebanking' })
}

export async function deleteBankSecret(): Promise<void> {
  await db.secrets.delete('enablebanking')
}

/** Busca una categoría por nombre y tipo, o la crea: «Sin clasificar», «Traspasos entre mis cuentas»… */
async function ensureCategory(name: string, kind: Kind): Promise<string> {
  const key = normalizeKey(name)
  const found = (await db.categories.toArray()).find((c) => c.kind === kind && normalizeKey(c.name) === key)
  if (found) return found.id
  return createCategory({ name, kind })
}

/** La categoría de una propuesta automática: la que ya tengas con ese nombre (o un sinónimo) o una nueva. */
export async function ensureAutoCategory(auto: AutoCategory): Promise<string> {
  return findCategory(auto, await db.categories.toArray()) ?? createCategory({ name: auto.name, kind: auto.kind })
}

/** Aplica lo elegido de «Asignar automáticamente»: crea las categorías que falten y mueve cada grupo a la suya. */
export async function applyAutoAssign(groups: Pick<AutoGroup, 'auto' | 'ids'>[]): Promise<number> {
  let n = 0
  for (const g of groups) {
    await recategorize(g.ids, await ensureAutoCategory(g.auto))
    n += g.ids.length
  }
  return n
}

export const BANK_CATEGORIES = {
  expense: ['Sin clasificar', 'expense'],
  income: ['Otros ingresos', 'income'],
  transfer: ['Traspasos entre mis cuentas', 'transfer'],
} as const

/** Ids de las categorías de reserva que ya existan («Sin clasificar», «Otros ingresos»): lo que aún está por clasificar. */
export function reserveCategoryIds(categories: Pick<Category, 'id' | 'name' | 'kind'>[]): string[] {
  return [BANK_CATEGORIES.expense, BANK_CATEGORIES.income]
    .map(([name, kind]) => categories.find((c) => c.kind === kind && normalizeKey(c.name) === normalizeKey(name))?.id)
    .filter((id): id is string => !!id)
}

/** Las categorías de reserva de la sincronización (se crean la primera vez). */
export async function bankFallbacks(): Promise<{ expense: string; income: string; transfer: string }> {
  return {
    expense: await ensureCategory(...BANK_CATEGORIES.expense),
    income: await ensureCategory(...BANK_CATEGORIES.income),
    transfer: await ensureCategory(...BANK_CATEGORIES.transfer),
  }
}

/**
 * Aplica una sincronización de una cuenta, todo o nada: movimientos nuevos, los que ya estaban y resultan ser estos
 * del banco, los traspasos entre cuentas propias y el estado de la cuenta.
 */
export async function applyBankSync(
  accountId: string,
  plan: { added: Movement[]; linked: { id: string; externalId: string }[] },
  transfers: { pairs: [string, string][]; categoryId: string },
  link: Partial<BankLink>,
): Promise<void> {
  await db.transaction('rw', db.movements, db.accounts, async () => {
    if (plan.added.length) await db.movements.bulkAdd(plan.added.map((m) => ({ ...m, id: m.id || newId() })))
    for (const l of plan.linked) await db.movements.update(l.id, { accountId, externalId: l.externalId })
    const ids = transfers.pairs.flat()
    if (ids.length) {
      const ms = (await db.movements.bulkGet(ids)).filter((m): m is Movement => !!m)
      // Traspaso: conserva el signo de cada lado (sale de una, entra en otra).
      await db.movements.bulkPut(ms.map((m) => ({ ...m, categoryId: transfers.categoryId, kind: 'transfer' as const })))
    }
    const a = await db.accounts.get(accountId)
    if (a?.bank) await db.accounts.update(accountId, { bank: { ...a.bank, ...link } })
  })
}
