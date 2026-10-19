import clsx from 'clsx'
import { Menu, Plus, Search, Upload, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { KIND_LABEL_PLURAL } from '../model/defaults'
import { KINDS, type Kind } from '../model/types'
import { useUI, type Route } from '../store/ui'
import { Button } from './components/primitives'
import { CURRENT_PHASE, NAV_GROUPS, navItem } from './nav'
import { PeriodPicker } from './PeriodPicker'

function Logo({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <img src="./favicon.svg" alt="" className="h-8 w-8 rounded-lg" />
      {!compact && <span className="font-display text-lg font-bold tracking-tight">Gastópolis</span>}
    </div>
  )
}

function NavButton({ route, onClick }: { route: Route; onClick?: () => void }) {
  const current = useUI((s) => s.route)
  const navigate = useUI((s) => s.navigate)
  const item = navItem(route)
  const Icon = item.icon
  const active = current === route
  return (
    <button
      onClick={() => {
        navigate(route)
        onClick?.()
      }}
      className={clsx(
        'group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition',
        active ? 'bg-gradient-to-r from-accent/20 to-accent-2/5 text-ink ring-1 ring-accent/30' : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
      )}
    >
      <Icon size={17} className={clsx(active ? 'text-accent-2' : 'text-ink-faint group-hover:text-ink-muted')} />
      <span className="flex-1 text-left">{item.label}</span>
      {item.phase > CURRENT_PHASE && <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-faint">F{item.phase}</span>}
    </button>
  )
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-5">
      {NAV_GROUPS.map((g) => (
        <div key={g.label}>
          <div className="mb-1.5 px-3 text-[11px] font-medium tracking-wider text-ink-faint uppercase">{g.label}</div>
          <div className="flex flex-col gap-0.5">
            {g.routes.map((r) => (
              <NavButton key={r} route={r} onClick={onNavigate} />
            ))}
          </div>
        </div>
      ))}
      <div className="mt-auto">
        <NavButton route="ajustes" onClick={onNavigate} />
      </div>
    </nav>
  )
}

function KindToggles() {
  const kinds = useUI((s) => s.filters.kinds)
  const setFilters = useUI((s) => s.setFilters)
  const toggle = (k: Kind) => {
    const next = kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k]
    setFilters({ kinds: next.length ? next : KINDS })
  }
  const dot: Record<Kind, string> = { expense: 'bg-expense', income: 'bg-income', transfer: 'bg-transfer' }
  return (
    <div className="flex rounded-lg border border-line bg-surface p-0.5">
      {KINDS.map((k) => (
        <button
          key={k}
          onClick={() => toggle(k)}
          className={clsx(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition',
            kinds.includes(k) ? 'bg-surface-2 text-ink' : 'text-ink-faint',
          )}
          title={KIND_LABEL_PLURAL[k]}
        >
          <span className={clsx('h-2 w-2 rounded-full transition', dot[k], !kinds.includes(k) && 'opacity-25')} />
          <span className="hidden lg:inline">{KIND_LABEL_PLURAL[k]}</span>
        </button>
      ))}
    </div>
  )
}

function SearchBox() {
  const search = useUI((s) => s.filters.search)
  const setFilters = useUI((s) => s.setFilters)
  return (
    <div className="relative min-w-0 flex-1 sm:max-w-64">
      <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint" />
      <input value={search} onChange={(e) => setFilters({ search: e.target.value })} placeholder="Buscar concepto, categoría…" className="field h-9 pl-9" />
      {search && (
        <button
          onClick={() => setFilters({ search: '' })}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-ink-faint hover:text-ink"
          aria-label="Limpiar búsqueda"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const route = useUI((s) => s.route)
  const openImport = useUI((s) => s.openImport)
  const editMovement = useUI((s) => s.editMovement)
  const item = navItem(route)
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/70 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur-xl sm:px-6">
      <div className="flex items-center gap-3">
        <button onClick={onMenu} className="-ml-1 rounded-md p-1.5 text-ink-muted hover:bg-surface-2 md:hidden" aria-label="Menú">
          <Menu size={20} />
        </button>
        <h1 className="font-display text-xl font-semibold tracking-tight md:text-2xl">{item.label}</h1>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="subtle" onClick={() => openImport(true)} title="Importar Excel o CSV">
            <Upload size={15} />
            <span className="hidden sm:inline">Importar</span>
          </Button>
          <Button variant="primary" onClick={() => editMovement('')} title="Nuevo movimiento">
            <Plus size={16} />
            <span className="hidden sm:inline">Movimiento</span>
          </Button>
        </div>
      </div>
      {item.filters && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <PeriodPicker />
          {!item.scene && <KindToggles />}
          <SearchBox />
        </div>
      )}
    </header>
  )
}

function BottomNav({ onMore }: { onMore: () => void }) {
  const current = useUI((s) => s.route)
  const navigate = useUI((s) => s.navigate)
  const items: Route[] = ['inicio', 'ciudad', 'movimientos', 'objetivos']
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-canvas/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
      {items.map((r) => {
        const it = navItem(r)
        const Icon = it.icon
        return (
          <button
            key={r}
            onClick={() => navigate(r)}
            className={clsx('flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]', current === r ? 'text-accent-2' : 'text-ink-faint')}
          >
            <Icon size={20} />
            {it.label}
          </button>
        )
      })}
      <button onClick={onMore} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] text-ink-faint">
        <Menu size={20} />
        Más
      </button>
    </nav>
  )
}

function Toasts() {
  const toasts = useUI((s) => s.toasts)
  const dismiss = useUI((s) => s.dismissToast)
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={clsx(
            'pointer-events-auto flex max-w-md items-center gap-3 rounded-xl border bg-surface-solid px-4 py-2.5 text-sm shadow-2xl',
            t.tone === 'error' ? 'border-danger/50' : t.tone === 'ok' ? 'border-income/40' : 'border-line-strong',
          )}
        >
          <span>{t.text}</span>
          {t.action && (
            <button
              className="font-semibold text-accent-2 hover:underline"
              onClick={() => {
                t.action!.run()
                dismiss(t.id)
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState(false)
  const scene = navItem(useUI((s) => s.route)).scene
  return (
    <div className="flex h-full">
      <aside className="hidden w-60 shrink-0 flex-col gap-6 border-r border-line bg-canvas-2/40 p-4 md:flex">
        <Logo />
        <NavList />
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col gap-6 border-r border-line bg-surface-solid p-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <Logo />
            <NavList onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onMenu={() => setDrawer(true)} />
        <main className={clsx('min-h-0 flex-1', scene ? 'relative overflow-hidden' : 'overflow-y-auto px-4 py-5 pb-24 sm:px-6 md:pb-8')}>{children}</main>
      </div>
      <BottomNav onMore={() => setDrawer(true)} />
      <Toasts />
    </div>
  )
}
