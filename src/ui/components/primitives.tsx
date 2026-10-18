import clsx from 'clsx'
import { X } from 'lucide-react'
import { useEffect, useId, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useSettings } from '../../data/hooks'
import { withAlpha } from '../../lib/color'
import { fmtMoney } from '../../model/format'
import type { Category, Kind } from '../../model/types'
import { CategoryIcon } from '../icons'

type Variant = 'primary' | 'ghost' | 'subtle' | 'danger'

export function Button({
  variant = 'subtle',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <button
      {...rest}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium transition select-none disabled:pointer-events-none disabled:opacity-40',
        'focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none',
        size === 'sm' && 'h-8 px-2.5 text-xs',
        size === 'md' && 'h-9 px-3.5 text-sm',
        size === 'lg' && 'h-12 px-5 text-base',
        variant === 'primary' &&
          'bg-gradient-to-r from-accent to-accent-2 text-white shadow-[0_0_24px_-6px_var(--glow)] hover:brightness-110 active:brightness-95',
        variant === 'subtle' && 'border border-line bg-surface-2 text-ink hover:border-line-strong hover:bg-surface-2/80',
        variant === 'ghost' && 'text-ink-muted hover:bg-surface-2 hover:text-ink',
        variant === 'danger' && 'border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('glass rounded-2xl', className)}>{children}</div>
}

export function Money({
  value,
  className,
  signed,
  compact,
  kind,
}: {
  value: number
  className?: string
  signed?: boolean
  compact?: boolean
  kind?: Kind | 'auto'
}) {
  const s = useSettings()
  const tone =
    kind === 'auto'
      ? value > 0
        ? 'text-income'
        : value < 0
          ? 'text-expense'
          : 'text-ink-muted'
      : kind === 'income'
        ? 'text-income'
        : kind === 'expense'
          ? 'text-expense'
          : kind === 'transfer'
            ? 'text-transfer'
            : undefined
  return <span className={clsx('num', tone, className)}>{fmtMoney(value, { currency: s.currency, locale: s.locale, signed, compact })}</span>
}

export function CategoryChip({ category, className, onClick }: { category: Category | undefined; className?: string; onClick?: () => void }) {
  const color = category?.color ?? '#888888'
  const Tag = onClick ? 'button' : 'span'
  return (
    <Tag
      onClick={onClick}
      className={clsx(
        'chip-ink inline-flex max-w-full items-center gap-1.5 truncate rounded-full border px-2 py-0.5 text-xs font-medium',
        onClick && 'cursor-pointer transition hover:brightness-125',
        className,
      )}
      style={{ '--c': color, borderColor: withAlpha(color, 0.35), background: withAlpha(color, 0.1) } as CSSProperties}
    >
      <CategoryIcon name={category?.icon ?? 'CircleDashed'} size={12} />
      <span className="truncate">{category?.name ?? 'Sin categoría'}</span>
    </Tag>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div className={clsx('inline-flex rounded-lg border border-line bg-surface p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'rounded-md px-3 py-1.5 text-xs font-medium transition',
            o.value === value ? 'bg-surface-2 text-ink shadow-sm ring-1 ring-line-strong' : 'text-ink-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className={clsx(
          'relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-line-strong bg-surface-solid shadow-2xl sm:rounded-2xl',
          wide ? 'sm:max-w-4xl' : 'sm:max-w-lg',
        )}
      >
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-ink-muted hover:bg-surface-2 hover:text-ink" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

/**
 * Etiqueta + control. Con `group`, para varios controles (chips, casillas, botones segmentados): un `<label>` solo
 * nombra a su primer control y pulsar en el texto lo activaría.
 */
export function Field({
  label,
  hint,
  children,
  className,
  group,
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
  className?: string
  group?: boolean
}) {
  const id = useId()
  const title = (
    <span id={id} className="mb-1.5 block text-xs font-medium text-ink-muted">
      {label}
    </span>
  )
  // La pista va fuera del <label> para no alargar el nombre del control (y porque puede llevar botones).
  const tip = hint && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>
  return group ? (
    <div role="group" aria-labelledby={id} className={className}>
      {title}
      {children}
      {tip}
    </div>
  ) : (
    <div className={className}>
      <label className="block">
        {title}
        {children}
      </label>
      {tip}
    </div>
  )
}

export function Stat({ label, children, sub }: { label: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium tracking-wider text-ink-faint uppercase">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold sm:text-xl">{children}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-ink-muted">{sub}</div>}
    </div>
  )
}
