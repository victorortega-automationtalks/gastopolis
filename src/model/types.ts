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

export interface GoalContribution {
  id: string
  date: ISODate
  /** Positivo = aportación; negativo = retirada. */
  amount: number
  note?: string
}

export interface Goal {
  id: string
  name: string
  icon: string
  color: string
  target: number
  deadline?: ISODate
  /** Lo que ya había ahorrado al crear el objetivo. */
  initial: number
  /** Desde cuándo cuentan las transferencias de las categorías vinculadas. */
  startDate: ISODate
  /**
   * Categorías de transferencia cuyo dinero apartado va a este objetivo (p. ej. «Ahorro vivienda»).
   * Una categoría solo puede alimentar un objetivo.
   */
  linkedCategoryIds: string[]
  /** Aportaciones apuntadas a mano. */
  contributions: GoalContribution[]
  priority: number
  createdAt: number
  archived?: boolean
}

export type LeakStatus = 'kept' | 'cancel' | 'ignored'

/** Lo que el usuario decidió sobre una fuga detectada. El id es el de la fuga (estable entre análisis). */
export interface LeakDecision {
  id: string
  status: LeakStatus
  decidedAt: number
  /** Coste anual que tenía al decidir (para el «ahorrarías» de lo marcado para cancelar). */
  yearlyCost: number
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
  /** Detector de fugas: importe máximo de un «gasto hormiga». */
  leakAntMax?: number
  /** Detector de fugas: días entre dos cargos iguales para considerarlos duplicados. */
  leakDupDays?: number
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
  decisions?: LeakDecision[]
}
