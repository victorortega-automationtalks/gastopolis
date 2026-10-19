import Dexie, { type EntityTable } from 'dexie'
import type { Account, BankSecret, Category, Goal, ImportBatch, LeakDecision, Merchant, Movement, Rule, Scenario, Settings } from '../model/types'

export class GastopolisDB extends Dexie {
  movements!: EntityTable<Movement, 'id'>
  categories!: EntityTable<Category, 'id'>
  merchants!: EntityTable<Merchant, 'id'>
  rules!: EntityTable<Rule, 'id'>
  goals!: EntityTable<Goal, 'id'>
  batches!: EntityTable<ImportBatch, 'id'>
  settings!: EntityTable<Settings, 'id'>
  decisions!: EntityTable<LeakDecision, 'id'>
  scenarios!: EntityTable<Scenario, 'id'>
  accounts!: EntityTable<Account, 'id'>
  secrets!: EntityTable<BankSecret, 'id'>

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
    // v2: decisiones del detector de fugas. Los objetivos ganan campos, pero no índices.
    this.version(2).stores({ decisions: 'id' })
    // v3: escenarios guardados del Laboratorio.
    this.version(3).stores({ scenarios: 'id, createdAt' })
    // v4: cuentas (efectivo, bancos…) y la credencial de Enable Banking, aparte para que no viaje en las copias.
    this.version(4).stores({ accounts: 'id, order', secrets: 'id' })
  }
}

export const db = new GastopolisDB()
