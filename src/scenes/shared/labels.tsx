import { useFrame } from '@react-three/fiber'
import { useCallback } from 'react'
import * as THREE from 'three'
import { CategoryIcon } from '../../ui/icons'

export interface LabelSpec {
  id: string
  pos: [number, number, number]
  color: string
  title: string
  value: string
  sub?: string
  icon?: string
  /** El de foco (hover/selección) va encima de su punto y nunca se oculta. */
  focus?: boolean
  /** Rótulo pequeño de eje (meses, por ejemplo): solo texto, sin tarjeta. */
  axis?: boolean
}

const projected = new THREE.Vector3()

/**
 * Coloca los rótulos DOM proyectando su punto 3D cada fotograma (escribe `transform` directamente, sin render de
 * React) y oculta los que chocarían con otro más importante. Los primeros de la lista tienen prioridad.
 */
export function LabelProjector({ specs, els }: { specs: LabelSpec[]; els: Map<string, HTMLDivElement> }) {
  useFrame(({ camera, size }) => {
    const placed: { x: number; y: number; w: number; h: number }[] = []
    for (const s of specs) {
      const el = els.get(s.id)
      if (!el) continue
      projected.set(...s.pos).project(camera)
      if (projected.z > 1 || Math.abs(projected.x) > 1.1 || Math.abs(projected.y) > 1.1) {
        el.style.visibility = 'hidden'
        continue
      }
      const w = Number(el.dataset.w) || ((el.dataset.w = String(el.offsetWidth)), el.offsetWidth)
      const h = Number(el.dataset.h) || ((el.dataset.h = String(el.offsetHeight)), el.offsetHeight)
      const cx = ((projected.x + 1) / 2) * size.width
      const cy = ((1 - projected.y) / 2) * size.height
      // Dentro de la pantalla aunque el punto quede cerca del borde.
      const x = Math.min(Math.max(cx - w / 2, 4), size.width - w - 4)
      const r = { x, y: s.focus ? cy - h - 6 : cy - h / 2, w, h }
      const hit = placed.some((p) => r.x < p.x + p.w + 4 && r.x + r.w + 4 > p.x && r.y < p.y + p.h + 2 && r.y + r.h + 2 > p.y)
      if (hit && !s.focus) {
        el.style.visibility = 'hidden'
        continue
      }
      placed.push(r)
      el.style.visibility = 'visible'
      el.style.transform = `translate3d(${r.x.toFixed(1)}px, ${r.y.toFixed(1)}px, 0)`
    }
  })
  return null
}

export function LabelLayer({ specs, els }: { specs: LabelSpec[]; els: Map<string, HTMLDivElement> }) {
  const register = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      if (el) els.set(id, el)
      else els.delete(id)
    },
    [els],
  )
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {specs.map((s) =>
        s.axis ? (
          <div
            key={s.id}
            ref={register(s.id)}
            className="absolute top-0 left-0 rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-white/75 backdrop-blur-sm"
            style={{ visibility: 'hidden' }}
          >
            {s.title}
          </div>
        ) : s.focus ? (
          <div
            key={s.id}
            ref={register(s.id)}
            className="absolute top-0 left-0 z-20 rounded-xl border border-white/15 bg-black/75 px-3 py-2 text-xs whitespace-nowrap text-white shadow-2xl backdrop-blur"
            style={{ visibility: 'hidden' }}
          >
            <div className="flex max-w-56 items-center gap-1.5 truncate font-semibold">
              {s.icon ? (
                <CategoryIcon name={s.icon} size={13} className="shrink-0" />
              ) : (
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
              )}
              {s.title}
            </div>
            <div className="num mt-0.5 text-sm">{s.value}</div>
            {s.sub && <div className="text-white/60">{s.sub}</div>}
          </div>
        ) : (
          // Rótulo de barrio: icono en su color, nombre e «importe · %», como un cartel flotante.
          <div
            key={s.id}
            ref={register(s.id)}
            className="absolute top-0 left-0 flex items-center gap-2 rounded-xl border border-white/12 bg-black/60 py-1.5 pr-3 pl-1.5 whitespace-nowrap text-white shadow-[0_8px_24px_-8px_rgba(0,0,0,0.8)] backdrop-blur-md"
            style={{ visibility: 'hidden', boxShadow: `0 0 0 1px ${s.color}40, 0 8px 24px -8px rgba(0,0,0,.8)` }}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: `${s.color}33`, color: s.color }}>
              {s.icon ? <CategoryIcon name={s.icon} size={15} /> : <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />}
            </span>
            <span className="leading-tight">
              <span className="block max-w-36 truncate text-[12px] font-semibold">{s.title}</span>
              <span className="num block text-[11px] text-white/70">
                {s.value}
                {s.sub && <span className="text-white/45"> · {s.sub}</span>}
              </span>
            </span>
          </div>
        ),
      )}
    </div>
  )
}
