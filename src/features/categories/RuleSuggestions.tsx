import { Lightbulb, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useCategories, useMovements, useRules } from '../../data/hooks'
import { applyRulesToExisting, createRule, ensureAutoCategory, reserveCategoryIds } from '../../data/repo'
import { suggestRules, type RuleSuggestion } from '../../model/ruleSuggest'
import { useUI } from '../../store/ui'
import { Button, Card, Money } from '../../ui/components/primitives'
import { categoryLabel } from './tree'

const NEW = 'new'

/**
 * Sugerencias para crear reglas: los conceptos que más se repiten y ninguna regla cubre todavía, con la categoría que
 * suelen tener (o la que propone la clasificación automática). Crear una la aplica también a lo que ya tienes.
 */
export function RuleSuggestions({ onPick }: { onPick: (pattern: string) => void }) {
  const { movements } = useMovements()
  const rules = useRules()
  const categories = useCategories()
  const [all, setAll] = useState(false)
  const suggestions = useMemo(() => suggestRules(movements, rules, categories, reserveCategoryIds(categories), { limit: 30 }), [movements, rules, categories])
  if (!suggestions.length || !categories.length) return null
  const shown = all ? suggestions : suggestions.slice(0, 6)
  return (
    <Card className="p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Lightbulb size={15} className="text-warn" /> Conceptos que más se repiten sin regla
      </h3>
      <p className="mt-1 text-xs text-ink-muted">
        Con una regla, los que ya tienes y los que lleguen después irán siempre a la misma categoría. Pulsa el texto para afinarlo en el formulario.
      </p>
      <div className="mt-3 divide-y divide-line">
        {shown.map((s) => (
          <SuggestionRow key={`${s.kind}|${s.pattern}`} s={s} onPick={onPick} />
        ))}
      </div>
      {suggestions.length > shown.length && (
        <Button size="sm" variant="ghost" className="mt-2" onClick={() => setAll(true)}>
          Ver {suggestions.length - shown.length} más
        </Button>
      )}
    </Card>
  )
}

function SuggestionRow({ s, onPick }: { s: RuleSuggestion; onPick: (pattern: string) => void }) {
  const categories = useCategories()
  const toast = useUI((t) => t.toast)
  // Categorías que encajan con el sentido del dinero (o traspasos), como al aplicar una regla.
  const options = categories.filter((c) => c.kind === s.kind || c.kind === 'transfer')
  // Lo propuesto se recalcula al cargar o cambiar las categorías; solo se guarda lo que elijas tú.
  const [picked, setPicked] = useState<string>()
  const proposed = s.categoryId ?? (s.newCategory ? NEW : '')
  const choice = picked !== undefined && (picked === NEW ? !!s.newCategory : options.some((c) => c.id === picked)) ? picked : proposed
  const [busy, setBusy] = useState(false)
  const create = async () => {
    setBusy(true)
    try {
      const categoryId = choice === NEW ? s.newCategory && (await ensureAutoCategory(s.newCategory)) : choice
      if (!categoryId) return
      const id = await createRule({ matchType: 'contains', pattern: s.pattern, categoryId })
      const n = await applyRulesToExisting(id)
      toast(n ? `Regla «${s.pattern}» creada · ${n} movimientos reclasificados` : `Regla «${s.pattern}» creada`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 text-sm">
      <div className="min-w-0 flex-1 basis-56">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <button
            className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-ink hover:ring-1 hover:ring-line-strong"
            onClick={() => onPick(s.pattern)}
          >
            {s.pattern}
          </button>
          <span className="text-xs text-ink-muted">
            {s.count} {s.kind === 'income' ? 'ingresos' : 'gastos'} · <Money value={s.total} className="text-xs" />
          </span>
        </div>
        <div className="mt-0.5 truncate text-xs text-ink-faint">{s.samples.join(' · ')}</div>
      </div>
      <select className="field w-full sm:w-56" value={choice} onChange={(e) => setPicked(e.target.value)} aria-label={`Categoría para «${s.pattern}»`}>
        <option value="">→ Categoría…</option>
        {s.newCategory && <option value={NEW}>＋ {s.newCategory.name} (nueva)</option>}
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {categoryLabel(c, categories)}
          </option>
        ))}
      </select>
      <Button size="sm" variant="primary" disabled={!choice || busy} onClick={() => void create()}>
        <Plus size={14} /> Crear regla
      </Button>
    </div>
  )
}
