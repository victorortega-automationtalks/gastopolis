import { shownDate } from '../../model/payday'
import clsx from 'clsx'
import { Trash2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useAccounts, useCategories, useMovements, useRules } from '../../data/hooks'
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
import { CategorySelect } from '../categories/CategorySelect'
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
          {!current && (
            <Button type="submit" form={FORM_ID} name="another" title="Guarda y deja el formulario listo para el siguiente">
              Guardar y otro
            </Button>
          )}
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
  const draftDate = useUI((s) => s.draftDate)
  const [date, setDate] = useState(current ? shownDate(current) : (draftDate ?? today()))
  const [amount, setAmount] = useState(current ? String(current.kind === 'transfer' ? current.amount : Math.abs(current.amount)).replace('.', ',') : '')
  const [concept, setConcept] = useState(current?.concept ?? '')
  const [pickedCategory, setPickedCategory] = useState(current?.categoryId ?? '')
  const [notes, setNotes] = useState(current?.notes ?? '')
  const accounts = useAccounts()
  const [accountId, setAccountId] = useState(current ? (current.accountId ?? '') : lastAccount())
  const accountOf = accounts.find((a) => a.id === accountId)
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

  // Las categorías que más usas para este tipo: las primeras a mano; el resto, en «Otra categoría…».
  const topCategories = useMemo(() => {
    const n = new Map<string, number>()
    for (const m of movements) if (m.kind === kind) n.set(m.categoryId, (n.get(m.categoryId) ?? 0) + 1)
    const ranked = ofKind.filter((c) => n.has(c.id)).sort((a, b) => (n.get(b.id) ?? 0) - (n.get(a.id) ?? 0))
    const rest = ofKind.filter((c) => !n.has(c.id))
    return [...ranked, ...rest].slice(0, 8)
  }, [movements, kind, ofKind])
  const chosen = categories.find((c) => c.id === categoryId)
  const [showNotes, setShowNotes] = useState(Boolean(current?.notes))
  const yesterday = new Date(Date.parse(today()) - 86_400_000).toISOString().slice(0, 10)
  const amountRef = useRef<HTMLInputElement>(null)

  const save = async (another: boolean) => {
    const n = parseAmount(amount)
    if (!n) return setError('Pon un importe distinto de cero')
    if (!concept.trim()) return setError('Escribe un concepto')
    if (!categoryId || !ofKind.some((c) => c.id === categoryId)) return setError('Elige una categoría')
    // En transferencias el signo lo decide quien escribe; en el resto, la categoría.
    const input = { date, amount: kind === 'transfer' ? n : Math.abs(n), concept, categoryId, notes, accountId: accountId || undefined }
    if (!accountOf?.bank) rememberAccount(accountId)
    try {
      if (current) await updateMovement(current.id, input)
      else await addMovement(input)
      const cat = categories.find((c) => c.id === categoryId)
      // Si se corrigió a mano la categoría de un concepto, ofrecer que sea siempre así.
      const recategorized = current ? current.categoryId !== categoryId : Boolean(pickedCategory && suggested && pickedCategory !== suggested)
      const message = current ? 'Movimiento actualizado' : 'Movimiento añadido'
      if (recategorized && cat && !compiled.categoryFor(concept, kind, kind === 'income' ? 1 : -1)) offerRule(toast, concept.trim(), cat.id, cat.name, message)
      else toast(message)
      if (!another) return onDone()
      // «Guardar y otro»: se queda el tipo, la fecha y la cuenta; lo demás, en blanco y el cursor en el importe.
      setAmount('')
      setConcept('')
      setPickedCategory('')
      setNotes('')
      setShowNotes(false)
      setError(null)
      amountRef.current?.focus()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const chip = (on: boolean) =>
    clsx(
      'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition',
      on ? 'border-accent-2 bg-accent-2/10 text-ink' : 'border-line text-ink-muted hover:text-ink',
    )

  return (
    <form
      id={FORM_ID}
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
        void save(submitter?.name === 'another')
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

      <Field label="Importe">
        <input
          ref={amountRef}
          autoFocus
          inputMode="decimal"
          className={clsx('field num h-14 text-3xl', kind === 'expense' ? 'text-expense' : kind === 'income' ? 'text-income' : 'text-transfer')}
          placeholder="0,00 €"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>

      <Field label="Concepto" hint={recents.length > 0 ? undefined : 'Lo que pone el ticket: Mercadona, gasolina, cena con…'}>
        <input className="field" list="concepts" value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="¿En qué ha sido?" />
        <datalist id="concepts">
          {conceptOptions.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>
      {recents.length > 0 && (
        <div className="-mt-2 flex flex-wrap gap-1.5" aria-label="Recientes">
          {recents.slice(0, 6).map((r) => (
            <button
              type="button"
              key={r.concept}
              onClick={() => {
                setConcept(r.concept)
                setPickedCategory(r.categoryId)
              }}
              className={chip(normalizeKey(concept) === normalizeKey(r.concept))}
            >
              {r.concept}
            </button>
          ))}
        </div>
      )}

      <Field
        group
        label="Categoría"
        hint={chosen && !pickedCategory && suggested ? `Propuesta por el concepto: ${chosen.name}. Pulsa otra para cambiarla.` : undefined}
      >
        <div className="flex flex-wrap gap-1.5">
          {chosen && !topCategories.some((c) => c.id === chosen.id) && (
            <span className={chip(true)} style={{ borderColor: chosen.color, background: chosen.color + '26' }}>
              <CategoryIcon name={chosen.icon} size={13} className="shrink-0" />
              {categoryLabel(chosen, categories)}
            </span>
          )}
          {topCategories.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => setPickedCategory(c.id)}
              className={chip(c.id === categoryId)}
              style={c.id === categoryId ? { borderColor: c.color, background: c.color + '26' } : undefined}
            >
              <CategoryIcon name={c.icon} size={13} className="shrink-0" />
              {categoryLabel(c, categories)}
            </button>
          ))}
        </div>
        <CategorySelect className="mt-2" value="" onChange={setPickedCategory} kinds={[kind]} placeholder="Otra categoría…" aria-label="Otra categoría" />
      </Field>
      {kind === 'transfer' && (
        <p className="text-xs text-ink-muted">En transferencias, un importe negativo aparta dinero (a ahorro o inversión) y uno positivo lo trae de vuelta.</p>
      )}

      <Field group label="Fecha">
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className={chip(date === today())} onClick={() => setDate(today())}>
            Hoy
          </button>
          <button type="button" className={chip(date === yesterday)} onClick={() => setDate(yesterday)}>
            Ayer
          </button>
          <input
            type="date"
            className="field h-8 w-auto py-0 text-xs"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            aria-label="Otra fecha"
          />
        </div>
      </Field>

      {accounts.length > 0 &&
        (accountOf?.bank ? (
          <p className="text-xs text-ink-muted">
            Viene de <b className="text-ink">{accountOf.name}</b> (sincronizado con el banco).
          </p>
        ) : (
          <Field group label="Cuenta" hint="Los bancos conectados traen sus movimientos solos: aquí, efectivo y lo que no llega del banco.">
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className={chip(!accountId)} onClick={() => setAccountId('')}>
                Sin cuenta
              </button>
              {accounts
                .filter((a) => !a.bank && !a.archived)
                .map((a) => (
                  <button type="button" key={a.id} className={chip(accountId === a.id)} onClick={() => setAccountId(a.id)}>
                    <span className="h-2 w-2 rounded-full" style={{ background: a.color }} />
                    {a.name}
                  </button>
                ))}
            </div>
          </Field>
        ))}

      {showNotes ? (
        <Field label="Nota">
          <textarea className="field min-h-16" value={notes} onChange={(e) => setNotes(e.target.value)} autoFocus={!current} />
        </Field>
      ) : (
        <button type="button" className="text-xs font-medium text-accent-2 hover:underline" onClick={() => setShowNotes(true)}>
          ＋ Añadir una nota
        </button>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  )
}

/** La última cuenta elegida al apuntar (en este dispositivo): quien apunta efectivo suele apuntar efectivo. */
function lastAccount(): string {
  try {
    return localStorage.getItem('gastopolis.lastAccount') ?? ''
  } catch {
    return ''
  }
}

function rememberAccount(id: string) {
  try {
    localStorage.setItem('gastopolis.lastAccount', id)
  } catch {
    // Sin almacenamiento: no pasa nada.
  }
}
