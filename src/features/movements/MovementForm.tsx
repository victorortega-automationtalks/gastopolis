import clsx from 'clsx'
import { Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useCategories, useMovements } from '../../data/hooks'
import { addMovement, deleteMovements, restoreMovements, updateMovement } from '../../data/repo'
import { parseAmount } from '../../import/values'
import { normalizeKey } from '../../lib/text'
import { KIND_LABEL } from '../../model/defaults'
import { today } from '../../model/period'
import { KINDS, type Kind, type Movement } from '../../model/types'
import { useUI } from '../../store/ui'
import { Button, Field, Modal, Segmented } from '../../ui/components/primitives'
import { CategoryIcon } from '../../ui/icons'
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
  const toast = useUI((s) => s.toast)
  const [kind, setKind] = useState<Kind>(current?.kind ?? 'expense')
  const [date, setDate] = useState(current?.date ?? today())
  const [amount, setAmount] = useState(current ? String(current.kind === 'transfer' ? current.amount : Math.abs(current.amount)).replace('.', ',') : '')
  const [concept, setConcept] = useState(current?.concept ?? '')
  const [pickedCategory, setPickedCategory] = useState(current?.categoryId ?? '')
  const [notes, setNotes] = useState(current?.notes ?? '')
  const [error, setError] = useState<string | null>(null)

  const ofKind = useMemo(() => categories.filter((c) => c.kind === kind), [categories, kind])

  // Al escribir un concepto ya conocido se propone su última categoría, hasta que se elija otra a mano.
  const suggested = useMemo(() => {
    const key = normalizeKey(concept)
    if (!key) return ''
    return movements.find((m) => m.conceptKey === key && m.kind === kind)?.categoryId ?? ''
  }, [concept, movements, kind])
  const categoryId = pickedCategory || suggested

  const conceptOptions = useMemo(() => [...new Set(movements.filter((m) => m.kind === kind).map((m) => m.concept))].slice(0, 400), [movements, kind])

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
      toast(current ? 'Movimiento actualizado' : 'Movimiento añadido')
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
      <Field label="Concepto">
        <input className="field" list="concepts" value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Mercadona, Spotify, Nómina…" />
        <datalist id="concepts">
          {conceptOptions.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>
      <Field label="Categoría" hint={ofKind.length === 0 ? 'No hay categorías de este tipo: créalas en Categorías.' : undefined}>
        <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">
          {ofKind.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => setPickedCategory(c.id)}
              className={clsx('flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition', c.id === categoryId ? 'text-ink' : 'border-line text-ink-muted hover:text-ink')}
              style={c.id === categoryId ? { borderColor: c.color, background: c.color + '26' } : undefined}
            >
              <CategoryIcon name={c.icon} size={13} className="shrink-0" />
              {categoryLabel(c, categories)}
            </button>
          ))}
        </div>
      </Field>
      {kind === 'transfer' && <p className="text-xs text-ink-muted">En transferencias, un importe negativo aparta dinero (a ahorro o inversión) y uno positivo lo trae de vuelta.</p>}
      <Field label="Notas">
        <textarea className="field min-h-16" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  )
}
