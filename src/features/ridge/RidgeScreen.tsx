import clsx from 'clsx'
import { Crosshair, MousePointerClick, Play } from 'lucide-react'
import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { useCategories, useMovements, useSettings } from '../../data/hooks'
import { withAlpha } from '../../lib/color'
import { applyFilters } from '../../model/aggregate'
import { KIND_LABEL_PLURAL } from '../../model/defaults'
import { fmtMoney } from '../../model/format'
import { today } from '../../model/period'
import { BUCKET_LABEL, bucketLabel, bucketPosition, seriesByBucket, type BucketChoice } from '../../model/ridgeSeries'
import { KINDS, type Kind } from '../../model/types'
import { useQuality, useSceneColors } from '../../scenes/common'
import { layoutRidge } from '../../scenes/ridge/layout'
import type { RidgeHover } from '../../scenes/ridge/RidgeCanvas'
import { useRidge } from '../../scenes/ridge/store'
import { useUI } from '../../store/ui'
import { Button, Segmented } from '../../ui/components/primitives'
import { TimePlayer } from '../../ui/TimePlayer'
import { useTimeline } from '../../ui/useTimeline'
import { CategoryIcon } from '../../ui/icons'
import { useOpenInCity } from '../city/openInCity'

const RidgeCanvas = lazy(() => import('../../scenes/ridge/RidgeCanvas').then((m) => ({ default: m.RidgeCanvas })))

