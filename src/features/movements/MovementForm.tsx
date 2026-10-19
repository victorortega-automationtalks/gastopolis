import clsx from 'clsx'
import { Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useCategories, useMovements, useRules } from '../../data/hooks'
import { addMovement, deleteMovements, restoreMovements, updateMovement } from '../../data/repo'
import { parseAmount } from '../../import/values'
import { normalizeKey } from '../../lib/text'
import { KIND_LABEL } from '../../model/defaults'
import { compileRules } from '../../model/rules'
import { today } from '../../model/period'
import { KINDS, type Kind, type Movement } from '../../model/types'
import { useUI } from '../../store/ui'
import { Button, Field, Modal, Segmented } from '../../ui/components/primitives'
import { CategoryIcon } from '../../ui/icons'
import { offerRule } from '../categories/offerRule'
import { categoryLabel } from '../categories/tree'

const FORM_ID = 'movement-form'

export function MovementForm() {
  const editing = useUI((s) => s.editing)
  const editMovement = useUI((s) => s.editMovement)
  const toast = useUI((s) => s.toast)
  const { movements } = useMovements()
  const current = editing ? movements.find((m) => m.id === editing) : undefined
  const close = () => editMovement(null)

  const remove = async () => {
    if (!current) return
    const backup = current
    await deleteMovements([current.id])
    close()
    toast('Movimiento borrado', 'info', { label: 'Deshacer', run: () => void restoreMovements([backup]) })
  }

  return (
    <Modal
      open={editing !== null}
      onClose={close}
      title={current ? 'Editar movimiento' : 'Nuevo movimiento'}
      footer={
        <>
          {current && (
            <Button variant="danger" className="mr-auto" onClick={remove}>
              <Trash2 size={15} /> Borrar
            </Button>
          )}
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form={FORM_ID}>
            Guardar
          </Button>
        </>
      }
    >
      {/* key: cada apertura empieza con el estado del movimiento que se edita (o vacío). */}
      <FormBody key={editing ?? 'closed'} current={current} movements={movements} onDone={close} />
    </Modal>
  )
}

