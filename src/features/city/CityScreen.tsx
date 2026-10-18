import clsx from 'clsx'
import { ChevronRight, ChevronUp, Crosshair, Home, SlidersHorizontal } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCategories, useMovements, useSettings } from '../../data/hooks'
import { applyFilters } from '../../model/aggregate'
import { KIND_LABEL_PLURAL } from '../../model/defaults'
import { fmtMoney } from '../../model/format'
import { buildHierarchy, DRILL_PRESETS, findById, resolvePath, type CityNode } from '../../model/hierarchy'
import { today } from '../../model/period'
import { KINDS, type Kind } from '../../model/types'
import { useSceneColors, useQuality } from '../../scenes/common'
import { COLOR_LABEL, HEIGHT_LABEL, layoutCity, type ColorBy, type HeightBy } from '../../scenes/city/layout'
import { useCity } from '../../scenes/city/store'
import { useUI } from '../../store/ui'
import { Button, Segmented } from '../../ui/components/primitives'
import { CityPanel } from './CityPanel'

// three.js y compañía solo se descargan al abrir una escena.
const CityCanvas = lazy(() => import('../../scenes/city/CityCanvas').then((m) => ({ default: m.CityCanvas })))

export function CityScreen() {
  const { movements } = useMovements()
  const categories = useCategories()
  const settings = useSettings()
  const filters = useUI((s) => s.filters)
  const resetFilters = useUI((s) => s.resetFilters)
  const editMovement = useUI((s) => s.editMovement)
  const modalOpen = useUI((s) => s.editing !== null || s.importOpen)
  const city = useCity()
  const quality = useQuality()
  const colors = useSceneColors()
  const [recenter, setRecenter] = useState(0)
  const [sheet, setSheet] = useState(false)

  const preset = DRILL_PRESETS.find((p) => p.id === city.preset) ?? DRILL_PRESETS[0]
  const scoped = useMemo(
    () => applyFilters(movements, { ...filters, kinds: [city.kind] }, categories, today(), settings.fiscalYearStart),
    [movements, filters, city.kind, categories, settings.fiscalYearStart],
  )
  const root = useMemo(() => buildHierarchy(scoped, categories, preset.dims, KIND_LABEL_PLURAL[city.kind]), [scoped, categories, preset, city.kind])
  const trail = useMemo(() => resolvePath(root, city.path), [root, city.path])
  const view = trail[trail.length - 1]
  const layout = useMemo(
    () => layoutCity(view, { depth: city.depth, heightBy: city.heightBy, colorBy: city.colorBy }),
    [view, city.depth, city.heightBy, city.colorBy],
  )
  const selected = city.selectedId ? findById(view, city.selectedId) : null
  const panelNode = selected ?? view
  const panelParent = selected ? (findParent(view, selected.id) ?? view) : (trail[trail.length - 2] ?? null)

  const enter = useCallback(
    (node: CityNode) => {
      if (!node.children?.length) {
        if (node.movement) editMovement(node.movement.id)
        return
      }
      // La ruta hasta el nodo: puede estar dos niveles por debajo de la vista (edificio dentro de distrito).
      const chain: string[] = []
      for (let n: CityNode | null = node; n && n.id !== view.id; n = findParent(view, n.id)) chain.unshift(n.id)
      city.setPath([...trail.slice(1).map((n) => n.id), ...chain])
    },
    [city, trail, view, editMovement],
  )
  const up = useCallback(() => city.setPath(trail.slice(1, -1).map((n) => n.id)), [city, trail])

  const depth = trail.length
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modalOpen || (e.target as HTMLElement).closest('input,select,textarea')) return
      if ((e.key === 'Escape' || e.key === 'Backspace') && depth > 1) {
        e.preventDefault()
        up()
      } else if (e.key === 'Enter' && selected) enter(selected)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modalOpen, up, enter, selected, depth])

  const empty = scoped.length === 0

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {!empty && (
          // En móvil el lienzo acaba encima de la hoja inferior plegada (y de la barra de navegación).
          <div className="absolute inset-x-0 top-0 bottom-[8.5rem] md:bottom-[4.5rem] lg:bottom-0">
            <Suspense fallback={<SceneLoading />}>
              <CityCanvas
                layout={layout}
                selectedId={city.selectedId}
                hoveredId={city.hoveredId}
                quality={quality}
                colors={colors}
                currency={settings.currency}
                locale={settings.locale}
                frameKey={`${view.id}|${recenter}|${city.depth}`}
                onHover={city.hover}
                onSelect={(n) => city.select(n?.id ?? null)}
                onEnter={enter}
              />
            </Suspense>
          </div>
        )}

        {/* Barra superior sobre el lienzo */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start gap-2 p-3">
          <nav className="glass pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl px-1.5 py-1 text-sm">
            {trail.map((n, i) => (
              <span key={n.id} className="flex items-center">
                {i > 0 && <ChevronRight size={14} className="mx-0.5 shrink-0 text-ink-faint" />}
                <button
                  onClick={() => city.setPath(trail.slice(1, i + 1).map((t) => t.id))}
                  className={clsx(
                    'flex items-center gap-1.5 rounded-md px-2 py-1 whitespace-nowrap transition',
                    i === trail.length - 1 ? 'font-semibold text-ink' : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
                  )}
                >
                  {i === 0 ? <Home size={14} /> : <span className="h-2 w-2 rounded-full" style={{ background: n.color }} />}
                  {n.label}
                </button>
              </span>
            ))}
            <span className="num ml-2 pr-2 text-xs whitespace-nowrap text-ink-muted">
              {fmtMoney(view.value, { currency: settings.currency, locale: settings.locale })}
            </span>
          </nav>
          <div className="pointer-events-auto ml-auto flex items-center gap-2">
            <Segmented<Kind>
              value={city.kind}
              onChange={(kind) => city.setPrefs({ kind })}
              options={KINDS.map((k) => ({ value: k, label: KIND_LABEL_PLURAL[k] }))}
              className="glass"
            />
            <ViewOptions />
            <Button variant="subtle" className="glass" onClick={() => setRecenter((r) => r + 1)} title="Recentrar cámara">
              <Crosshair size={15} />
            </Button>
          </div>
        </div>

        {empty && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="font-display text-xl font-semibold">No hay {KIND_LABEL_PLURAL[city.kind].toLowerCase()} con estos filtros</p>
            <p className="text-sm text-ink-muted">Prueba otro periodo u otro tipo de movimiento.</p>
            <Button onClick={resetFilters}>Quitar filtros</Button>
          </div>
        )}

        {!empty && (
          <p className="pointer-events-none absolute bottom-3 left-3 hidden rounded-lg bg-black/40 px-2.5 py-1 text-[11px] text-white/70 backdrop-blur md:block">
            Arrastra para girar · rueda para zoom · clic: seleccionar · doble clic o clic en distrito: entrar · Esc: subir
          </p>
        )}
      </div>

      {/* Panel: lateral en escritorio, hoja inferior en móvil */}
      {!empty && (
        <aside
          className={clsx(
            'z-10 flex flex-col border-line bg-surface-solid lg:w-96 lg:border-t-0 lg:border-l lg:bg-surface lg:backdrop-blur-xl',
            'absolute inset-x-0 bottom-16 rounded-t-2xl border-t md:bottom-0 lg:static lg:max-h-none lg:rounded-none',
            sheet && 'max-h-[70%]',
          )}
        >
          <button
            onClick={() => setSheet(!sheet)}
            className="flex h-[4.5rem] shrink-0 items-center gap-3 px-4 text-left lg:hidden"
            aria-label={sheet ? 'Plegar panel' : 'Desplegar panel'}
          >
            <span className="h-3.5 w-3.5 shrink-0 rounded" style={{ background: panelNode.color }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display font-semibold">{panelNode.label}</span>
              <span className="block text-xs text-ink-muted">
                {panelNode.count} movimientos · {sheet ? 'plegar' : 'ver detalle'}
              </span>
            </span>
            <span className="num text-sm font-semibold">{fmtMoney(panelNode.value, { currency: settings.currency, locale: settings.locale })}</span>
            <ChevronUp size={18} className={clsx('shrink-0 text-ink-faint transition', sheet && 'rotate-180')} />
          </button>
          <div className={clsx('min-h-0 flex-1 overflow-y-auto', !sheet && 'hidden lg:block')}>
            <CityPanel
              node={panelNode}
              parent={panelParent}
              isView={panelNode === view}
              hoveredId={city.hoveredId}
              onHover={city.hover}
              onEnter={enter}
              onUp={up}
              canGoUp={trail.length > 1}
            />
          </div>
        </aside>
      )}
    </div>
  )
}