export function RidgeScreen() {
  const { movements } = useMovements()
  const categories = useCategories()
  const settings = useSettings()
  const filters = useUI((s) => s.filters)
  const resetFilters = useUI((s) => s.resetFilters)
  const ridge = useRidge()
  const quality = useQuality()
  const colors = useSceneColors()
  const [hover, setHover] = useState<RidgeHover | null>(null)
  const [focusRow, setFocusRow] = useState<number | null>(null)
  const [recenter, setRecenter] = useState(0)

  const scoped = useMemo(
    () => applyFilters(movements, { ...filters, kinds: [ridge.kind] }, categories, today(), settings.fiscalYearStart),
    [movements, filters, ridge.kind, categories, settings.fiscalYearStart],
  )
  // Agrupación adaptativa: un mes de datos se ve por días; un año, por meses.
  const layout = useMemo(
    () => layoutRidge(seriesByBucket(scoped, categories, ridge.kind, ridge.level, ridge.bucket)),
    [scoped, categories, ridge.kind, ridge.level, ridge.bucket],
  )
  const per = layout.bucket === 'day' ? 'día' : layout.bucket === 'week' ? 'semana' : 'mes'
  const money = (v: number, compact = false) => fmtMoney(v, { currency: settings.currency, locale: settings.locale, compact })

  // Reproducción: la cordillera se levanta como una ola que avanza día a día, semana a semana o mes a mes.
  const [evolving, setEvolving] = useState(false)
  const tl = useTimeline(scoped, layout.bucket === 'month' ? 'week' : 'day')
  const cursor = evolving && tl.frame ? bucketPosition(layout.frames, tl.frame.to) : null
  const sorted = useMemo(() => [...scoped].sort((a, b) => a.date.localeCompare(b.date)), [scoped])
  const soFar = useMemo(() => {
    if (!evolving || !tl.frame) return 0
    let acc = 0
    for (const m of sorted) {
      if (m.date > tl.frame.to) break
      acc += Math.abs(m.amount)
    }
    return acc
  }, [evolving, tl.frame, sorted])
  const startEvolution = () => {
    setEvolving(true)
    tl.setIndex(0)
    tl.setPlaying(true)
  }
  const stopEvolution = () => {
    tl.setPlaying(false)
    setEvolving(false)
  }

  // Clic en una cresta: abre la Ciudad con esa categoría y ese tramo (día, semana o mes).
  const openInCity = useOpenInCity()
  const pick = useCallback(
    (h: RidgeHover) => {
      const row = layout.rows[h.row]
      if (row && row.categoryId !== 'otras') openInCity(row.categoryId, ridge.kind, layout.frames[h.at])
    },
    [layout, openInCity, ridge.kind],
  )

  const empty = layout.rows.length === 0 || layout.frames.length === 0
  const totals = useMemo(() => layout.frames.map((_, i) => layout.rows.reduce((a, r) => a + r.values[i], 0)), [layout])
  const peak = totals.indexOf(Math.max(...totals))

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {!empty && (
          <div className="absolute inset-x-0 top-0 bottom-[8.5rem] md:bottom-[4.5rem] lg:bottom-0">
            <Suspense fallback={<div className="flex h-full items-center justify-center text-ink-muted">Cargando…</div>}>
              <RidgeCanvas
                layout={layout}
                hover={hover}
                focusRow={focusRow}
                quality={quality}
                colors={colors}
                currency={settings.currency}
                locale={settings.locale}
                frameKey={`${ridge.kind}|${ridge.level}|${layout.bucket}|${recenter}|${layout.frames.length}`}
                onHover={setHover}
                onPick={pick}
                cursor={cursor}
              />
            </Suspense>
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start gap-2 p-3">
          <div className="glass pointer-events-auto rounded-xl px-3 py-2 text-sm">
            <div className="font-semibold">
              {KIND_LABEL_PLURAL[ridge.kind]} por {per}
            </div>
            {!empty && (
              <div className="text-xs text-ink-muted">
                Pico: <span className="text-ink">{bucketLabel(layout.frames[peak], layout.bucket, true)}</span> ·{' '}
                <span className="num">{money(totals[peak])}</span>
              </div>
            )}
          </div>
          <div className="pointer-events-auto ml-auto flex flex-wrap items-center justify-end gap-2">
            <Segmented<Kind>
              value={ridge.kind}
              onChange={(kind) => ridge.setPrefs({ kind })}
              options={KINDS.map((k) => ({ value: k, label: KIND_LABEL_PLURAL[k] }))}
              className="glass"
            />
            <Segmented<'root' | 'leaf'>
              value={ridge.level}
              onChange={(level) => ridge.setPrefs({ level })}
              options={[
                { value: 'root', label: 'Categorías' },
                { value: 'leaf', label: 'Subcategorías' },
              ]}
              className="glass"
            />
            <Segmented<BucketChoice>
              value={ridge.bucket}
              onChange={(bucket) => ridge.setPrefs({ bucket })}
              options={(['auto', 'day', 'week', 'month'] as BucketChoice[]).map((b) => ({ value: b, label: BUCKET_LABEL[b] }))}
              className="glass"
            />
            <Button
              variant="subtle"
              className={clsx('glass', evolving && 'ring-1 ring-accent-2/60')}
              onClick={evolving ? stopEvolution : startEvolution}
              title="Ver cómo se levanta la cordillera con el tiempo"
              aria-label="Evolución"
            >
              <Play size={15} /> <span className="hidden sm:inline">Evolución</span>
            </Button>
            <Button variant="subtle" className="glass" onClick={() => setRecenter((r) => r + 1)} title="Recentrar cámara">
              <Crosshair size={15} />
            </Button>
          </div>
        </div>

        {empty ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="font-display text-xl font-semibold">No hay {KIND_LABEL_PLURAL[ridge.kind].toLowerCase()} con estos filtros</p>
            <Button onClick={resetFilters}>Quitar filtros</Button>
          </div>
        ) : evolving ? (
          <div className="absolute inset-x-3 bottom-[9.5rem] z-10 md:bottom-[5.5rem] lg:bottom-4 lg:left-1/2 lg:w-[36rem] lg:-translate-x-1/2">
            <TimePlayer
              frames={tl.frames}
              index={tl.index}
              onIndex={tl.setIndex}
              playing={tl.playing}
              onPlaying={tl.setPlaying}
              step={tl.step}
              onStep={tl.setStep}
              speed={tl.speed}
              onSpeed={tl.setSpeed}
              extra={`${money(soFar)} acumulado`}
              onClose={stopEvolution}
            />
          </div>
        ) : (
          <p className="pointer-events-none absolute bottom-4 left-4 hidden items-center gap-2 rounded-xl border border-white/10 bg-black/55 px-3 py-2 text-xs text-white/80 shadow-lg backdrop-blur-md md:flex">
            <MousePointerClick size={15} className="text-white/60" />
            Pasa por una cresta para ver cada {per} · clic para abrirlo en la Ciudad
          </p>
        )}
      </div>

      {!empty && (
        <aside className="absolute inset-x-0 bottom-16 z-10 max-h-[4.5rem] overflow-y-auto border-t border-line bg-surface-solid md:bottom-0 lg:static lg:max-h-none lg:w-96 lg:border-t-0 lg:border-l lg:bg-surface lg:backdrop-blur-xl">
          <div className="space-y-1 p-3">
            <h3 className="px-1 pb-1 text-xs font-medium text-ink-muted">
              {layout.rows.length} crestas · {layout.frames.length} {layout.bucket === 'day' ? 'días' : layout.bucket === 'week' ? 'semanas' : 'meses'}
            </h3>
            {layout.rows.map((row, i) => {
              const max = Math.max(...row.values, 1e-9)
              return (
                <button
                  key={row.categoryId}
                  onMouseEnter={() => setFocusRow(i)}
                  onMouseLeave={() => setFocusRow(null)}
                  onClick={() => pick({ row: i, at: row.values.indexOf(max) })}
                  className={clsx('w-full rounded-lg px-2 py-2 text-left transition', (hover?.row ?? focusRow) === i ? 'bg-surface-2' : 'hover:bg-surface-2')}
                  title={`Abrir en la Ciudad el ${per} de más importe`}
                >
                  <div className="flex items-center gap-2 text-sm">
                    <span
                      className="chip-ink flex h-6 w-6 items-center justify-center rounded-md"
                      style={{ '--c': row.color, background: withAlpha(row.color, 0.15) } as React.CSSProperties}
                    >
                      <CategoryIcon name={row.icon} size={13} />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{row.name}</span>
                    <span className="num text-xs text-ink-muted">{money(row.total)}</span>
                  </div>
                  {/* Barras por tramo de esta categoría: el señalado en la escena se ilumina. */}
                  <div className="mt-1.5 flex h-6 items-end gap-px pl-8">
                    {row.values.map((v, k) => (
                      <span
                        key={k}
                        className="flex-1 rounded-t-sm"
                        style={{
                          height: `${Math.max(4, (v / max) * 100)}%`,
                          background: row.color,
                          opacity: hover && hover.at === k ? 1 : cursor != null && k > cursor + 1e-6 ? 0.08 : v > 0 ? 0.55 : 0.12,
                        }}
                      />
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
        </aside>
      )}
    </div>
  )
}
