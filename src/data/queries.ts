import { db } from './db'

/** Consultas que leen los hooks en vivo. Están aquí para poder probarlas contra IndexedDB. */
export const queries = {
  movementsByDateDesc: () => db.movements.orderBy('date').reverse().toArray(),
  categoriesInOrder: () => db.categories.orderBy('order').toArray(),
  settings: () => db.settings.get('settings'),
  batchesNewestFirst: () => db.batches.orderBy('importedAt').reverse().toArray(),
}
