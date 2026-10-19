import { normalizeKey } from '../lib/text'
import type { Category, Kind, Movement } from './types'

/**
 * Clasificación automática de movimientos por su concepto, sin red: un catálogo de comercios y palabras habituales en
 * los extractos de bancos españoles, más tres pistas que salen de tus propios datos (tu nombre, quién te paga la nómina
 * y quién te paga otros trabajos). Lo usan la sincronización con el banco (para lo nuevo) y el botón «Asignar
 * automáticamente» (para lo ya traído). Siempre por detrás de tus reglas y de lo que tú hayas clasificado a mano.
 */

export interface AutoCategory {
  key: string
  name: string
  kind: Kind
  /** Otros nombres con los que puede existir ya la categoría (se reutiliza en vez de crear otra). */
  aliases?: string[]
}

const cat = (key: string, name: string, kind: Kind, aliases: string[] = []): AutoCategory => ({ key, name, kind, aliases })

export const AUTO_CATEGORIES = {
  // Gastos
  supermarket: cat('supermarket', 'Supermercado', 'expense', ['Supermercados', 'Comida', 'Alimentación', 'Compra', 'Super']),
  restaurants: cat('restaurants', 'Restaurantes y bares', 'expense', ['Restaurantes', 'Bares', 'Comer fuera', 'Cenas', 'Restauración']),
  delivery: cat('delivery', 'Comida a domicilio', 'expense', ['Delivery', 'Glovo', 'Uber Eats']),
  fuel: cat('fuel', 'Gasolina', 'expense', ['Combustible', 'Gasolinera', 'Carburante']),
  transport: cat('transport', 'Transporte', 'expense', ['Transporte público', 'Taxi', 'Movilidad']),
  vehicle: cat('vehicle', 'Coche y moto', 'expense', ['Coche', 'Moto', 'Vehículo', 'Taller']),
  travel: cat('travel', 'Viajes', 'expense', ['Vacaciones', 'Viaje', 'Hoteles']),
  online: cat('online', 'Compras online', 'expense', ['Amazon', 'Compras', 'Online']),
  clothes: cat('clothes', 'Ropa y calzado', 'expense', ['Ropa', 'Moda']),
  tech: cat('tech', 'Tecnología', 'expense', ['Electrónica', 'Informática']),
  leisure: cat('leisure', 'Ocio y espectáculos', 'expense', ['Ocio', 'Entradas', 'Conciertos', 'Cine']),
  subscriptions: cat('subscriptions', 'Suscripciones', 'expense', ['Suscripción', 'Streaming']),
  health: cat('health', 'Salud', 'expense', ['Farmacia', 'Médico', 'Sanidad']),
  beauty: cat('beauty', 'Cuidado personal', 'expense', ['Belleza', 'Peluquería', 'Perfumería']),
  sport: cat('sport', 'Deporte', 'expense', ['Gimnasio', 'Gym', 'Deportes']),
  betting: cat('betting', 'Apuestas y juego', 'expense', ['Apuestas', 'Juego', 'Lotería']),
  home: cat('home', 'Hogar', 'expense', ['Casa', 'Vivienda', 'Alquiler', 'Bricolaje', 'Muebles']),
  bills: cat('bills', 'Suministros', 'expense', ['Luz', 'Agua', 'Gas', 'Teléfono', 'Internet', 'Facturas']),
  insurance: cat('insurance', 'Seguros', 'expense', ['Seguro']),
  education: cat('education', 'Educación', 'expense', ['Formación', 'Estudios', 'Cursos', 'Libros']),
  fees: cat('fees', 'Comisiones bancarias', 'expense', ['Comisiones', 'Banco']),
  taxes: cat('taxes', 'Impuestos y tasas', 'expense', ['Impuestos', 'Tasas', 'Multas']),
  gifts: cat('gifts', 'Regalos', 'expense', ['Regalo', 'Navidad']),
  bizumOut: cat('bizumOut', 'Bizum enviados', 'expense', ['Bizum', 'Pagos a amigos']),
  // Ingresos
  payroll: cat('payroll', 'Nómina', 'income', ['Nóminas', 'Sueldo', 'Salario', 'Trabajo']),
  work: cat('work', 'Trabajos y colaboraciones', 'income', ['Trabajos', 'Colaboraciones', 'Freelance', 'Otros trabajos']),
  taxRefund: cat('taxRefund', 'Devolución de Hacienda', 'income', ['Hacienda', 'Devolución IRPF', 'Renta']),
  interest: cat('interest', 'Intereses y rendimientos', 'income', ['Intereses', 'Rendimientos', 'Dividendos']),
  bizumIn: cat('bizumIn', 'Bizum recibidos', 'income', ['Bizum']),
  sales: cat('sales', 'Ventas de segunda mano', 'income', ['Ventas', 'Wallapop', 'Vinted']),
  refunds: cat('refunds', 'Devoluciones de compras', 'income', ['Devoluciones', 'Reembolsos', 'Reembolso']),
  winnings: cat('winnings', 'Premios de apuestas', 'income', ['Premios', 'Ganancias apuestas']),
  bonus: cat('bonus', 'Bonificaciones y promociones', 'income', ['Bonificaciones', 'Promociones', 'Cashback']),
  // Traspasos (dinero que cambia de bolsillo)
  ownTransfer: cat('ownTransfer', 'Traspasos entre mis cuentas', 'transfer', ['Traspasos', 'Traspaso']),
  savings: cat('savings', 'Ahorro e inversión', 'transfer', ['Inversión', 'Inversiones', 'Ahorro', 'Fondos']),
} satisfies Record<string, AutoCategory>

