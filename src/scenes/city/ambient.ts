export interface Ambient {
  ground: string
  ring: string
  slab: string
  dash: string
  park: string
  canopy: string
  trunk: string
  water: string
  bank: string
  pole: string
  bulb: string
  pool: string
  head: string
  tail: string
  roofItem: string
  antenna: string
  boat: string
  skyTop: string
  /** Horizonte: también es el color de la niebla, así el extrarradio se funde con el cielo. */
  horizon: string
  tones: string[]
  windows: [color: string, intensity: number]
  /** Multiplicador de las luces (>1 dispara el bloom en el tema oscuro). */
  glow: number
}

/** Colores de ambiente de la escena (no son colores de datos): noche neón y día polar. */
export const AMBIENT: Record<'dark' | 'light', Ambient> = {
  dark: {
    ground: '#0c0e15',
    ring: '#08090e',
    slab: '#12141c',
    dash: '#4b5066',
    park: '#0f2a1c',
    canopy: '#1f5c3b',
    trunk: '#2a2018',
    water: '#0b2240',
    bank: '#262a35',
    pole: '#2c303c',
    bulb: '#ffcf8a',
    pool: '#ffb35c',
    head: '#fff2d0',
    tail: '#ff2a2a',
    roofItem: '#5a6070',
    antenna: '#ff3344',
    boat: '#d9dce4',
    skyTop: '#03040a',
    horizon: '#101831',
    tones: ['#1a2030', '#1f2436', '#262033', '#1b262b', '#25242c'],
    windows: ['#ffd7a1', 0.8],
    glow: 3,
  },
  light: {
    ground: '#dde0e8',
    ring: '#c4c8d3',
    slab: '#e9ebf1',
    dash: '#ffffff',
    park: '#b5d6bd',
    canopy: '#5e9c6e',
    trunk: '#7a6150',
    water: '#8fbbe3',
    bank: '#bfc3cd',
    pole: '#7d8394',
    bulb: '#ffe2a8',
    pool: '#ffe2a8',
    head: '#fff7e0',
    tail: '#e0303a',
    roofItem: '#9aa0ad',
    antenna: '#e0303a',
    boat: '#ffffff',
    skyTop: '#bcd3f0',
    horizon: '#eef2f8',
    tones: ['#cfd4df', '#c6cbd7', '#d6d2dc', '#c8d3d6', '#d3d2d8'],
    windows: ['#fff3d6', 0.15],
    glow: 1,
  },
}

export const ambientFor = (dark: boolean): Ambient => (dark ? AMBIENT.dark : AMBIENT.light)
