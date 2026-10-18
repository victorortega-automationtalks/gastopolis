import { useMemo } from 'react'
import { useCategories, useDecisions, useMovements, useSettings } from '../../data/hooks'
import { DEFAULT_SETTINGS } from '../../model/defaults'
import { dataAsOf } from '../../model/insights'
import { detectLeaks, summarizeLeaks } from '../../model/leaks'
import { today } from '../../model/period'

/** Fugas detectadas en los datos actuales, con lo ya decidido aplicado. */
export function useLeaks() {
  const { movements } = useMovements()
  const categories = useCategories()
  const settings = useSettings()
  const decisions = useDecisions()
  return useMemo(() => {
    const { asOf } = dataAsOf(movements, today())
    const leaks = detectLeaks(movements, categories, asOf, {
      antMax: settings.leakAntMax ?? DEFAULT_SETTINGS.leakAntMax!,
      dupDays: settings.leakDupDays ?? DEFAULT_SETTINGS.leakDupDays!,
    })
    return { leaks, asOf, ...summarizeLeaks(leaks, decisions) }
  }, [movements, categories, settings.leakAntMax, settings.leakDupDays, decisions])
}