export type AutoKey = keyof typeof AUTO_CATEGORIES

/** «Compra En Amazon*Mk2» → « compra en amazon mk2 »: palabras sueltas, sin tildes ni símbolos, con espacios en los bordes. */
export function words(concept: string): string {
  return ` ${normalizeKey(concept)
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim()} `
}

/** Alguna de estas palabras o frases, enteras («bp» no casa con «bpm»). Admiten fragmentos de regex. */
const any = (...terms: string[]) => new RegExp(` (?:${terms.join('|')}) `)

/** Catálogo: el primero que casa gana, así que lo específico va antes que lo general. */
const CATALOG: [AutoKey, RegExp][] = [
  // Traspasos y ahorro
  [
    'savings',
    any(
      'myinvestor',
      'indexa',
      'indexa capital',
      'trade republic',
      'degiro',
      'interactive brokers',
      'bitpanda',
      'binance',
      'coinbase',
      'kraken',
      'finizens',
      'inbest',
      'openbank broker',
      'plan de pensiones',
      'fondo de inversion',
      'fondo',
      'fondos',
      'aportacion',
    ),
  ],
  [
    'ownTransfer',
    any(
      'revolut',
      'traspaso',
      'traspasos',
      'interna',
      'interno',
      'trans interna',
      'transferencia interna',
      'transferencia propia',
      'hucha',
      'entre cuentas',
      'mi cuenta',
      'n26',
      'wise',
      'paypal recarga',
    ),
  ],
  // Comida
  ['delivery', any('uber eats', 'eats', 'glovo', 'just eat', 'justeat', 'deliveroo', 'telepizza', 'dominos', 'domino s pizza')],
  [
    'supermarket',
    any(
      'mercadona',
      'carrefour',
      'lidl',
      'dia',
      'dia market',
      'alcampo',
      'mialcampo',
      'eroski',
      'aldi',
      'ahorramas',
      'hipercor',
      'supercor',
      'consum',
      'simply',
      'froiz',
      'gadis',
      'bonpreu',
      'condis',
      'caprabo',
      'masymas',
      'covirán',
      'coviran',
      'spar',
      'family cash',
      'lupa',
      'el arbol',
      'hiper',
      'supermercado',
      'supermercados',
      'super',
      'fruteria',
      'carniceria',
      'panaderia',
      'pescaderia',
      'mercado',
    ),
  ],
  // Movilidad
  [
    'fuel',
    any(
      'e s',
      'bp',
      'repsol',
      'cepsa',
      'moeve',
      'galp',
      'shell',
      'plenergy',
      'plenoil',
      'petroprix',
      'ballenoil',
      'petronor',
      'avia',
      'campsa',
      'disa',
      'meroil',
      'bonarea',
      'gasolinera',
      'gasolineras',
      'carburante',
      'carburantes',
      'estacion de servicio',
      'area de servicio',
    ),
  ],
  [
    'tech',
    any(
      'pccomponentes',
      'pc componentes',
      'media markt',
      'mediamarkt',
      'fnac',
      'worten',
      'apple store',
      'apple com store',
      'xiaomi',
      'samsung',
      'coolmod',
      'aussar',
      'game',
      'steam',
      'playstation',
      'nintendo',
      'xbox',
    ),
  ],
  [
    'travel',
    any(
      'booking',
      'booking com',
      'airbnb',
      'edreams',
      'expedia',
      'vueling',
      'ryanair',
      'iberia',
      'easyjet',
      'air europa',
      'volotea',
      'binter',
      'hotel',
      'hoteles',
      'hostal',
      'apartamentos',
      'viajes',
      'viaje',
      'ski',
      'forfait',
      'trainline',
      'aena',
      'aeropuerto',
      'aeroport',
      'rumbo',
      'logitravel',
      'destinia',
      'nh hotel',
      'melia',
      'parador',
    ),
  ],
  [
    'transport',
    any(
      'uber',
      'cabify',
      'bolt',
      'free now',
      'freenow',
      'taxi',
      'renfe',
      'ouigo',
      'iryo',
      'metro',
      'emt',
      'crtm',
      'alsa',
      'avanza',
      'blablacar',
      'parking',
      'aparcamiento',
      'empark',
      'telpark',
      'peaje',
      'autopista',
      'via t',
      'avis',
      'rent a car',
      'rent a c',
      'europcar',
      'sixt',
      'hertz',
      'goldcar',
      'wiber',
      'centauro',
      'enterprise',
      'zity',
      'share now',
      'cooltra',
      'acciona',
      'lime',
    ),
  ],
  [
    'vehicle',
    any(
      'taller',
      'talleres',
      'itv',
      'neumaticos',
      'norauto',
      'feu vert',
      'midas',
      'motor',
      'motos',
      'moto',
      'motozem',
      'recambios',
      'lavado',
      'autolavado',
      'concesionario',
      'dgt',
    ),
  ],
  // Compras
  [
    'subscriptions',
    any(
      'apple com bill',
      'itunes',
      'icloud',
      'netflix',
      'spotify',
      'hbo',
      'max',
      'disney',
      'disney plus',
      'prime video',
      'amazon prime',
      'youtube',
      'google',
      'google one',
      'openai',
      'chatgpt',
      'adobe',
      'microsoft',
      'ionos',
      'dazn',
      'filmin',
      'audible',
      'patreon',
      'twitch',
      'strava',
      'dropbox',
      'canva',
      'notion',
    ),
  ],
  ['online', any('amazon', 'amzn', 'aliexpress', 'alipay', 'shein', 'temu', 'ebay', 'klarna', 'zalando', 'miravia', 'wallapop envio')],
  [
    'clothes',
    any(
      'primark',
      'zara',
      'pull bear',
      'bershka',
      'stradivarius',
      'massimo dutti',
      'mango',
      'h m',
      'hm',
      'lefties',
      'nike',
      'nikepos',
      'adidas',
      'new balance',
      'puma',
      'jd sports',
      'foot locker',
      'footlocker',
      'futbolmania',
      'springfield',
      'cortefiel',
      'kiabi',
      'c a',
      'uniqlo',
      'vans',
      'zapatos',
      'zapateria',
      'urban rider',
    ),
  ],
  [
    'sport',
    any(
      'decathlon',
      'gimnasio',
      'gym',
      'basic fit',
      'basicfit',
      'mcfit',
      'altafit',
      'vivagym',
      'go fit',
      'padel',
      'bicicletas',
      'bicis',
      'ciclismo',
      'running',
      'sprinter',
      'forum sport',
      'uniforme arbitro',
      'arbitro',
    ),
  ],
  [
    'home',
    any(
      'ikea',
      'leroy merlin',
      'bricomart',
      'bricoman',
      'brico depot',
      'bricolaje',
      'aki',
      'conforama',
      'jysk',
      'maisons du monde',
      'zara home',
      'alquiler',
      'comunidad',
      'ferreteria',
      'muebles',
      'jardin',
      'vivero',
    ),
  ],
  [
    'bills',
    any(
      'iberdrola',
      'endesa',
      'naturgy',
      'holaluz',
      'totalenergies',
      'octopus',
      'canal de isabel',
      'canal isabel',
      'aguas',
      'agua',
      'gas natural',
      'vodafone',
      'movistar',
      'telefonica',
      'orange',
      'digi',
      'pepephone',
      'lowi',
      'simyo',
      'o2',
      'masmovil',
      'yoigo',
      'jazztel',
      'finetwork',
    ),
  ],
  [
    'insurance',
    any(
      'mutua',
      'mutua madrilena',
      'mapfre',
      'axa',
      'allianz',
      'linea directa',
      'generali',
      'reale',
      'zurich',
      'santalucia',
      'ocaso',
      'verti',
      'qualitas',
      'seguro',
      'seguros',
      'adeslas',
      'sanitas',
      'dkv',
      'asisa',
    ),
  ],
  [
    'health',
    any(
      'farmacia',
      'farmacias',
      'farmaciasdirect',
      'parafarmacia',
      'clinica',
      'clin',
      'dental',
      'dentista',
      'psicologia',
      'psicologo',
      'fisio',
      'fisioterapia',
      'medico',
      'hospital',
      'optica',
      'opticas',
      'ortopedia',
      'ortoprime',
      'podologo',
      'quiron',
      'vithas',
      'laboratorio',
      'analisis',
    ),
  ],
  ['beauty', any('peluqueria', 'barberia', 'barber', 'primor', 'druni', 'sephora', 'perfumeria', 'perfumerias', 'douglas', 'estetica', 'manicura', 'kiko')],
  [
    'leisure',
    any(
      'fever',
      'ticketswap',
      'ticketmaster',
      'entradas',
      'entradas com',
      'enterticket',
      'eventbrite',
      'dice',
      'cine',
      'cines',
      'yelmo',
      'cinesa',
      'kinepolis',
      'teatro',
      'concierto',
      'festival',
      'museo',
      'parque',
      'bolera',
      'karting',
      'escape',
      'discoteca',
      'sala',
      'tomorrowland',
    ),
  ],
  [
    'betting',
    any(
      'winamax',
      'bet365',
      'codere',
      'sportium',
      'bwin',
      'pokerstars',
      'william hill',
      'betfair',
      'luckia',
      'retabet',
      'kirolbet',
      'loterias',
      'loteria',
      'once',
      'casino',
    ),
  ],
  [
    'education',
    any('universidad', 'udemy', 'coursera', 'academia', 'curso', 'cursos', 'colegio', 'escuela', 'libreria', 'casa del libro', 'matricula', 'formacion'),
  ],
  ['fees', any('comision', 'comisiones', 'cuota tarjeta', 'cuota anual', 'mantenimiento cuenta', 'mantenimiento', 'descubierto', 'intereses deudores')],
  [
    'taxes',
    any(
      'aeat',
      'agencia tributaria',
      'hacienda',
      'impuesto',
      'impuestos',
      'ibi',
      'ivtm',
      'tasa',
      'tasas',
      'ayuntamiento',
      'multa',
      'tgss',
      'seguridad social',
      'autonomos',
    ),
  ],
  [
    'restaurants',
    any(
      'restaurante',
      'restaurant',
      'rest',
      'taberna',
      'meson',
      'bar',
      'bares',
      'cafeteria',
      'cafe',
      'cerveceria',
      'pizzeria',
      'burger',
      'burger king',
      'mcdonalds',
      'mc donalds',
      'kfc',
      'foster s',
      'vips',
      'tgi',
      '100 montaditos',
      'tapas',
      'sushi',
      'kebab',
      'asador',
      'grill',
      'brasa',
      'starbucks',
      'tasca',
      'bodega',
      'churreria',
      'heladeria',
      'pasteleria',
      'goiko',
      'five guys',
      'taco bell',
      'popeyes',
      'rodilla',
      'pans company',
    ),
  ],
  ['gifts', any('regalo', 'regalos', 'reyes', 'cumple', 'cumpleanos', 'navidad', 'floristeria', 'flores')],
]

