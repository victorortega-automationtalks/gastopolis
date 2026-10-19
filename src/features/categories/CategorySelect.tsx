import clsx from 'clsx'
import { Check, X } from 'lucide-react'
import { useState, type Ref } from 'react'
import { useCategories } from '../../data/hooks'
import { createCategory } from '../../data/repo'
import { KIND_LABEL } from '../../model/defaults'
import type { Kind } from '../../model/types'
import { useUI } from '../../store/ui'
import { Button } from '../../ui/components/primitives'
import { categoryLabel } from './tree'

const NEW = '__new'

/**
 * Desplegable de categorías con «＋ Nueva categoría…»: se crea ahí mismo y queda elegida, sin ir a Categorías.
 * `kinds` limita lo que se ofrece (p. ej. gasto y traspasos para un gasto); la nueva es del primero de `kinds` salvo
 * que se elija otro tipo al crearla.
 */
export function CategorySelect({
  value,
  onChange,
  kinds,
  exclude = [],
  placeholder = 'Categoría…',
  className,
  disabled,
  ref,
  extra = [],
  'aria-label': label,
}: {
  value: string
  onChange: (id: string) => void
  kinds?: Kind[]
  exclude?: string[]
  placeholder?: string
  className?: string
  disabled?: boolean
  ref?: Ref<HTMLDivElement>
  /** Opciones propias encima de la lista (p. ej. una categoría propuesta que aún no existe). */
  extra?: { value: string; label: string }[]
  'aria-label'?: string
}) {
  const categories = useCategories()
  const toast = useUI((s) => s.toast)
  const allowed = kinds ?? (['expense', 'income', 'transfer'] as Kind[])
  const options = categories.filter((c) => allowed.includes(c.kind) && !exclude.includes(c.id))
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<Kind>(allowed[0])

  const create = async () => {
    const n = name.trim()
    if (!n) return
    const id = await createCategory({ name: n, kind })
    toast(`Categoría «${n}» creada`)
    setCreating(false)
    setName('')
    onChange(id)
  }

  if (creating)
    return (
      <div ref={ref} className={clsx('flex min-w-0 items-center gap-1.5', className)}>
        <input
          autoFocus
          className="field h-9 min-w-0 flex-1"
          placeholder="Nombre de la categoría nueva"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void create()
            }
            if (e.key === 'Escape') {
              e.stopPropagation()
              setCreating(false)
            }
          }}
          aria-label="Nombre de la categoría nueva"
        />
        {allowed.length > 1 && (
          <select className="field h-9 w-auto" value={kind} onChange={(e) => setKind(e.target.value as Kind)} aria-label="Tipo de la categoría nueva">
            {allowed.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        )}
        <Button type="button" size="sm" variant="primary" disabled={!name.trim()} onClick={() => void create()} aria-label="Crear categoría">
          <Check size={14} />
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setCreating(false)} aria-label="Cancelar">
          <X size={14} />
        </Button>
      </div>
    )

  return (
    <div ref={ref} className={clsx('min-w-0', className)}>
      <select
        className="field h-9"
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => {
          if (e.target.value === NEW) {
            setKind(allowed[0])
            setCreating(true)
          } else onChange(e.target.value)
        }}
      >
        <option value="">{placeholder}</option>
        {extra.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        <option value={NEW}>＋ Nueva categoría…</option>
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {categoryLabel(c, categories)}
          </option>
        ))}
      </select>
    </div>
  )
}
