import { DEFAULT_SETTINGS } from '../model/defaults'
import { db } from './db'

/** Consultas que leen los hooks en vivo. Están aquí para poder probarlas contra IndexedDB. */
export const queries = {
  // Por clave primaria y ordenado en memoria: leer por el índice `date` hace que Dexie apunte cada clave del resultado
  // para vigilar cambios (≈300 ms con 12.000 movimientos); por clave primaria vigila un solo rango.
  movementsByDateDesc: async () => (await db.movements.toArray()).sort((a, b) => (a.date === b.date ? (a.id < b.id ? 1 : -1) : a.date < b.date ? 1 : -1)),
  categoriesInOrder: () => db.categories.orderBy('order').toArray(),
  settings: async () => ({ ...DEFAULT_SETTINGS, ...(await db.settings.get('settings')) }),
  batchesNewestFirst: () => db.batches.orderBy('importedAt').reverse().toArray(),
  rulesByPriority: () => db.rules.orderBy('priority').toArray(),
  goals: () => db.goals.toArray(),
  decisions: () => db.decisions.toArray(),
  scenarios: () => db.scenarios.orderBy('createdAt').toArray(),
  accountsInOrder: () => db.accounts.orderBy('order').toArray(),
  bankSecret: () => db.secrets.get('enablebanking'),
}
