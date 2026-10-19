import clsx from 'clsx'
import { ArrowDown, ArrowUp, Plus, Trash2, Wand2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useCategories, useCategoryMap, useMovements, useRules } from '../../data/hooks'
import { applyRulesToExisting, createRule, deleteRule, moveRule, updateRule } from '../../data/repo'
import { countMatches, isValidRegex, MATCH_LABEL, previewRules } from '../../model/rules'
import type { Rule } from '../../model/types'
import { useUI } from '../../store/ui'
import { Button, Card, CategoryChip } from '../../ui/components/primitives'
import { RuleSuggestions } from './RuleSuggestions'
import { CategorySelect } from './CategorySelect'

const MATCH_TYPES: Rule['matchType'][] = ['contains', 'equals', 'regex']

export function RulesPanel() {
  const rules = useRules()
  const categories = useCategories()
  const catMap = useCategoryMap()
  const { movements } = useMovements()
  const toast = useUI((s) => s.toast)
  const [matchType, setMatchType] = useState<Rule['matchType']>('contains')
  const [pattern, setPattern] = useState('')
  const [categoryId, setCategoryId] = useState('')

  const pending = useMemo(() => previewRules(rules, categories, movements), [rules, categories, movements])
  const pendingByRule = useMemo(() => {
    const out = new Map<string, number>()
    for (const r of rules) out.set(r.id, previewRules([r], categories, movements).length)
    return out
  }, [rules, categories, movements])
  const invalid = matchType === 'regex' && pattern.trim() !== '' && !isValidRegex(pattern)
  const matches = pattern.trim() && !invalid ? countMatches({ matchType, pattern }, movements) : 0

  const add = async () => {
    if (!pattern.trim() || !categoryId || invalid) return
    await createRule({ matchType, pattern, categoryId })
    setPattern('')
    toast('Regla creada')
  }
  const apply = async (ruleId?: string) => {
    const n = await applyRulesToExisting(ruleId)
    toast(n ? `${n} movimientos reclasificados` : 'Nada que cambiar')
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">
        Las reglas clasifican solas lo que importas o apuntas: «si el concepto contiene <i>repsol</i>, va a Gasolina». Se evalúan de arriba abajo y gana la
        primera que coincide.
      </p>

      <Card className="p-4">
        <form
          className="grid gap-2 sm:grid-cols-[10rem_1fr_14rem_auto]"
          onSubmit={(e) => {
            e.preventDefault()
            void add()
          }}
        >
          <select className="field" value={matchType} onChange={(e) => setMatchType(e.target.value as Rule['matchType'])} aria-label="Tipo de condición">
            {MATCH_TYPES.map((t) => (
              <option key={t} value={t}>
                Concepto {MATCH_LABEL[t]}
              </option>
            ))}
          </select>
          <input
            className={clsx('field', invalid && 'border-danger')}
            placeholder={matchType === 'regex' ? '^(lidl|mercadona)' : 'repsol'}
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            aria-label="Texto"
          />
          <CategorySelect value={categoryId} onChange={setCategoryId} placeholder="→ Categoría…" aria-label="Categoría" />
          <Button type="submit" variant="primary" disabled={!pattern.trim() || !categoryId || invalid}>
            <Plus size={15} /> Añadir
          </Button>
        </form>
        <p className={clsx('mt-2 text-xs', invalid ? 'text-danger' : 'text-ink-faint')}>
          {invalid
            ? 'La expresión regular no es válida.'
            : pattern.trim()
              ? `Coincide con ${matches} movimientos que ya tienes.`
              : 'Sin tildes ni mayúsculas: «nomina» encuentra «Nómina».'}
        </p>
      </Card>

      <RuleSuggestions
        onPick={(p) => {
          setMatchType('contains')
          setPattern(p)
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }}
      />

      {rules.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-ink-muted">
            {pending.length ? `${pending.length} movimientos cambiarían de categoría con tus reglas.` : 'Todos tus movimientos cumplen ya las reglas.'}
          </span>
          {pending.length > 0 && (
            <Button size="sm" onClick={() => apply()}>
              <Wand2 size={14} /> Aplicar todas
            </Button>
          )}
        </div>
      )}

      <Card className="divide-y divide-line">
        {rules.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-ink-muted">
            Aún no tienes reglas. También puedes crearlas desde un movimiento al cambiarle la categoría.
          </p>
        )}
        {rules.map((r, i) => {
          const cat = r.set.categoryId ? catMap.get(r.set.categoryId) : undefined
          const n = pendingByRule.get(r.id) ?? 0
          return (
            <div key={r.id} className={clsx('flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm', !r.enabled && 'opacity-50')}>
              <span className="num w-6 text-xs text-ink-faint">{i + 1}</span>
              <span className="text-ink-muted">Concepto {MATCH_LABEL[r.matchType]}</span>
              <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">{r.pattern}</code>
              <span className="text-ink-faint">→</span>
              {cat ? <CategoryChip category={cat} /> : <span className="text-xs text-danger">categoría borrada</span>}
              <span className="ml-auto flex items-center gap-1">
                {n > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => apply(r.id)} title="Aplicar a lo que ya tienes">
                    <Wand2 size={13} /> {n}
                  </Button>
                )}
                <label className="flex items-center gap-1.5 px-1 text-xs text-ink-muted">
                  <input
                    type="checkbox"
                    checked={r.enabled}
                    onChange={(e) => updateRule(r.id, { enabled: e.target.checked })}
                    className="accent-[var(--accent)]"
                  />
                  Activa
                </label>
                <button
                  onClick={() => moveRule(r.id, -1)}
                  disabled={i === 0}
                  className="rounded p-1 hover:bg-surface-2 disabled:opacity-30"
                  aria-label="Subir prioridad"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  onClick={() => moveRule(r.id, 1)}
                  disabled={i === rules.length - 1}
                  className="rounded p-1 hover:bg-surface-2 disabled:opacity-30"
                  aria-label="Bajar prioridad"
                >
                  <ArrowDown size={14} />
                </button>
                <button onClick={() => deleteRule(r.id)} className="rounded p-1 text-ink-faint hover:bg-danger/10 hover:text-danger" aria-label="Borrar regla">
                  <Trash2 size={14} />
                </button>
              </span>
            </div>
          )
        })}
      </Card>
    </div>
  )
}
