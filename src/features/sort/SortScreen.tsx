import clsx from 'clsx'
import { Flame, Gamepad2, PartyPopper, SkipForward, Sparkles, Trophy, Undo2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useCategories, useRawMovements, useRules } from '../../data/hooks'
import { createRule, deleteRule, ensureAutoCategory, recategorize, reserveCategoryIds, restoreMovements } from '../../data/repo'
import { paletteColor, withAlpha } from '../../lib/color'
import { autoContext } from '../../model/autocat'
import { fmtDate } from '../../model/format'
import { buildDeck, cardOptions, cardPoints, type SortCard, type SortOption } from '../../model/sortGame'
import type { Movement } from '../../model/types'
import { useUI } from '../../store/ui'
import { Button, Card, Money } from '../../ui/components/primitives'
import { CategoryIcon } from '../../ui/icons'
import { CategorySelect } from '../categories/CategorySelect'

interface Played {
  before: Movement[]
  ruleId?: string
  points: number
}

const REASON: Record<SortOption['reason'], string> = { similar: 'como sus parecidos', catalog: 'por el comercio', frequent: 'de las que más usas' }

/**
 * El Clasificador: las cartas de «Sin clasificar» van saltando de una en una y tú eliges a qué categoría van. Cada
 * carta agrupa el mismo comercio escrito de varias formas y, al elegir, se crea una regla para los que lleguen después.
 * Teclas: 1–6 para elegir, S para saltar, Z para deshacer.
 */
