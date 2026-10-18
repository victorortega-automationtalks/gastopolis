import { useEffect, useState } from 'react'
import { useSettings } from '../data/hooks'

export type ResolvedQuality = 'high' | 'low'

/** «Auto» baja a ligera en móviles y equipos modestos: sin sombras, sin bloom, resolución 1×. */
export function useQuality(): ResolvedQuality {
  const { quality } = useSettings()
  if (quality !== 'auto') return quality
  const nav = navigator as Navigator & { deviceMemory?: number }
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || matchMedia('(pointer: coarse)').matches
  const weak = (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4
  return mobile || weak ? 'low' : 'high'
}

export interface SceneColors {
  canvas: string
  ink: string
  inkMuted: string
  line: string
  accent: string
  accent2: string
  dark: boolean
}

function read(): SceneColors {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string) => css.getPropertyValue(name).trim()
  return {
    canvas: v('--canvas') || '#06070c',
    ink: v('--ink') || '#eef0ff',
    inkMuted: v('--ink-muted') || '#a3a8c3',
    line: v('--line-strong') || '#333',
    accent: v('--accent') || '#8b5cf6',
    accent2: v('--accent-2') || '#22d3ee',
    dark: document.documentElement.dataset.theme !== 'polar',
  }
}

/** Colores del tema para three.js; se releen cuando cambia `data-theme`. */
export function useSceneColors(): SceneColors {
  const [colors, setColors] = useState(read)
  useEffect(() => {
    const obs = new MutationObserver(() => setColors(read()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])
  return colors
}