/** Ingresos por concepto (antes de mirar si es un comercio que te devuelve algo). */
const NOMINA = any('nomina', 'nominas', 'salario', 'haberes', 'paga extra', 'paga extraordinaria')
const INCOME_CATALOG: [AutoKey, RegExp][] = [
  ['taxRefund', any('irpf', 'declaracion', 'devolucion renta', 'aeat', 'agencia tributaria', 'hacienda')],
  ['payroll', NOMINA],
  ['interest', any('intereses', 'interes', 'dividendo', 'dividendos', 'rendimiento', 'rendimientos', 'remuneracion', 'cupon')],
  ['sales', any('wallapop', 'vinted', 'mangopay', 'milanuncios', 'todocoleccion', 'ebay')],
  ['bonus', any('bonificacion', 'bonificaciones', 'cashback', 'promocion', 'recompensa', 'premio', 'campana fidelizacion')],
]

/** Bizum: lo que dice el concepto manda («Bizum - cena» va a restaurantes); si no dice nada útil, a Bizum. */
const BIZUM = any('bizum')
const BIZUM_HINTS: [AutoKey, RegExp][] = [
  [
    'restaurants',
    any('cena', 'cenas', 'comida', 'comidas', 'desayuno', 'cafe', 'cafes', 'cervezas', 'birras', 'copas', 'pizza', 'sushi', 'restaurante', 'bar'),
  ],
  ['fuel', any('gasolina', 'gasoil', 'diesel')],
  ['vehicle', any('coche', 'taller', 'bateria', 'itv', 'moto', 'ruedas')],
  ['gifts', any('regalo', 'regalos', 'reyes', 'cumple', 'cumpleanos', 'navidad', 'boda')],
  ['travel', any('viaje', 'hotel', 'apartamento', 'apartamentos', 'casa rural', 'vuelo', 'vuelos', 'billetes')],
  ['leisure', any('entrada', 'entradas', 'concierto', 'festival', 'cine', 'pulsera')],
  ['home', any('alquiler', 'luz', 'agua', 'piso', 'casa')],
]

