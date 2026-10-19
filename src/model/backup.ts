const DAY = 86_400_000

/** Movimientos propios a partir de los cuales perderlos ya duele. */
export const BACKUP_MIN_MOVEMENTS = 20
export const BACKUP_EVERY_DAYS = 30

/**
 * ¿Toca recordar la copia? Solo con datos propios (los de ejemplo no cuentan) y si nunca se hizo o fue hace más de
 * un mes. `days` es null si nunca se hizo.
 */
export function backupDue(lastBackupAt: number | undefined, ownMovements: number, now: number): { days: number | null } | null {
  if (ownMovements < BACKUP_MIN_MOVEMENTS) return null
  if (lastBackupAt == null) return { days: null }
  const days = Math.floor((now - lastBackupAt) / DAY)
  return days > BACKUP_EVERY_DAYS ? { days } : null
}