function FormBody({ current, movements, onDone }: { current?: Movement; movements: Movement[]; onDone: () => void }) {
  const categories = useCategories()
  const rules = useRules()
  const toast = useUI((s) => s.toast)
  const [kind, setKind] = useState<Kind>(current?.kind ?? 'expense')
  const [date, setDate] = useState(current?.date ?? today())
  const [amount, setAmount] = useState(current ? String(current.kind === 'transfer' ? current.amount : Math.abs(current.amount)).replace('.', ',') : '')
  const [concept, setConcept] = useState(current?.concept ?? '')
  const [pickedCategory, setPickedCategory] = useState(current?.categoryId ?? '')
  const [notes, setNotes] = useState(current?.notes ?? '')
  const [error, setError] = useState<string | null>(null)

  const ofKind = useMemo(() => categories.filter((c) => c.kind === kind), [categories, kind])

  // Al escribir un concepto se propone categoría: primero por reglas, luego la última que tuvo; hasta que se elija a mano.
  const compiled = useMemo(() => compileRules(rules, categories), [rules, categories])
  const suggested = useMemo(() => {
    const key = normalizeKey(concept)
    if (!key) return ''
    const byRule = compiled.categoryFor(concept, kind, kind === 'income' ? 1 : -1)
    if (byRule && categories.find((c) => c.id === byRule)?.kind === kind) return byRule
    return movements.find((m) => m.conceptKey === key && m.kind === kind)?.categoryId ?? ''
  }, [concept, movements, kind, compiled, categories])
  const categoryId = pickedCategory || suggested

  const conceptOptions = useMemo(() => [...new Set(movements.filter((m) => m.kind === kind).map((m) => m.concept))].slice(0, 400), [movements, kind])
  // Atajos para el alta rápida: los conceptos más usados últimamente, con su categoría.
  const recents = useMemo(() => {
    if (current) return []
    const seen = new Map<string, { concept: string; categoryId: string; n: number }>()
    for (const m of movements.slice(0, 300)) {
      if (m.kind !== kind) continue
      const r = seen.get(m.conceptKey)
      if (r) r.n++
      else seen.set(m.conceptKey, { concept: m.concept, categoryId: m.categoryId, n: 1 })
    }
    return [...seen.values()].sort((a, b) => b.n - a.n).slice(0, 8)
  }, [movements, kind, current])

  const save = async () => {
    const n = parseAmount(amount)
    if (!n) return setError('Pon un importe distinto de cero')
    if (!categoryId || !ofKind.some((c) => c.id === categoryId)) return setError('Elige una categoría')
    if (!concept.trim()) return setError('Escribe un concepto')
    // En transferencias el signo lo decide quien escribe; en el resto, la categoría.
    const input = { date, amount: kind === 'transfer' ? n : Math.abs(n), concept, categoryId, notes }
    try {
      if (current) await updateMovement(current.id, input)
      else await addMovement(input)
      const cat = categories.find((c) => c.id === categoryId)
      // Si se corrigió a mano la categoría de un concepto, ofrecer que sea siempre así.
      const recategorized = current ? current.categoryId !== categoryId : Boolean(pickedCategory && suggested && pickedCategory !== suggested)
      const message = current ? 'Movimiento actualizado' : 'Movimiento añadido'
      if (recategorized && cat && !compiled.categoryFor(concept, kind, kind === 'income' ? 1 : -1)) offerRule(toast, concept.trim(), cat.id, cat.name, message)
      else toast(message)
      onDone()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <form
      id={FORM_ID}
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <Segmented<Kind>
        value={kind}
        onChange={(k) => {
          setKind(k)
          setPickedCategory('')
        }}
        options={KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
        className="w-full [&>button]:flex-1"
      />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Importe">
          <input
            autoFocus
            inputMode="decimal"
            className={clsx('field num h-12 text-xl', kind === 'expense' ? 'text-expense' : kind === 'income' ? 'text-income' : 'text-transfer')}
            placeholder="0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Fecha">
          <input type="date" className="field h-12" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
      </div>
      {recents.length > 0 && (
        <div className="-mb-1 flex flex-wrap gap-1.5" aria-label="Recientes">
          {recents.map((r) => (
            <button
              type="button"
              key={r.concept}
              onClick={() => {
                setConcept(r.concept)
                setPickedCategory(r.categoryId)
              }}
              className={clsx(
                'rounded-full border px-2.5 py-1 text-xs transition',
                normalizeKey(concept) === normalizeKey(r.concept) ? 'border-accent-2 bg-accent-2/10 text-ink' : 'border-line text-ink-muted hover:text-ink',
              )}
            >
              {r.concept}
            </button>
          ))}
        </div>
      )}
      <Field label="Concepto">
        <input className="field" list="concepts" value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Mercadona, Spotify, Nómina…" />
        <datalist id="concepts">
          {conceptOptions.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>
      <Field group label="Categoría" hint={ofKind.length === 0 ? 'No hay categorías de este tipo: créalas en Categorías.' : undefined}>
        <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">
          {ofKind.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => setPickedCategory(c.id)}
              className={clsx(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition',
                c.id === categoryId ? 'text-ink' : 'border-line text-ink-muted hover:text-ink',
              )}
              style={c.id === categoryId ? { borderColor: c.color, background: c.color + '26' } : undefined}
            >
              <CategoryIcon name={c.icon} size={13} className="shrink-0" />
              {categoryLabel(c, categories)}
            </button>
          ))}
        </div>
      </Field>
      {kind === 'transfer' && (
        <p className="text-xs text-ink-muted">En transferencias, un importe negativo aparta dinero (a ahorro o inversión) y uno positivo lo trae de vuelta.</p>
      )}
      <Field label="Notas">
        <textarea className="field min-h-16" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  )
}