/** Empresas: S.L., S.A., S.L.U., España, Consulting… (para reconocer a quien te paga). */
const COMPANY = any(
  's l',
  's l u',
  'sl',
  'slu',
  's a',
  's a u',
  'sa',
  'sau',
  'sociedad',
  'consulting',
  'consultores',
  'espana',
  'group',
  'grupo',
  'services',
  'servicios',
  'ltd',
  'limited',
  'gmbh',
  'inc',
  'bv',
  'sas',
  'srl',
  'federacion',
  'asociacion',
  'fundacion',
  'school',
  'universidad',
  'club',
  'ayuntamiento',
  'comunidad de madrid',
  'cooperativa',
)

/** Organismos y entidades que pagan trabajos (arbitrajes, clases, colaboraciones), aunque su nombre suene a tienda. */
const INSTITUTION = any('federacion', 'asociacion', 'fundacion', 'school', 'universidad', 'ayuntamiento', 'club', 'comunidad de madrid', 'cooperativa')

/** Palabras que nunca forman parte de un nombre de persona en un extracto. */
const NOT_NAME = new Set(
  'pago ingreso bizum compra transferencia transf trf traspaso recibo cargo abono devolucion tarjeta cajero cuenta periodica de del la el los las en y a s l sa sl slu con por para'.split(
    ' ',
  ),
)

