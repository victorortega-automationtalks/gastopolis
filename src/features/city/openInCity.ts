import { useCallback } from 'react'
import { useCategories } from '../../data/hooks'
import { DRILL_PRESETS } from '../../model/hierarchy'
import type { Kind } from '../../model/types'
import { useCity } from '../../scenes/city/store'
import { useUI } from '../../store/ui'

/**
 * Abre la Ciudad dentro de una categoría y, si se indica, limitada a un mes. Lo usan las otras escenas para que un
 * clic en un pico o en una franja lleve al detalle.
 */
export function useOpenInCity() {
  const categories = useCategories()
  const setFilters = useUI((s) => s.setFilters)
  const navigate = useUI((s) => s.navigate)
  const city = useCity()

  return useCallback(
    (categoryId: string, kind: Kind, month?: string) => {
      if (month) {
        const [y, m] = month.split('-').map(Number)
        const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
        setFilters({ period: { preset: 'custom', from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` } })
      }
      // La ruta de la Ciudad son ids anidados: root/c:padre/c:hija.
      const byId = new Map(categories.map((c) => [c.id, c]))
      const chain: string[] = []
      for (let c = byId.get(categoryId); c && chain.length < 20; c = c.parentId ? byId.get(c.parentId) : undefined) chain.unshift(c.id)
      const path: string[] = []
      let id = 'root'
      for (const c of chain) path.push((id = `${id}/c:${c}`))
      const preset = DRILL_PRESETS.find((p) => p.id === city.preset)?.dims[0] === 'category' ? city.preset : 'cat-concept'
      city.setPrefs({ kind, preset })
      city.setPath(path)
      navigate('ciudad')
    },
    [categories, city, setFilters, navigate],
  )
}
