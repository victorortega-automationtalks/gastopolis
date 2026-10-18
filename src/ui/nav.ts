import { Building2, FlaskConical, LayoutDashboard, ListOrdered, Mountain, Radar, Scale, Settings, Shapes, Target, Waves, type LucideIcon } from 'lucide-react'
import type { Route } from '../store/ui'

export interface NavItem {
  route: Route
  label: string
  icon: LucideIcon
  /** Fase del plan en la que llega la pantalla. */
  phase: number
  blurb: string
  /** Si la barra superior muestra filtros de periodo/tipo/búsqueda. */
  filters: boolean
  /** Escena 3D: ocupa todo el área, sin márgenes, y elige su propio tipo de movimiento. */
  scene?: boolean
}

export const NAV: NavItem[] = [
  {
    route: 'inicio',
    label: 'Inicio',
    icon: LayoutDashboard,
    phase: 3,
    // El Inicio tiene su propio selector de mes.
    filters: false,
    blurb: 'Vista de pájaro: KPIs, mini-ciudad viva, presupuestos, fugas, objetivos y próximos cargos.',
  },
  {
    route: 'ciudad',
    scene: true,
    label: 'Ciudad',
    icon: Building2,
    phase: 2,
    filters: true,
    blurb: 'Treemap 3D: cada bloque es un gasto. Haz clic para entrar y ver el detalle, como WinDirStat.',
  },
  {
    route: 'cordillera',
    scene: true,
    label: 'Cordillera',
    icon: Mountain,
    phase: 3,
    filters: true,
    blurb: 'Relieve mes × categoría: los picos son los meses en los que una categoría se disparó.',
  },
  {
    route: 'balanza',
    scene: true,
    label: 'Balanza',
    icon: Scale,
    phase: 3,
    filters: true,
    blurb: 'Torres de ingresos, gastos y ahorro que crecen mes a mes con el deslizador temporal.',
  },
  {
    route: 'rio',
    label: 'Río',
    icon: Waves,
    phase: 5,
    filters: true,
    blurb: 'De dónde viene tu dinero y a dónde va: ingresos que se reparten en gastos, ahorro e inversión.',
  },
  { route: 'movimientos', label: 'Movimientos', icon: ListOrdered, phase: 1, filters: true, blurb: '' },
  { route: 'categorias', label: 'Categorías', icon: Shapes, phase: 1, filters: false, blurb: '' },
  {
    route: 'objetivos',
    label: 'Objetivos',
    icon: Target,
    phase: 4,
    filters: false,
    blurb: 'Metas de ahorro (vivienda, coche, colchón) con aportación necesaria, fecha estimada e hitos.',
  },
  {
    route: 'fugas',
    label: 'Fugas',
    icon: Radar,
    phase: 4,
    filters: false,
    blurb: 'Suscripciones olvidadas, subidas de tarifa, comisiones, duplicados y gasto hormiga.',
  },
  {
    route: 'laboratorio',
    label: 'Laboratorio',
    icon: FlaskConical,
    phase: 5,
    filters: false,
    blurb: 'Simula decisiones —recortar, cancelar, invertir— y mira cómo cambia tu futuro y tus objetivos.',
  },
  { route: 'ajustes', label: 'Ajustes', icon: Settings, phase: 1, filters: false, blurb: '' },
]

export const NAV_GROUPS: { label: string; routes: Route[] }[] = [
  { label: 'Explorar', routes: ['inicio', 'ciudad', 'cordillera', 'balanza', 'rio'] },
  { label: 'Gestionar', routes: ['movimientos', 'categorias'] },
  { label: 'Planificar', routes: ['objetivos', 'fugas', 'laboratorio'] },
]

export const navItem = (r: Route) => NAV.find((n) => n.route === r)!

/** Fase hasta la que hay pantallas construidas. */
export const CURRENT_PHASE = 4