/** Palabras de un concepto que parece un nombre de persona («Ana García López»): 2 a 4 palabras, solo letras. */
function personTokens(concept: string): string[] | undefined {
  const ws = words(concept)
    .trim()
    .split(' ')
    .filter((w) => !/\d/.test(w))
  if (ws.length < 2 || ws.length > 4) return undefined
  if (ws.some((w) => w.length < 2 || NOT_NAME.has(w))) return undefined
  if (COMPANY.test(` ${ws.join(' ')} `)) return undefined
  return ws
}

/** Lo que se aprende de tus propios movimientos antes de clasificar. */
export interface AutoContext {
  /** Tu nombre, en palabras: un movimiento a tu nombre es un traspaso entre tus cuentas. */
  selfTokens: string[]
  /** Quien te paga la nómina (dos primeras palabras del concepto). */
  payroll: Set<string>
  /** Empresas que te pagan algo que no es nómina (trabajos, colaboraciones…). */
  work: Set<string>
}

const payerKey = (concept: string) => words(concept).trim().split(' ').slice(0, 2).join(' ')

type Sample = Pick<Movement, 'concept' | 'amount' | 'date'>

/**
 * Pistas de tus propios datos:
 * - Tu nombre: el nombre de persona que aparece tanto en lo que entra como en lo que sale (te mandas dinero de una
 *   cuenta a otra). Se queda con las palabras comunes del par más repetido («Ana García» y «Ana García López» → ana garcia).
 * - Nómina: una empresa que te paga al menos tres meses distintos, con una mediana de 600 € o más.
 * - Trabajos: el resto de empresas que te pagan.
 */
