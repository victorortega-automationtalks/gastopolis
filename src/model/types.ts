/** Naturaleza de un movimiento. Las transferencias mueven dinero entre bolsillos propios (ahorro, inversión). */
export type Kind = 'expense' | 'income' | 'transfer'

export const KINDS: Kind[] = ['expense', 'income', 'transfer']

/** Fecha local sin hora, `yyyy-mm-dd`. Se compara como texto. */
export type ISODate = string

export interface Movement {
  id: string
  date: ISODate
  /** Con signo: negativo sale del bolsillo disponible, positivo entra. */
  amount: number
  /** Copia de `Category.kind`; se mantiene sincronizada para poder indexar. */
  kind: Kind
  /** Texto tal y como se escribió (recortado). */
  concept: string
  /** Concepto normalizado para agrupar: minúsculas, sin tildes ni espacios dobles. */
  conceptKey: string
  categoryId: string
  merchantId?: string
  tags: string[]
  notes?: string
  source: 'import' | 'manual' | 'sample'
  importBatchId?: string
  createdAt: number
}

export interface Category {
  id: string
  name: string
  kind: Kind
  parentId: string | null
  color: string
  icon: string
  budgetMonthly?: number
  order: number
}

export interface Merchant {
  id: string
  name: string
  aliases: string[]
}

export interface Rule {
  id: string
  name: string
  matchType: 'contains' | 'equals' | 'regex'
  pattern: string
  set: { categoryId?: string; merchantId?: string }
  priority: number
  enabled: boolean
}

export interface Goal {
  id: string
  name: string
  icon: string
  color: string
  target: number
  deadline?: ISODate
  priority: number
  createdAt: number
}

export interface ImportBatch {
  id: string
  fileName: string
  importedAt: number
  count: number
}

export type ThemeName = 'neon' | 'polar' | 'system'
export type Quality = 'auto' | 'high' | 'low'

export interface Settings {
  id: 'settings'
  currency: string
  locale: string
  /** Mes (1–12) en el que empieza el año fiscal/personal. */
  fiscalYearStart: number
  theme: ThemeName
  quality: Quality
}

export interface Backup {
  app: 'gastopolis'
  version: 1
  exportedAt: string
  settings: Settings
  categories: Category[]
  movements: Movement[]
  merchants: Merchant[]
  rules: Rule[]
  goals: Goal[]
  batches: ImportBatch[]
}
