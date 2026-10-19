import { normalizeKey } from '../lib/text'
import type { Kind, Settings } from './types'

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  currency: 'EUR',
  locale: 'es-ES',
  fiscalYearStart: 1,
  theme: 'neon',
  quality: 'auto',
}

/** Categorías que, aunque vengan como gasto o ingreso, son dinero que cambia de bolsillo. */
const TRANSFER_WORDS = ['ahorro', 'ahorros', 'cryptos', 'crypto', 'criptos', 'cripto', 'inversion', 'inversiones', 'traspaso', 'transferencia propia', 'fondo', 'fondos', 'bolsa']

export function looksLikeTransfer(categoryName: string): boolean {
  const k = normalizeKey(categoryName)
  return TRANSFER_WORDS.some((w) => k === w || k.startsWith(w + ' '))
}

/** Icono por palabra clave. El primer patrón que encaja gana. */
const ICON_GUESSES: [RegExp, string][] = [
  [/gasolin|combustib|repsol|cepsa|diesel/, 'Fuel'],
  [/super|mercado|alcampo|mercadona|carrefour|lidl|dia\b|comida|alimenta/, 'ShoppingCart'],
  [/restaur|bar\b|bares|cena|tapas|comer fuera/, 'UtensilsCrossed'],
  [/cafe/, 'Coffee'],
  [/ropa|zapat|moda/, 'Shirt'],
  [/electron|tecnolog|informatica|pc\b/, 'Cpu'],
  [/movil|telefon/, 'Smartphone'],
  [/viaje|vacacion|hotel|vuelo/, 'Plane'],
  [/videojuego|juego|gaming|steam/, 'Gamepad2'],
  [/medicin|farmac/, 'Pill'],
  [/medic|salud|dentist/, 'Stethoscope'],
  [/peluquer|barber/, 'Scissors'],
  [/libro/, 'BookOpen'],
  [/amazon|paquete|online/, 'Package'],
  [/navidad|regalo/, 'Gift'],
  [/cumple/, 'Cake'],
  [/novi|pareja/, 'Heart'],
  [/mama|papa|familia|padres/, 'Users'],
  [/loter|euromill|primitiva/, 'Ticket'],
  [/apuesta|casino|bet/, 'Dices'],
  [/crypto|cripto|bitcoin/, 'Bitcoin'],
  [/ahorro/, 'PiggyBank'],
  [/inversion|bolsa|fondo/, 'TrendingUp'],
  [/nomina|sueldo|salario|paga|decathlon|trabajo/, 'Briefcase'],
  [/venta|2mano|segunda mano|wallapop/, 'Tag'],
  [/coche|taller|itv|parking/, 'Car'],
  [/grado|estudio|universidad|curso|master|formacion/, 'GraduationCap'],
  [/perfum/, 'SprayCan'],
  [/cosmet|maquilla|belleza/, 'Sparkles'],
  [/casa|alquiler|hipoteca|vivienda/, 'House'],
  [/luz|electricidad/, 'Zap'],
  [/internet|fibra|wifi/, 'Wifi'],
  [/gimnas|gym|deporte/, 'Dumbbell'],
  [/musica|spotify/, 'Music'],
  [/netflix|hbo|streaming|tv/, 'Tv'],
  [/cine|pelicula/, 'Film'],
  [/transporte|bus|metro/, 'Bus'],
  [/tren|renfe/, 'TrainFront'],
  [/mascota|perro|gato/, 'PawPrint'],
  [/banco|comision/, 'Landmark'],
  [/seguro/, 'Shield'],
  [/agua/, 'Droplets'],
  [/gas\b/, 'Flame'],
  [/devoluc|reembolso/, 'Receipt'],
]

export function guessIcon(name: string, kind: Kind): string {
  const k = normalizeKey(name)
  for (const [re, icon] of ICON_GUESSES) if (re.test(k)) return icon
  return kind === 'income' ? 'HandCoins' : kind === 'transfer' ? 'ArrowLeftRight' : 'CircleDashed'
}

export const KIND_LABEL: Record<Kind, string> = {
  expense: 'Gasto',
  income: 'Ingreso',
  transfer: 'Transferencia',
}

export const KIND_LABEL_PLURAL: Record<Kind, string> = {
  expense: 'Gastos',
  income: 'Ingresos',
  transfer: 'Transferencias',
}