export function autoContext(movements: Sample[]): AutoContext {
  const ins = new Map<string, { tokens: string[]; n: number }>()
  const outs = new Map<string, { tokens: string[]; n: number }>()
  const payers = new Map<string, { months: Set<string>; amounts: number[]; named: boolean }>()
  for (const m of movements) {
    if (BIZUM.test(words(m.concept))) continue
    const p = personTokens(m.concept)
    if (p) {
      const side = m.amount > 0 ? ins : outs
      const k = [...p].sort().join(' ')
      const e = side.get(k) ?? { tokens: p, n: 0 }
      e.n++
      side.set(k, e)
    }
    const w = words(m.concept)
    if (m.amount > 0 && (COMPANY.test(w) || NOMINA.test(w))) {
      const k = payerKey(m.concept)
      const e = payers.get(k) ?? { months: new Set(), amounts: [], named: false }
      e.months.add(m.date.slice(0, 7))
      e.amounts.push(m.amount)
      e.named ||= NOMINA.test(w)
      payers.set(k, e)
    }
  }
  let best: { tokens: string[]; n: number } | undefined
  for (const a of ins.values())
    for (const b of outs.values()) {
      const common = a.tokens.filter((t) => b.tokens.includes(t))
      const n = a.n + b.n
      if (common.length >= 2 && (!best || n > best.n || (n === best.n && common.length > best.tokens.length))) best = { tokens: common, n }
    }
  const payroll = new Set<string>()
  const work = new Set<string>()
  for (const [k, e] of payers) {
    const sorted = [...e.amounts].sort((x, y) => x - y)
    const median = sorted[Math.floor(sorted.length / 2)]
    if (e.named || (e.months.size >= 3 && median >= 600)) payroll.add(k)
    else work.add(k)
  }
  return { selfTokens: best?.tokens ?? [], payroll, work }
}

/**
 * Un movimiento a tu nombre: lleva todas las palabras de tu nombre y como mucho otra más (un segundo apellido, un
 * «Pago»…). «Uniforme árbitro + tu nombre» es una compra, no un traspaso.
 */
function isSelf(w: string, self: string[]): boolean {
  if (self.length < 2 || !self.every((t) => w.includes(` ${t} `))) return false
  const rest = w
    .trim()
    .split(' ')
    .filter((t) => !self.includes(t) && !/\d/.test(t) && !NOT_NAME.has(t))
  return rest.length <= 1
}

const EMPTY: AutoContext = { selfTokens: [], payroll: new Set(), work: new Set() }

const firstMatch = (list: [AutoKey, RegExp][], w: string) => list.find(([, re]) => re.test(w))?.[0]

/**
 * Categoría propuesta para un movimiento, o nada si no hay pista. Respeta el sentido del dinero: a lo que sale le
 * toca un gasto o un traspaso; a lo que entra, un ingreso o un traspaso (lo que te devuelve un comercio es una
 * devolución, no un gasto en positivo).
 */
