import { paletteColor } from '../lib/color'
import { normalizeKey } from '../lib/text'
import { isoOf } from '../model/period'
import type { Category, Kind, Movement } from '../model/types'

/**
 * Datos de ejemplo inventados: 18 meses de una persona con nómina, alquiler, suscripciones y algo de caos.
 * Llevan a propósito fugas para el detector: Spotify sube de precio, una comisión trimestral del banco,
 * un gimnasio que se sigue pagando y un cargo duplicado.
 */

type CatDef = [id: string, name: string, kind: Kind, icon: string, parent?: string, budget?: number]

const CATS: CatDef[] = [
  ['hogar', 'Hogar', 'expense', 'House'],
  ['alquiler', 'Alquiler', 'expense', 'House', 'hogar'],
  ['luz', 'Luz', 'expense', 'Zap', 'hogar', 60],
  ['internet', 'Internet y móvil', 'expense', 'Wifi', 'hogar'],
  ['comida', 'Alimentación', 'expense', 'ShoppingCart'],
  ['super', 'Supermercado', 'expense', 'ShoppingCart', 'comida', 300],
  ['cafe', 'Cafés y snacks', 'expense', 'Coffee', 'comida', 40],
  ['transporte', 'Transporte', 'expense', 'Car'],
  ['gasolina', 'Gasolina', 'expense', 'Fuel', 'transporte', 150],
  ['seguro', 'Seguro coche', 'expense', 'Shield', 'transporte'],
  ['ocio', 'Ocio', 'expense', 'Sparkles'],
  ['restaurantes', 'Restaurantes', 'expense', 'UtensilsCrossed', 'ocio', 120],
  ['suscripciones', 'Suscripciones', 'expense', 'Repeat', 'ocio'],
  ['viajes', 'Viajes', 'expense', 'Plane', 'ocio'],
  ['videojuegos', 'Videojuegos', 'expense', 'Gamepad2', 'ocio'],
  ['compras', 'Compras', 'expense', 'Package'],
  ['ropa', 'Ropa', 'expense', 'Shirt', 'compras', 80],
  ['electronica', 'Electrónica', 'expense', 'Cpu', 'compras'],
  ['regalos', 'Regalos', 'expense', 'Gift', 'compras'],
  ['salud', 'Salud', 'expense', 'Stethoscope'],
  ['gimnasio', 'Gimnasio', 'expense', 'Dumbbell', 'salud'],
  ['farmacia', 'Farmacia', 'expense', 'Pill', 'salud'],
  ['banco', 'Comisiones', 'expense', 'Landmark'],
  ['nomina', 'Nómina', 'income', 'Briefcase'],
  ['extra', 'Pagas extra', 'income', 'Briefcase'],
  ['ventas', 'Venta 2ª mano', 'income', 'Tag'],
  ['ahorro', 'Ahorro', 'transfer', 'PiggyBank'],
  ['inversion', 'Inversión', 'transfer', 'TrendingUp'],
]