function findParent(root: CityNode, id: string): CityNode | null {
  for (const c of root.children ?? []) {
    if (c.id === id) return root
    if (id.startsWith(c.id + '/')) return findParent(c, id)
  }
  return null
}

function SceneLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-line-strong border-t-accent-2" />
    </div>
  )
}

function ViewOptions() {
  const city = useCity()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [open])
  return (
    <div ref={ref} className="relative">
      <Button variant="subtle" className="glass" onClick={() => setOpen(!open)} title="Opciones de vista">
        <SlidersHorizontal size={15} />
        <span className="hidden xl:inline">Vista</span>
      </Button>
      {open && (
        <div className="absolute top-11 right-0 z-30 w-72 space-y-3 rounded-xl border border-line-strong bg-surface-solid p-4 text-sm shadow-2xl">
          <label className="block">
            <span className="mb-1 block text-xs text-ink-muted">Agrupar por</span>
            <select className="field" value={city.preset} onChange={(e) => city.setPrefs({ preset: e.target.value })}>
              {DRILL_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-ink-muted">Altura de los edificios</span>
            <select className="field" value={city.heightBy} onChange={(e) => city.setPrefs({ heightBy: e.target.value as HeightBy })}>
              {Object.entries(HEIGHT_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-ink-muted">Color</span>
            <select className="field" value={city.colorBy} onChange={(e) => city.setPrefs({ colorBy: e.target.value as ColorBy })}>
              {Object.entries(COLOR_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <div>
            <span className="mb-1 block text-xs text-ink-muted">Niveles a la vista</span>
            <Segmented<'1' | '2'>
              value={String(city.depth) as '1' | '2'}
              onChange={(v) => city.setPrefs({ depth: Number(v) as 1 | 2 })}
              options={[
                { value: '1', label: 'Uno' },
                { value: '2', label: 'Distritos + edificios' },
              ]}
            />
          </div>
          <p className="text-xs text-ink-faint">La superficie de cada bloque es siempre su importe.</p>
        </div>
      )}
    </div>
  )
}
