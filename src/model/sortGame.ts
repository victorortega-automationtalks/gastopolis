import { autoContext, classify, findCategory, words, type AutoCategory, type AutoContext } from './autocat'
import { rulePattern } from './ruleSuggest'
import type { Category, Movement, Rule } from './types'

/**
 * El Clasificador: un minijuego para dejar «Sin clasificar» a cero. Cada carta es un grupo de movimientos parecidos
 * (el mismo comercio escrito de varias formas) que se clasifican de una vez; al elegir, se crea una regla para que los
 * que lleguen después ya vengan clasificados. Las cartas que más movimientos arreglan salen primero.
 */

type Mv = Pick<Movement, 'id' | 'concept' | 'amount' | 'date' | 'categoryId'>

/** Clave que agrupa conceptos parecidos: el texto de la regla si lo hay; si no, el concepto sin números ni símbolos. */
export function groupKey(concept: string): string {
  return (
    rulePattern(concept) ??
    words(concept)
      .replace(/\b\w*\d\w*\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

export interface SortCard {
  key: string
  kind: 'expense' | 'income'
  ids: string[]
  total: number
  /** Conceptos tal cual, los más repetidos primero. */
  samples: string[]
  from: string
  to: string
  /** La regla que se crea al clasificar, para los que lleguen después (si hay un texto fiable). */
  rule?: Pick<Rule, 'matchType' | 'pattern'>
}

/** El mazo: lo que sigue en las categorías de reserva, agrupado y ordenado por cuántos movimientos arregla cada carta. */
export function buildDeck(movements: Mv[], reserveIds: string[]): SortCard[] {
  const reserve = new Set(reserveIds)
  const groups = new Map<string, SortCard & { counts: Map<string, number> }>()
  for (const m of movements) {
    if (!reserve.has(m.categoryId) || !m.amount) continue
    const kind = m.amount < 0 ? 'expense' : 'income'
    const key = groupKey(m.concept)
    if (!key) continue
    const k = `${kind}|${key}`
    const g = groups.get(k) ?? {
      key,
      kind,
      ids: [] as string[],
      total: 0,
      samples: [] as string[],
      from: m.date,
      to: m.date,
      counts: new Map<string, number>(),
    }
    g.ids.push(m.id)
    g.total += m.amount
    g.counts.set(m.concept, (g.counts.get(m.concept) ?? 0) + 1)
    if (m.date < g.from) g.from = m.date
    if (m.date > g.to) g.to = m.date
    groups.set(k, g)
  }
  return [...groups.values()]
    .map(({ counts, ...g }) => {
      const samples = [...counts].sort((a, b) => b[1] - a[1]).map(([c]) => c)
      const pattern = rulePattern(samples[0])
      const rule: SortCard['rule'] = pattern
        ? { matchType: 'contains', pattern }
        : samples.length === 1
          ? { matchType: 'equals', pattern: samples[0] }
          : undefined
      return { ...g, total: Math.round(g.total * 100) / 100, samples, rule }
    })
    .sort((a, b) => b.ids.length - a.ids.length || Math.abs(b.total) - Math.abs(a.total))
}

export interface SortOption {
  /** Categoría que ya existe, o nada si hay que crearla (`auto`). */
  categoryId?: string
  auto?: AutoCategory
  name: string
  /** Por qué se propone: lo dice el catálogo, la tienen gastos parecidos, o es de las que más usas. */
  reason: 'catalog' | 'similar' | 'frequent'
}

/**
 * Opciones para una carta, de la más probable a la menos: lo que tienen ya los movimientos parecidos (mismo comercio o
 * misma primera palabra), lo que dice el catálogo de comercios y, para completar, tus categorías más usadas de ese tipo.
 * Siempre del sentido del dinero de la carta (o traspasos), nunca las de reserva.
 */
export function cardOptions(
  card: SortCard,
  movements: Mv[],
  categories: Pick<Category, 'id' | 'name' | 'kind'>[],
  reserveIds: string[],
  ctx: AutoContext = autoContext([]),
  max = 6,
): SortOption[] {
  const reserve = new Set(reserveIds)
  const byId = new Map(categories.map((c) => [c.id, c]))
  const fits = (id: string) => {
    const c = byId.get(id)
    return !!c && !reserve.has(id) && (c.kind === card.kind || c.kind === 'transfer')
  }
  const out: SortOption[] = []
  const seen = new Set<string>()
  const push = (o: SortOption) => {
    const k = o.categoryId ?? `auto:${o.auto!.key}`
    if (seen.has(k) || out.length >= max) return
    seen.add(k)
    out.push(o)
  }
  const sign = card.kind === 'expense' ? -1 : 1
  const first = card.key.split(' ')[0]
  const similar = new Map<string, number>()
  const frequent = new Map<string, number>()
  for (const m of movements) {
    if (Math.sign(m.amount) !== sign || !fits(m.categoryId)) continue
    frequent.set(m.categoryId, (frequent.get(m.categoryId) ?? 0) + 1)
    const k = groupKey(m.concept)
    // El mismo comercio pesa mucho más que compartir la primera palabra.
    const w = k === card.key ? 10 : first.length >= 4 && k.split(' ')[0] === first ? 1 : 0
    if (w) similar.set(m.categoryId, (similar.get(m.categoryId) ?? 0) + w)
  }
  for (const [id] of [...similar].sort((a, b) => b[1] - a[1])) push({ categoryId: id, name: byId.get(id)!.name, reason: 'similar' })
  const auto = classify({ concept: card.samples[0], amount: sign }, ctx)
  if (auto) {
    const id = findCategory(auto, categories)
    if (id && fits(id)) push({ categoryId: id, name: byId.get(id)!.name, reason: 'catalog' })
    else if (!id) push({ auto, name: auto.name, reason: 'catalog' })
  }
  for (const [id] of [...frequent].sort((a, b) => b[1] - a[1])) push({ categoryId: id, name: byId.get(id)!.name, reason: 'frequent' })
  return out
}

/** Puntos de una carta: más cuantos más movimientos arregla, y la racha multiplica (hasta ×3). */
export function cardPoints(count: number, streak: number): number {
  return Math.round((10 + 5 * Math.min(count, 20)) * Math.min(3, 1 + streak * 0.25))
}

// ── Diversión ────────────────────────────────────────────────────────────────

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** «sábado 12 de octubre de 2026». */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} de ${MONTHS[m - 1]} de ${y}`
}

const isWeekend = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return w === 0 || w === 6
}

/** Chascarrillos por tipo de gasto (clave del catálogo) y, si no, por cómo es la carta. */
const QUIPS: Record<string, string[]> = {
  betting: ['La casa siempre gana… ¿o esta vez sí?', 'Apuesta segura: clasificarlo bien.', 'Ni la quiniela es tan impredecible como esto.'],
  delivery: ['Cocinar está sobrevalorado, ¿verdad?', 'El repartidor ya te saluda por tu nombre.', 'La nevera, mirándote con pena.'],
  restaurants: ['Comer fuera también es cultura.', 'La sobremesa no se paga sola.', '¿Tapa o ración? Ración, claro.'],
  supermarket: ['La nevera no se llena sola.', 'El carro siempre acaba más lleno de lo previsto.', 'Fuiste a por pan y volviste con media tienda.'],
  fuel: ['Tu coche también tiene hambre.', 'Llenar el depósito: deporte de riesgo.', 'Gasolina: el perfume más caro del mundo.'],
  transport: ['Moverse cuesta, literalmente.', 'Ni el teletransporte sería tan caro.'],
  vehicle: ['Tu coche te quiere… y lo demuestra en el taller.', 'Ruedas, aceite y paciencia.'],
  travel: ['Las vacaciones se pagan, aunque se olviden.', 'Recuerdos incluidos, la factura también.', 'El mundo es grande y los vuelos, caros.'],
  online: ['El cartero ya es de la familia.', 'Añadir al carrito es demasiado fácil.', '¿Lo necesitabas? Da igual, ya está aquí.'],
  clothes: ['No tenías nada que ponerte. Ahora sí.', 'Moda: el arte de gastar con estilo.'],
  tech: ['Un cable más para el cajón de los cables.', 'Tecnología: hoy novedad, mañana pisapapeles.'],
  leisure: ['La vida está para vivirla (y apuntarla).', 'Entradas compradas, recuerdos garantizados.'],
  subscriptions: ['Otra suscripción que vive de tu olvido.', '¿Sigues usándola o solo la pagas?', 'Pagar cada mes sin mirar: un clásico.'],
  health: ['Invertir en salud nunca es mal gasto.', 'Mens sana in corpore… pagado.'],
  beauty: ['Brillar también cuesta.', 'Hoy estás estupendo, y se nota en la cuenta.'],
  sport: ['Sudar también se paga.', 'El gimnasio te echa de menos.'],
  home: ['Hogar, dulce (y caro) hogar.', 'Tener techo tiene su precio.', 'La casa, ese pozo sin fondo tan acogedor.'],
  bills: ['Luz, agua y paciencia.', 'Las facturas no se van de vacaciones.'],
  insurance: ['Pagar por si acaso: la definición de seguro.', 'Ojalá no lo necesites nunca.'],
  taxes: ['Hacienda somos todos, y hoy te tocó a ti.', 'Lo único seguro: la muerte y los impuestos.'],
  fees: ['Comisiones: el impuesto a no mirar.', 'Tu banco te lo agradece. Tú, menos.'],
  gifts: ['Regalar es de buena gente.', 'Quedaste genial, y el bolsillo lo sabe.'],
  bizumOut: ['Bizum: la forma moderna de decir «te debo una».', 'Cuentas claras, amistades largas.'],
  bizumIn: ['Alguien te debía una. Y pagó.', 'Bizum entrante: la mejor notificación.'],
  payroll: ['La nómina: ese momento feliz del mes.', 'Día de cobro, día de gloria.'],
  work: ['Trabajo extra, dinero extra. Bien jugado.', 'Cada colaboración cuenta.'],
  ownTransfer: ['Dinero que va de tu bolsillo izquierdo al derecho.', 'Moverlo de sitio no lo hace crecer… pero ordena.'],
  savings: ['Tu yo del futuro te lo agradecerá.', 'Ahorrar: el gasto que te hace más rico.'],
  interest: ['El dinero trabajando para ti. Poquito, pero trabajando.'],
  taxRefund: ['¡Hacienda devuelve! Apúntalo, que no pasa siempre.'],
  winnings: ['¡Premio! Que no se te suba a la cabeza.'],
  refunds: ['Dinero que vuelve a casa por Navidad.'],
}
const GENERIC_OUT = [
  'Un gasto misterioso aparece. ¿Dónde lo guardamos?',
  'Este no se esconde más.',
  'Otro al saco y a por el siguiente.',
  'Pista: el concepto suele chivarse.',
]
const GENERIC_IN = ['¡Dinero que entra! La mejor carta del mazo.', 'Entra dinero: ¿de dónde vendrá?']

const pickBy = (list: string[], seed: string) => {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0
  return list[Math.abs(h) % list.length]
}

/**
 * Un chascarrillo para la carta: primero por lo que es (catálogo), si no por cómo es (muchas veces, mucho dinero,
 * calderilla, fin de semana). Siempre el mismo para la misma carta, para que no cambie al volver a pintarla.
 */
export function cardQuip(card: Pick<SortCard, 'key' | 'kind' | 'ids' | 'total' | 'from' | 'to'>, autoKey?: string): string {
  const n = card.ids.length
  const abs = Math.abs(card.total)
  const avg = abs / n
  if (autoKey && QUIPS[autoKey]) return pickBy(QUIPS[autoKey], card.key)
  if (n >= 20) return `${n} veces. Esto ya es una relación estable.`
  if (card.kind === 'expense' && avg >= 500) return 'Gasto de tres cifras (o más). Respira hondo y clasifica.'
  if (card.kind === 'expense' && avg < 3) return 'Calderilla… que, junta, ya no lo es tanto.'
  if (n === 1 && isWeekend(card.from)) return 'Gasto de fin de semana. Se nota, se nota.'
  return pickBy(card.kind === 'income' ? GENERIC_IN : GENERIC_OUT, card.key)
}

/** Niveles por puntos: el título que te ganas clasificando. */
export const LEVELS: { min: number; name: string }[] = [
  { min: 0, name: 'Novato del recibo' },
  { min: 150, name: 'Aprendiz de contable' },
  { min: 500, name: 'Cazador de tickets' },
  { min: 1200, name: 'Ninja del extracto' },
  { min: 2500, name: 'Maestro del ahorro' },
  { min: 5000, name: 'Leyenda de Gastópolis' },
]

export function levelFor(score: number): { index: number; name: string; next?: number; progress: number } {
  let index = 0
  for (let i = 0; i < LEVELS.length; i++) if (score >= LEVELS[i].min) index = i
  const next = LEVELS[index + 1]?.min
  const from = LEVELS[index].min
  return { index, name: LEVELS[index].name, next, progress: next ? (score - from) / (next - from) : 1 }
}

/** Frases para celebrar cada carta (y las rachas redondas, a lo grande). */
const CHEERS = ['¡Al saco!', '¡Bien visto!', '¡Clasificado!', '¡Zas!', '¡Uno menos!', '¡Limpio!', '¡Eso es!']
export function cheer(streak: number, seed: string): { text: string; big: boolean } {
  if (streak > 0 && streak % 10 === 0) return { text: `¡Racha de ${streak}! Imparable`, big: true }
  if (streak === 5) return { text: '¡Combo ×5!', big: true }
  if (streak === 3) return { text: '¡En racha!', big: true }
  return { text: pickBy(CHEERS, seed + streak), big: false }
}