/** PRNG determinista para que el ejemplo sea siempre el mismo. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function buildSample(now = new Date()): { categories: Category[]; movements: Movement[] } {
  const rnd = mulberry32(20250703)
  const between = (a: number, b: number) => Math.round((a + rnd() * (b - a)) * 100) / 100
  const pick = <T>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]

  const categories: Category[] = CATS.map(([id, name, kind, icon, parent, budget], i) => ({
    id: `sample-${id}`,
    name,
    kind,
    icon,
    parentId: parent ? `sample-${parent}` : null,
    color: paletteColor(i),
    budgetMonthly: budget,
    order: i,
  }))
  const kindOf = new Map(categories.map((c) => [c.id, c.kind]))

  const movements: Movement[] = []
  let seq = 0
  const end = isoOf(now)
  const add = (date: Date, cat: string, concept: string, amount: number, notes?: string) => {
    const iso = isoOf(date)
    if (iso > end) return
    const categoryId = `sample-${cat}`
    const kind = kindOf.get(categoryId)!
    movements.push({
      id: `sample-m${seq++}`,
      date: iso,
      amount: kind === 'expense' ? -Math.abs(amount) : amount,
      kind,
      concept,
      conceptKey: normalizeKey(concept),
      categoryId,
      tags: [],
      notes,
      source: 'sample',
      createdAt: 0,
    })
  }

  const start = new Date(now.getFullYear(), now.getMonth() - 17, 1)
  for (let mi = 0; mi < 18; mi++) {
    const y = start.getFullYear()
    const m = start.getMonth() + mi
    const lastDay = new Date(y, m + 1, 0).getDate()
    const day = (d: number) => new Date(y, m, Math.min(d, lastDay))
    const monthIndex = new Date(y, m, 1).getMonth()

    // Ingresos
    add(day(28), 'nomina', 'Nómina Acme S.L.', mi < 10 ? 1850 : 1920)
    if (monthIndex === 5 || monthIndex === 11) add(day(20), 'extra', 'Paga extra', 1850)
    if (rnd() < 0.25)
      add(day(Math.ceil(rnd() * 27)), 'ventas', pick(['Wallapop: bici', 'Wallapop: monitor', 'Vinted: chaqueta', 'Wallapop: consola']), between(20, 140))

    // Fijos
    add(day(1), 'alquiler', 'Alquiler piso', 690)
    add(day(5), 'luz', 'Iberdrola', between(38, monthIndex >= 5 && monthIndex <= 8 ? 92 : 64))
    add(day(7), 'internet', 'Digi fibra + móvil', 30)
    add(day(1), 'suscripciones', 'Spotify', mi < 9 ? 10.99 : 11.99)
    add(day(3), 'suscripciones', 'Netflix', 13.99)
    add(day(12), 'suscripciones', 'iCloud+', 2.99)
    if (mi >= 6) add(day(15), 'suscripciones', 'Disney+', 9.99)
    add(day(2), 'gimnasio', 'Basic-Fit', 29.99)
    if (mi % 3 === 0) add(day(30), 'banco', 'Comisión mantenimiento cuenta', 18)
    if (monthIndex === 2) add(day(10), 'seguro', 'Mapfre seguro coche', 412.5)

    // Ahorro
    add(day(29), 'ahorro', 'Traspaso a cuenta ahorro', -300)
    add(day(29), 'inversion', 'Aportación fondo indexado', -100)
    if (mi === 13) add(day(10), 'ahorro', 'Retiro ahorro (viaje)', 600)

    // Variables
    for (let w = 0; w < 4; w++)
      add(day(3 + w * 7 + Math.floor(rnd() * 3)), 'super', pick(['Mercadona', 'Mercadona', 'Lidl', 'Carrefour', 'Alcampo']), between(28, 96))
    for (let k = 0; k < 3; k++) add(day(2 + k * 10 + Math.floor(rnd() * 5)), 'gasolina', pick(['Repsol', 'Cepsa', 'Galp']), between(45, 72))
    const cafes = 6 + Math.floor(rnd() * 10)
    for (let k = 0; k < cafes; k++)
      add(day(1 + Math.floor(rnd() * 28)), 'cafe', pick(['Café bar Luna', 'Starbucks', 'Máquina vending', 'Panadería']), between(1.3, 4.8))
    const dinners = 2 + Math.floor(rnd() * 4)
    for (let k = 0; k < dinners; k++)
      add(day(1 + Math.floor(rnd() * 28)), 'restaurantes', pick(['Casa Julián', 'Sushi Kyoto', 'La Tagliatella', 'Burger', 'Tapas El Rincón']), between(14, 58))
    if (rnd() < 0.6) add(day(1 + Math.floor(rnd() * 28)), 'ropa', pick(['Zara', 'Decathlon', 'Pull&Bear', 'Zapatillas running']), between(19, 110))
    if (rnd() < 0.5) add(day(1 + Math.floor(rnd() * 28)), 'videojuegos', pick(['Steam', 'PlayStation Store', 'Clash of Clans']), between(3.99, 59.99))
    if (rnd() < 0.3) add(day(1 + Math.floor(rnd() * 28)), 'farmacia', 'Farmacia', between(6, 32))
    if (rnd() < 0.2)
      add(day(1 + Math.floor(rnd() * 28)), 'electronica', pick(['MediaMarkt: auriculares', 'Amazon: SSD', 'PcComponentes: teclado']), between(35, 160))
    if (monthIndex === 11) {
      add(day(18), 'regalos', 'Regalos Navidad', between(140, 260))
      add(day(22), 'regalos', 'Amigo invisible', 25)
    }
    if (monthIndex === 7) {
      add(day(4), 'viajes', 'Vuelos Lisboa', between(160, 240))
      add(day(9), 'viajes', 'Hotel Lisboa', between(320, 420))
      add(day(11), 'viajes', 'Cenas Lisboa', between(90, 150))
    }
    if (mi === 13) add(day(14), 'viajes', 'Escapada Picos de Europa', 540)
    if (mi === 4) add(day(8), 'electronica', 'Portátil nuevo', 899)
  }

  // Cargo duplicado: dos veces el mismo pedido.
  const dup = new Date(now.getFullYear(), now.getMonth() - 2, 14)
  add(dup, 'electronica', 'Amazon: cargador USB-C', 24.99)
  add(new Date(dup.getFullYear(), dup.getMonth(), dup.getDate() + 1), 'electronica', 'Amazon: cargador USB-C', 24.99)

  movements.sort((a, b) => a.date.localeCompare(b.date))
  return { categories, movements }
}