export function classify(m: Pick<Movement, 'concept' | 'amount'>, ctx: AutoContext = EMPTY): AutoCategory | undefined {
  const w = words(m.concept)
  const out = m.amount < 0
  const pick = (k?: AutoKey) => (k ? AUTO_CATEGORIES[k] : undefined)
  // A tu nombre: de una cuenta tuya a otra.
  if (isSelf(w, ctx.selfTokens)) return AUTO_CATEGORIES.ownTransfer
  if (BIZUM.test(w)) return out ? pick(firstMatch(BIZUM_HINTS, w) ?? 'bizumOut') : AUTO_CATEGORIES.bizumIn
  const merchant = firstMatch(CATALOG, w)
  const kind = merchant && AUTO_CATEGORIES[merchant].kind
  if (out) return kind === 'expense' || kind === 'transfer' ? pick(merchant) : undefined
  // Lo que entra.
  if (kind === 'transfer') return pick(merchant)
  const income = firstMatch(INCOME_CATALOG, w)
  if (income) return pick(income)
  const payer = payerKey(m.concept)
  if (ctx.payroll.has(payer)) return AUTO_CATEGORIES.payroll
  if (INSTITUTION.test(w)) return AUTO_CATEGORIES.work
  // Lo que entra de una casa de apuestas son premios, no una devolución.
  if (merchant === 'betting') return AUTO_CATEGORIES.winnings
  if (kind === 'expense') return AUTO_CATEGORIES.refunds
  if (ctx.work.has(payer)) return AUTO_CATEGORIES.work
  return undefined
}

/** La categoría que ya tienes para una propuesta (mismo tipo y mismo nombre o un sinónimo), si la hay. */
export function findCategory(auto: AutoCategory, categories: Pick<Category, 'id' | 'name' | 'kind'>[]): string | undefined {
  const names = [auto.name, ...(auto.aliases ?? [])].map(normalizeKey)
  for (const n of names) {
    const c = categories.find((x) => x.kind === auto.kind && normalizeKey(x.name) === n)
    if (c) return c.id
  }
  return undefined
}

export interface AutoGroup {
  auto: AutoCategory
  /** Id de la categoría que ya existe, o nada si hay que crearla. */
  existingId?: string
  ids: string[]
  total: number
  /** Conceptos de ejemplo, los más repetidos. */
  samples: string[]
}

/**
 * Propuesta del botón «Asignar automáticamente»: solo movimientos del banco que siguen en las categorías de reserva
 * («Sin clasificar», «Otros ingresos»); lo que ya has clasificado tú no se toca.
 */
export function planAutoAssign(
  movements: Pick<Movement, 'id' | 'concept' | 'amount' | 'date' | 'categoryId' | 'source'>[],
  categories: Pick<Category, 'id' | 'name' | 'kind'>[],
  fallbackIds: string[],
): { groups: AutoGroup[]; pending: number; unresolved: number } {
  const ctx = autoContext(movements)
  const fallback = new Set(fallbackIds)
  const pending = movements.filter((m) => m.source === 'bank' && fallback.has(m.categoryId))
  const groups = new Map<string, AutoGroup & { counts: Map<string, number> }>()
  let unresolved = 0
  for (const m of pending) {
    const auto = classify(m, ctx)
    const existingId = auto && findCategory(auto, categories)
    if (!auto || (existingId && fallback.has(existingId))) {
      unresolved++
      continue
    }
    const g = groups.get(auto.key) ?? { auto, existingId, ids: [] as string[], total: 0, samples: [] as string[], counts: new Map<string, number>() }
    g.ids.push(m.id)
    g.total += m.amount
    g.counts.set(m.concept, (g.counts.get(m.concept) ?? 0) + 1)
    groups.set(auto.key, g)
  }
  const out = [...groups.values()].map(({ counts, ...g }) => ({
    ...g,
    total: Math.round(g.total * 100) / 100,
    samples: [...counts]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([c]) => c),
  }))
  out.sort((a, b) => b.ids.length - a.ids.length)
  return { groups: out, pending: pending.length, unresolved }
}