export function SortScreen() {
  const { movements, loading } = useRawMovements()
  const categories = useCategories()
  const rules = useRules()
  const toast = useUI((s) => s.toast)

  const reserve = useMemo(() => reserveCategoryIds(categories), [categories])
  const deck = useMemo(() => buildDeck(movements, reserve), [movements, reserve])
  const ctx = useMemo(() => autoContext(movements), [movements])
  const pending = useMemo(() => deck.reduce((n, c) => n + c.ids.length, 0), [deck])

  const [skipped, setSkipped] = useState<string[]>([])
  const [history, setHistory] = useState<Played[]>([])
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(0)
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const [leaving, setLeaving] = useState<'fly' | 'skip' | null>(null)
  const [fly, setFly] = useState<CSSProperties>()
  const [pop, setPop] = useState<{ id: number; text: string } | null>(null)
  // Lo pendiente al empezar, para la barra de progreso de esta partida.
  const [start, setStart] = useState<number | null>(null)
  if (start === null && !loading && categories.length) setStart(pending)

  const cardKey = (c: SortCard) => `${c.kind}|${c.key}`
  const visible = deck.filter((c) => !skipped.includes(cardKey(c)))
  const card = visible[0] ?? deck[0]
  const options = useMemo(() => (card ? cardOptions(card, movements, categories, reserve, ctx) : []), [card, movements, categories, reserve, ctx])

  const cardRef = useRef<HTMLDivElement>(null)
  const otherRef = useRef<HTMLDivElement>(null)

  const choose = useCallback(
    async (opt: { categoryId?: string; auto?: SortOption['auto'] }, target?: HTMLElement | null) => {
      if (!card || busy) return
      setBusy(true)
      // La carta vuela hasta el botón elegido.
      const from = cardRef.current?.getBoundingClientRect()
      const to = target?.getBoundingClientRect()
      if (from && to)
        setFly({
          transform: `translate(${to.left + to.width / 2 - (from.left + from.width / 2)}px, ${to.top + to.height / 2 - (from.top + from.height / 2)}px) scale(0.15) rotate(12deg)`,
          opacity: 0,
          transition: 'transform 0.45s cubic-bezier(0.5, 0, 0.75, 0), opacity 0.45s ease-in',
        })
      setLeaving('fly')
      const points = cardPoints(card.ids.length, streak)
      setPop({
        id: Date.now(),
        text: `+${points}${
          streak >= 2
            ? ` · racha ×${Math.min(3, 1 + streak * 0.25)
                .toFixed(2)
                .replace(/\.?0+$/, '')}`
            : ''
        }`,
      })
      try {
        const categoryId = opt.categoryId ?? (opt.auto ? await ensureAutoCategory(opt.auto) : undefined)
        if (!categoryId) return
        const ids = new Set(card.ids)
        const before = movements.filter((m) => ids.has(m.id))
        let ruleId: string | undefined
        const exists = card.rule && rules.some((r) => r.matchType === card.rule!.matchType && r.pattern.toLowerCase() === card.rule!.pattern.toLowerCase())
        if (remember && card.rule && !exists) ruleId = await createRule({ ...card.rule, categoryId })
        await new Promise((r) => setTimeout(r, 420))
        await recategorize(card.ids, categoryId)
        setHistory((h) => [...h, { before, ruleId, points }])
        setScore((s) => s + points)
        setStreak((s) => s + 1)
      } finally {
        setFly(undefined)
        setLeaving(null)
        setBusy(false)
      }
    },
    [card, busy, streak, movements, rules, remember],
  )

  const skip = useCallback(() => {
    if (!card || busy) return
    setLeaving('skip')
    setStreak(0)
    setTimeout(() => {
      setSkipped((s) => [...s, cardKey(card)])
      setLeaving(null)
    }, 330)
  }, [card, busy])

  const undo = useCallback(async () => {
    const last = history[history.length - 1]
    if (!last || busy) return
    setBusy(true)
    try {
      await restoreMovements(last.before)
      if (last.ruleId) await deleteRule(last.ruleId)
      setHistory((h) => h.slice(0, -1))
      setScore((s) => s - last.points)
      setStreak(0)
      toast('Deshecho')
    } finally {
      setBusy(false)
    }
  }, [history, busy, toast])

  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.metaKey || e.ctrlKey) return
      const n = Number(e.key)
      if (n >= 1 && n <= options.length) void choose(options[n - 1], optionRefs.current[n - 1])
      else if (e.key === 's' || e.key === 'S') skip()
      else if (e.key === 'z' || e.key === 'Z') void undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [options, choose, skip, undo])

  const done = start !== null && start > 0 ? Math.min(1, (start - pending) / start) : pending ? 0 : 1
  const allSkipped = !!deck.length && !visible.length

  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="min-w-48 flex-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium text-ink">{pending ? `${pending.toLocaleString('es-ES')} movimientos sin clasificar` : 'Nada sin clasificar'}</span>
              <span className="num text-xs whitespace-nowrap text-ink-faint">{Math.round(done * 100)} %</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2 transition-all duration-700" style={{ width: `${done * 100}%` }} />
            </div>
          </div>
          <div className="flex items-center gap-5">
            <div className="text-center">
              <div className="num text-lg font-semibold text-ink">{score.toLocaleString('es-ES')}</div>
              <div className="text-[10px] tracking-wider text-ink-faint uppercase">puntos</div>
            </div>
            <div className="text-center">
              <div className={clsx('num flex items-center justify-center gap-1 text-lg font-semibold', streak >= 3 ? 'text-warn' : 'text-ink')}>
                <Flame size={16} className={clsx(streak >= 3 ? 'text-warn' : 'text-ink-faint')} />
                {streak}
              </div>
              <div className="text-[10px] tracking-wider text-ink-faint uppercase">racha</div>
            </div>
          </div>
        </div>
      </Card>

      {!card || (start !== null && pending === 0) ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          {loading ? (
            <p className="text-sm text-ink-muted">Cargando…</p>
          ) : (
            <>
              <div className="sort-enter flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-white">
                {history.length ? <Trophy size={30} /> : <PartyPopper size={30} />}
              </div>
              <h2 className="font-display text-xl font-semibold text-ink">{history.length ? '¡«Sin clasificar» a cero!' : 'No hay nada sin clasificar'}</h2>
              <p className="max-w-md text-sm text-ink-muted">
                {history.length
                  ? `${history.reduce((n, h) => n + h.before.length, 0).toLocaleString('es-ES')} movimientos clasificados y ${score.toLocaleString('es-ES')} puntos. Las reglas que has creado clasificarán solos los que lleguen después.`
                  : 'Cuando lleguen movimientos que no se reconozcan, aparecerán aquí como cartas para clasificarlos de un toque.'}
              </p>
            </>
          )}
        </Card>
      ) : allSkipped ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <Sparkles size={28} className="text-accent-2" />
          <p className="text-sm text-ink-muted">Has saltado todas las que quedaban ({deck.length}).</p>
          <Button variant="primary" onClick={() => setSkipped([])}>
            Volver a las saltadas
          </Button>
        </Card>
      ) : (
        <>
          <div className="relative flex min-h-64 flex-col items-center justify-end pt-10 pb-4">
            {pop && (
              <span key={pop.id} className="sort-points num pointer-events-none absolute top-6 left-1/2 z-10 text-lg font-bold whitespace-nowrap text-accent-2">
                {pop.text}
              </span>
            )}
            <div
              key={cardKey(card)}
              ref={cardRef}
              style={fly}
              className={clsx('relative z-[1] w-full max-w-md', leaving === 'skip' ? 'sort-skip' : leaving ? '' : 'sort-enter')}
            >
              <div className={clsx(!leaving && 'sort-bounce')} style={{ animationDelay: '0.9s' }}>
                <SortCardView card={card} />
              </div>
            </div>
            <div className="sort-shadow mt-3 h-3 w-64 rounded-[50%] bg-black/50 blur-[6px]" style={{ animationDelay: '0.9s' }} />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {options.map((o, i) => {
              const cat = o.categoryId ? categories.find((c) => c.id === o.categoryId) : undefined
              // Una categoría nueva tendrá el siguiente color de la paleta (el que le pone `createCategory`).
              const color = cat?.color ?? paletteColor(categories.length)
              return (
                <button
                  key={o.categoryId ?? o.auto?.key}
                  ref={(el) => {
                    optionRefs.current[i] = el
                  }}
                  disabled={busy}
                  onClick={(e) => void choose(o, e.currentTarget)}
                  className="chip-ink group relative flex min-h-16 flex-col items-start justify-center gap-0.5 rounded-xl border px-3 py-2 text-left transition hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
                  style={{ '--c': color, borderColor: withAlpha(color, 0.45), background: withAlpha(color, 0.1) } as CSSProperties}
                >
                  <span className="flex w-full items-center gap-2 text-sm font-semibold">
                    <CategoryIcon name={cat?.icon ?? 'Sparkles'} size={15} />
                    <span className="truncate">{o.name}</span>
                    <kbd className="num ml-auto hidden rounded border border-line px-1 text-[10px] text-ink-faint sm:inline">{i + 1}</kbd>
                  </span>
                  <span className="text-[11px] text-ink-faint">
                    {o.categoryId ? REASON[o.reason] : <span className="font-medium text-accent-2">nueva · {REASON[o.reason]}</span>}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <CategorySelect
              ref={otherRef}
              className="min-w-48 flex-1"
              value=""
              disabled={busy}
              kinds={[card.kind, 'transfer']}
              exclude={reserve}
              placeholder="Otra categoría…"
              aria-label="Otra categoría"
              onChange={(id) => void choose({ categoryId: id }, otherRef.current)}
            />
            <Button onClick={skip} disabled={busy}>
              <SkipForward size={15} /> Saltar <kbd className="num hidden text-[10px] text-ink-faint sm:inline">S</kbd>
            </Button>
            <Button variant="ghost" onClick={() => void undo()} disabled={busy || !history.length}>
              <Undo2 size={15} /> Deshacer <kbd className="num hidden text-[10px] text-ink-faint sm:inline">Z</kbd>
            </Button>
          </div>
          <label className="flex items-start gap-2 text-xs text-ink-muted">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="mt-0.5 accent-[var(--accent)]" />
            <span>
              Recordarlo para los que lleguen después
              {card.rule && (
                <>
                  {' '}
                  (regla: concepto {card.rule.matchType === 'contains' ? 'contiene' : 'es'}{' '}
                  <code className="rounded bg-surface-2 px-1">{card.rule.pattern}</code>)
                </>
              )}
            </span>
          </label>
        </>
      )}
    </div>
  )
}

function SortCardView({ card }: { card: SortCard }) {
  const n = card.ids.length
  const accent = card.kind === 'expense' ? 'var(--expense)' : 'var(--income)'
  return (
    <div className="glass overflow-hidden rounded-2xl shadow-2xl" style={{ borderColor: `color-mix(in oklab, ${accent} 45%, transparent)` }}>
      <div className="h-1.5" style={{ background: accent }} />
      <div className="space-y-3 p-5">
        <div className="flex items-center justify-between gap-3 text-[11px] tracking-wider text-ink-faint uppercase">
          <span className="flex items-center gap-1.5">
            <Gamepad2 size={13} /> {card.kind === 'expense' ? 'Gasto' : 'Ingreso'}
          </span>
          {n > 1 && <span className="num rounded-full bg-surface-2 px-2 py-0.5 text-ink">×{n}</span>}
        </div>
        <div className="font-display text-xl leading-tight font-semibold break-words text-ink">{card.samples[0]}</div>
        {card.samples.length > 1 && <div className="truncate text-xs text-ink-faint">También: {card.samples.slice(1, 4).join(' · ')}</div>}
        <div className="flex items-end justify-between gap-3">
          <Money value={card.total} kind="auto" className="text-2xl font-semibold" />
          <span className="num text-xs text-ink-faint">{card.from === card.to ? fmtDate(card.from) : `${fmtDate(card.from)} – ${fmtDate(card.to)}`}</span>
        </div>
      </div>
    </div>
  )
}
