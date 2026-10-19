import clsx from 'clsx'
import {
  Banknote,
  CalendarDays,
  Crown,
  Flame,
  Gamepad2,
  Landmark,
  MessageCircle,
  PartyPopper,
  SkipForward,
  Sparkles,
  Trophy,
  Undo2,
  Wallet,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useAccounts, useCategories, useRawMovements, useRules } from '../../data/hooks'
import { createRule, deleteRule, ensureAutoCategory, recategorize, reserveCategoryIds, restoreMovements } from '../../data/repo'
import { paletteColor, withAlpha } from '../../lib/color'
import { autoContext, classify } from '../../model/autocat'
import { fmtDate } from '../../model/format'
import { buildDeck, cardOptions, cardPoints, cardQuip, cheer, levelFor, longDate, type SortCard, type SortOption } from '../../model/sortGame'
import type { Account, Movement } from '../../model/types'
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
  const accounts = useAccounts()
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
  const [banner, setBanner] = useState<{ id: number; text: string; sub?: string } | null>(null)
  const [confetti, setConfetti] = useState<{ id: number; x: number; y: number; color: string } | null>(null)
  const level = levelFor(score)
  const lastLevel = useRef(0)
  // Lo pendiente al empezar, para la barra de progreso de esta partida.
  const [start, setStart] = useState<number | null>(null)
  if (start === null && !loading && categories.length) setStart(pending)

  const cardKey = (c: SortCard) => `${c.kind}|${c.key}`
  const visible = deck.filter((c) => !skipped.includes(cardKey(c)))
  const card = visible[0] ?? deck[0]
  const options = useMemo(() => (card ? cardOptions(card, movements, categories, reserve, ctx) : []), [card, movements, categories, reserve, ctx])
  // Lo que cuenta la carta: de qué cuentas viene y un chascarrillo según lo que parece.
  const story = useMemo(() => {
    if (!card) return null
    const ids = new Set(card.ids)
    const byId = new Map(accounts.map((a) => [a.id, a]))
    const accs = new Map<string, Account>()
    let loose = 0
    for (const m of movements)
      if (ids.has(m.id)) {
        const a = m.accountId ? byId.get(m.accountId) : undefined
        if (a) accs.set(a.id, a)
        else loose++
      }
    const autoKey = classify({ concept: card.samples[0], amount: card.kind === 'expense' ? -1 : 1 }, ctx)?.key
    return { accounts: [...accs.values()], loose, quip: cardQuip(card, autoKey) }
  }, [card, accounts, movements, ctx])

  // Subida de nivel: cartel a lo grande.
  useEffect(() => {
    if (level.index > lastLevel.current) setBanner({ id: Date.now(), text: '¡Nuevo nivel!', sub: level.name })
    lastLevel.current = level.index
  }, [level.index, level.name])

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
      const c = cheer(streak + 1, card.key)
      // Las rachas redondas, con cartel grande; el resto, la frase y los puntos sobre la carta.
      if (c.big) setBanner({ id: Date.now(), text: c.text, sub: `+${points} puntos` })
      else setPop({ id: Date.now(), text: `${c.text} +${points}` })
      // Confeti del color de la categoría, desde el botón elegido.
      if (to)
        setConfetti({ id: Date.now(), x: to.left + to.width / 2, y: to.top + to.height / 2, color: target?.style.getPropertyValue('--c') || 'var(--accent-2)' })
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
      {banner && (
        <div
          key={banner.id}
          className="sort-banner pointer-events-none fixed top-1/3 left-1/2 z-[70] rounded-2xl bg-gradient-to-r from-accent to-accent-2 px-8 py-4 text-center text-white shadow-2xl"
        >
          <div className="font-display text-3xl font-bold whitespace-nowrap">{banner.text}</div>
          {banner.sub && <div className="mt-1 text-sm font-medium opacity-90">{banner.sub}</div>}
        </div>
      )}
      {confetti && <Confetti key={confetti.id} x={confetti.x} y={confetti.y} color={confetti.color} />}
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
            <div className="min-w-32" title={level.next ? `Siguiente nivel a ${level.next} puntos` : 'Nivel máximo'}>
              <div className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                <Crown size={15} className="text-warn" /> {level.name}
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-warn transition-all duration-700" style={{ width: `${level.progress * 100}%` }} />
              </div>
            </div>
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
                <SortCardView card={card} accounts={story?.accounts ?? []} loose={story?.loose ?? 0} />
              </div>
            </div>
            <div className="sort-shadow mt-3 h-3 w-64 rounded-[50%] bg-black/50 blur-[6px]" style={{ animationDelay: '0.9s' }} />
            {story && !leaving && (
              <div
                key={`q-${cardKey(card)}`}
                className="sort-quip relative mt-3 flex max-w-md items-start gap-2 rounded-2xl border border-line-strong bg-surface-solid px-4 py-2.5 text-sm text-ink-muted italic shadow-lg"
              >
                <span className="absolute -top-1.5 left-8 h-3 w-3 rotate-45 border-t border-l border-line-strong bg-surface-solid" />
                <MessageCircle size={15} className="mt-0.5 shrink-0 text-accent-2" />
                {story.quip}
              </div>
            )}
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

/** Explosión de confeti: piezas que salen del botón elegido en abanico (posiciones fijas, sin aleatoriedad). */
function Confetti({ x, y, color }: { x: number; y: number; color: string }) {
  const pieces = Array.from({ length: 18 }, (_, i) => {
    const angle = (i / 18) * Math.PI * 2
    const dist = 60 + (i % 3) * 28
    return {
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist - 30,
      r: (i % 2 ? 1 : -1) * (180 + i * 20),
      c: i % 3 === 0 ? 'var(--accent-2)' : i % 3 === 1 ? color : 'var(--warn)',
    }
  })
  return (
    <div className="pointer-events-none fixed inset-0 z-[65]">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="sort-confetti absolute block h-2 w-1.5 rounded-sm"
          style={{ left: x, top: y, background: p.c, '--dx': `${p.dx}px`, '--dy': `${p.dy}px`, '--r': `${p.r}deg` } as CSSProperties}
        />
      ))}
    </div>
  )
}

function SortCardView({ card, accounts, loose }: { card: SortCard; accounts: Account[]; loose: number }) {
  const n = card.ids.length
  const accent = card.kind === 'expense' ? 'var(--expense)' : 'var(--income)'
  const when =
    n === 1 || card.from === card.to
      ? longDate(card.to)
      : `${n} veces entre el ${fmtDate(card.from)} y el ${fmtDate(card.to)} · la última, el ${longDate(card.to)}`
  const AccIcon = accounts[0]?.kind === 'cash' ? Banknote : accounts[0]?.bank ? Landmark : Wallet
  const where = accounts.length
    ? `${accounts
        .slice(0, 2)
        .map((a) => (a.bank ? `${a.name} (${a.bank.aspsp.name})` : a.name))
        .join(' y ')}${accounts.length > 2 ? ` y ${accounts.length - 2} más` : ''}${loose ? ` · ${loose} sin cuenta` : ''}`
    : 'Sin cuenta: importado o apuntado a mano'
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
        <Money value={card.total} kind="auto" className="block text-2xl font-semibold" />
        <div className="space-y-1 border-t border-line pt-3 text-xs text-ink-muted">
          <div className="flex items-start gap-1.5">
            <CalendarDays size={13} className="mt-0.5 shrink-0 text-ink-faint" />
            <span className="first-letter:uppercase">{when}</span>
          </div>
          <div className="flex items-start gap-1.5">
            <AccIcon size={13} className="mt-0.5 shrink-0 text-ink-faint" />
            <span>{where}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
