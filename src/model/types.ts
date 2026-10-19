import type { Assumptions, Lever } from './lab'
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
  source: 'import' | 'manual' | 'sample' | 'bank'
  importBatchId?: string
  createdAt: number
  /** Cuenta a la que pertenece (efectivo, una cuenta del banco…). Sin cuenta: los de antes de que existieran. */
  accountId?: string
  /** Identificador del movimiento en el banco: evita traerlo dos veces. */
  externalId?: string
  /**
   * Solo en memoria, nunca se guarda: fecha real de un cobro que cuenta para otro mes (nómina inteligente). Entonces
   * `date` es la fecha contable. Ver `model/payday.ts`.
   */
  realDate?: ISODate
}

export type AccountKind = 'cash' | 'bank' | 'other'

/** Enlace de una cuenta con su banco a través de Enable Banking (solo lectura). */
export interface BankLink {
  provider: 'enablebanking'
  aspsp: { name: string; country: string }
  /** Id de la cuenta en la sesión actual (cambia al renovar). */
  accountUid: string
  /** Huella estable de la cuenta entre sesiones: sirve para reconocerla al renovar el permiso. */
  identificationHash?: string
  /** IBAN enmascarado para enseñarlo (ES12 •••• 3456). */
  ibanMasked?: string
  currency: string
  sessionId: string
  /** Hasta cuándo vale el permiso del banco (ISO con hora). */
  validUntil: string
  /** Última sincronización correcta (ms). */
  lastSyncAt?: number
  /** Última sincronización forzada a mano (ms): se permite una al día. */
  manualSyncAt?: number
  /** Desde qué día traer movimientos (lo anterior ya está, p. ej. importado del Excel). */
  syncFrom?: ISODate
  /** Hasta qué día (incluido) están ya traídos los movimientos. */
  syncedThrough?: ISODate
  lastError?: string
  balance?: { amount: number; date: string }
}

/** Credencial de la aplicación de Enable Banking del usuario. Solo en este dispositivo: no va en las copias. */
export interface BankSecret {
  id: 'enablebanking'
  /** Id de la aplicación (el nombre del archivo .pem). */
  appId: string
  privateKeyPem: string
  /** Dirección de vuelta registrada en el panel de Enable Banking. */
  redirectUrl: string
}

export interface Account {
  id: string
  name: string
  kind: AccountKind
  color: string
  order: number
  archived?: boolean
  bank?: BankLink
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
  /** Cuándo se hizo la última copia de seguridad (ms). */
  lastBackupAt?: number
  /** Nómina inteligente: los ingresos mensuales cuentan para el mes que pagan (activado si no se dice nada). */
  paydayShift?: boolean
  /** Cada cuántas horas se sincronizan los bancos solos (PSD2 permite hasta 4 lecturas al día sin ti delante). */
  bankSyncHours?: number
}

/** Escenario guardado del Laboratorio: palancas y supuestos con nombre. */
export interface Scenario {
  id: string
  name: string
  levers: Lever[]
  assumptions: Assumptions
  createdAt: number
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
  scenarios?: Scenario[]
  accounts?: Account[]
}
