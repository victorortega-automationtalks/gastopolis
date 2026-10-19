import Dexie, { type EntityTable } from 'dexie'
import type { Category, Goal, ImportBatch, Merchant, Movement, Rule, Settings } from '../model/types'

export class GastopolisDB extends Dexie {
  movements!: EntityTable<Movement, 'id'>
  categories!: EntityTable<Category, 'id'>
  merchants!: EntityTable<Merchant, 'id'>
  rules!: EntityTable<Rule, 'id'>
  goals!: EntityTable<Goal, 'id'>
  batches!: EntityTable<ImportBatch, 'id'>
  settings!: EntityTable<Settings, 'id'>

  constructor(name = 'gastopolis') {
    super(name)
    this.version(1).stores({
      movements: 'id, date, kind, categoryId, conceptKey, importBatchId',
      categories: 'id, kind, parentId, order',
      merchants: 'id',
      rules: 'id, priority',
      goals: 'id',
      batches: 'id, importedAt',
      settings: 'id',
    })
  }
}

export const db = new GastopolisDB()
