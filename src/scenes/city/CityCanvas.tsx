import { CameraControls, Grid, useCursor } from '@react-three/drei'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type ComponentRef } from 'react'
import * as THREE from 'three'
import { shade } from '../../lib/color'
import { fmtDate, fmtMoney } from '../../model/format'
import type { CityNode } from '../../model/hierarchy'
import type { ResolvedQuality, SceneColors } from '../common'
import { baseY, PLINTH_H, type Block, type CityLayout } from './layout'
import { createWindowMaterial } from './windowMaterial'

export interface CityCanvasProps {
  layout: CityLayout
  selectedId: string | null
  hoveredId: string | null
  quality: ResolvedQuality
  colors: SceneColors
  currency: string
  locale: string
  /** Cambia al recentrar o al cambiar de vista: la cámara vuelve a encuadrar. */
  frameKey: string
  onHover: (id: string | null) => void
  onSelect: (node: CityNode | null) => void
  onEnter: (node: CityNode) => void
}

const ROOF = 0.14
const GROW_SECONDS = 0.9
const tmp = new THREE.Object3D()
const col = new THREE.Color()
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Clic «de verdad»: si el puntero se movió es que se estaba girando la cámara. */
const isClick = (e: ThreeEvent<MouseEvent>) => e.delta < 5

function groupOf(layout: CityLayout, b: Block): string | null {
  return b.district >= 0 ? layout.districts[b.district].node.id : null
}

function Buildings({
  layout,
  selectedId,
  hoveredId,
  colors,
  onHover,
  onSelect,
  onEnter,
}: Omit<CityCanvasProps, 'quality' | 'currency' | 'locale' | 'frameKey'>) {
  const body = useRef<THREE.InstancedMesh>(null!)
  const roof = useRef<THREE.InstancedMesh>(null!)
  const n = layout.buildings.length
  const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), [])
  const material = useMemo(() => createWindowMaterial(colors.dark ? '#ffd7a1' : '#fff3d6', colors.dark ? 1.25 : 0.35), [colors.dark])
  const roofMat = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), [])
  const anim = useRef({ start: -1, running: true })
  const delays = useMemo(() => {
    const max = layout.size * 0.71
    return layout.buildings.map((b) => (Math.hypot(b.x, b.z) / max) * 0.45)
  }, [layout])

  useEffect(() => () => material.dispose(), [material])

  useLayoutEffect(() => {
    anim.current = { start: -1, running: true }
  }, [layout])

  useLayoutEffect(() => {
    if (!body.current || !roof.current) return
    const focus = selectedId ?? null
    layout.buildings.forEach((b, i) => {
      const group = groupOf(layout, b)
      const sel = focus != null && (b.node.id === focus || group === focus)
      const hov = hoveredId != null && (b.node.id === hoveredId || group === hoveredId)
      const dim = focus != null && !sel && !hov
      const wall = hov || sel ? shade(b.color, 0.12) : dim ? shade(b.color, -0.7) : shade(b.color, -0.18)
      body.current.setColorAt(i, col.set(wall))
      // Tejados fuera de gama (>1) a propósito: el bloom solo recoge lo que supera el umbral.
      col.set(hov || sel ? shade(b.color, 0.45) : dim ? shade(b.color, -0.6) : shade(b.color, -0.05))
      roof.current.setColorAt(i, colors.dark && !dim ? col.multiplyScalar(hov || sel ? 2.2 : 1.05) : col)
    })
    if (body.current.instanceColor) body.current.instanceColor.needsUpdate = true
    if (roof.current.instanceColor) roof.current.instanceColor.needsUpdate = true
  }, [layout, selectedId, hoveredId, colors.dark])

  useFrame(({ clock }) => {
    const a = anim.current
    if (!a.running || !body.current || !roof.current) return
    if (a.start < 0) a.start = clock.elapsedTime
    const t = reducedMotion() ? 1e9 : clock.elapsedTime - a.start
    let done = true
    layout.buildings.forEach((b, i) => {
      const p = Math.min(1, Math.max(0, (t - delays[i]) / GROW_SECONDS))
      if (p < 1) done = false
      const y0 = baseY(b)
      const h = Math.max(0.001, b.h * easeOut(p))
      tmp.position.set(b.x, y0, b.z)
      tmp.scale.set(b.w, h, b.d)
      tmp.updateMatrix()
      body.current.setMatrixAt(i, tmp.matrix)
      // Tejado algo metido: deja un borde oscuro y no se convierte en una losa de color en los edificios grandes.
      const inset = Math.min(0.5, Math.min(b.w, b.d) * 0.08)
      tmp.position.set(b.x, y0 + h, b.z)
      tmp.scale.set(Math.max(0.02, b.w - 2 * inset), ROOF, Math.max(0.02, b.d - 2 * inset))
      tmp.updateMatrix()
      roof.current.setMatrixAt(i, tmp.matrix)
    })
    body.current.instanceMatrix.needsUpdate = true
    roof.current.instanceMatrix.needsUpdate = true
    if (done) {
      a.running = false
      body.current.computeBoundingSphere()
      body.current.computeBoundingBox()
    }
  })

  const nodeAt = (e: ThreeEvent<PointerEvent | MouseEvent>) => (e.instanceId != null ? layout.buildings[e.instanceId]?.node : undefined)

  return (
    <>
      <instancedMesh
        ref={body}
        args={[geo, material, n]}
        castShadow
        receiveShadow
        onPointerMove={(e) => {
          e.stopPropagation()
          const node = nodeAt(e)
          if (node && node.id !== hoveredId) onHover(node.id)
        }}
        onPointerOut={() => onHover(null)}
        onClick={(e) => {
          e.stopPropagation()
          const node = nodeAt(e)
          if (node && isClick(e)) onSelect(node)
        }}
        onDoubleClick={(e) => {
          e.stopPropagation()
          const node = nodeAt(e)
          if (node) onEnter(node)
        }}
      />
      <instancedMesh ref={roof} args={[geo, roofMat, n]} raycast={() => null} />
    </>
  )
}

function Districts({
  layout,
  hoveredId,
  selectedId,
  colors,
  onHover,
  onEnter,
}: Pick<CityCanvasProps, 'layout' | 'hoveredId' | 'selectedId' | 'colors' | 'onHover' | 'onEnter'>) {
  const mesh = useRef<THREE.InstancedMesh>(null!)
  const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), [])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 }), [])
  const n = layout.districts.length

  useLayoutEffect(() => {
    if (!mesh.current) return // sin distritos no se pinta la malla
    layout.districts.forEach((d, i) => {
      tmp.position.set(d.x, 0, d.z)
      tmp.scale.set(d.w, PLINTH_H, d.d)
      tmp.updateMatrix()
      mesh.current.setMatrixAt(i, tmp.matrix)
      const active = d.node.id === hoveredId || d.node.id === selectedId
      mesh.current.setColorAt(i, col.set(shade(d.color, colors.dark ? (active ? -0.35 : -0.62) : active ? 0.45 : 0.7)))
    })
    mesh.current.instanceMatrix.needsUpdate = true
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true
    mesh.current.computeBoundingSphere()
  }, [layout, hoveredId, selectedId, colors.dark])

  if (!n) return null
  return (
    <instancedMesh
      ref={mesh}
      args={[geo, mat, n]}
      receiveShadow
      onPointerMove={(e) => {
        e.stopPropagation()
        const d = e.instanceId != null ? layout.districts[e.instanceId] : undefined
        if (d && d.node.id !== hoveredId) onHover(d.node.id)
      }}
      onPointerOut={() => onHover(null)}
      onClick={(e) => {
        e.stopPropagation()
        const d = e.instanceId != null ? layout.districts[e.instanceId] : undefined
        if (d && isClick(e)) onEnter(d.node)
      }}
    />
  )
}

interface LabelSpec {
  id: string
  pos: [number, number, number]
  color: string
  title: string
  value: string
  sub?: string
  /** El de foco (hover/selección) va encima de su edificio y nunca se oculta. */
  focus?: boolean
}

function useLabelSpecs({
  layout,
  hoveredId,
  selectedId,
  quality,
  currency,
  locale,
}: Pick<CityCanvasProps, 'layout' | 'hoveredId' | 'selectedId' | 'quality' | 'currency' | 'locale'>): LabelSpec[] {
  return useMemo(() => {
    const area = layout.size * layout.size
    const max = quality === 'high' ? 24 : 12
    const withDistricts = layout.districts.length > 0
    // Rótulos de distrito (o de los edificios más grandes si no hay distritos), por tamaño.
    const fixed: LabelSpec[] = (withDistricts ? layout.districts : layout.buildings)
      .filter((b) => (b.w * b.d) / area > 0.008)
      .slice(0, max)
      .map((b) => ({
        id: b.node.id,
        pos: withDistricts ? [b.x, PLINTH_H, b.z + b.d / 2] : [b.x, baseY(b) + b.h + 0.4, b.z],
        color: b.color,
        title: b.node.label,
        value: fmtMoney(b.node.value, { currency, locale, compact: true }),
      }))
    const focusId = hoveredId ?? selectedId
    const focus = layout.buildings.find((b) => b.node.id === focusId)
    if (focus) {
      fixed.unshift({
        id: `focus:${focus.node.id}`,
        pos: [focus.x, baseY(focus) + focus.h + 0.3, focus.z],
        color: focus.color,
        title: focus.node.label,
        value: fmtMoney(focus.node.value, { currency, locale }),
        sub: focus.node.movement ? fmtDate(focus.node.movement.date) : `${focus.node.count} ${focus.node.count === 1 ? 'movimiento' : 'movimientos'}`,
        focus: true,
      })
    }
    return fixed
  }, [layout, hoveredId, selectedId, quality, currency, locale])
}

const projected = new THREE.Vector3()

/**
 * Coloca los rótulos DOM proyectando su punto 3D cada fotograma (escribe `transform` directamente, sin render de
 * React) y oculta los que chocarían con otro más importante. Los primeros de la lista tienen prioridad.
 */
function LabelProjector({ specs, els }: { specs: LabelSpec[]; els: Map<string, HTMLDivElement> }) {
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

function LabelLayer({ specs, els }: { specs: LabelSpec[]; els: Map<string, HTMLDivElement> }) {
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
        s.focus ? (
          <div
            key={s.id}
            ref={register(s.id)}
            className="absolute top-0 left-0 z-20 rounded-xl border border-white/15 bg-black/75 px-3 py-2 text-xs whitespace-nowrap text-white shadow-2xl backdrop-blur"
            style={{ visibility: 'hidden' }}
          >
            <div className="flex max-w-56 items-center gap-1.5 truncate font-semibold">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
              {s.title}
            </div>
            <div className="num mt-0.5 text-sm">{s.value}</div>
            {s.sub && <div className="text-white/60">{s.sub}</div>}
          </div>
        ) : (
          <div
            key={s.id}
            ref={register(s.id)}
            className="absolute top-0 left-0 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/55 px-2 py-0.5 text-[11px] whitespace-nowrap text-white shadow-lg backdrop-blur-sm"
            style={{ visibility: 'hidden' }}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            <span className="max-w-36 truncate font-medium">{s.title}</span>
            <span className="num text-white/70">{s.value}</span>
          </div>
        ),
      )}
    </div>
  )
}

function Rig({ layout, frameKey }: { layout: CityLayout; frameKey: string }) {
  const controls = useRef<ComponentRef<typeof CameraControls>>(null)
  const first = useRef(true)
  const size = useThree((s) => s.size)

  useEffect(() => {
    const c = controls.current
    if (!c) return
    const maxH = Math.max(4, ...layout.buildings.map((b) => baseY(b) + b.h))
    const half = layout.size / 2
    const box = new THREE.Box3(new THREE.Vector3(-half, 0, -half), new THREE.Vector3(half, maxH, half))
    if (first.current) {
      first.current = false
      void c.rotateTo(Math.PI / 5, 0.95, false)
    } else {
      // Pequeño giro en cada cambio de vista para que se note que «entras».
      void c.rotate(-0.25, 0, true)
    }
    const portrait = size.height > size.width
    void c.fitToBox(box, true, { paddingTop: 4, paddingBottom: portrait ? 8 : 6, paddingLeft: 4, paddingRight: 4 })
  }, [frameKey, layout, size.width, size.height])

  return (
    <CameraControls ref={controls} makeDefault minPolarAngle={0.12} maxPolarAngle={1.32} minDistance={12} maxDistance={420} dollyToCursor smoothTime={0.35} />
  )
}

export function CityCanvas(props: CityCanvasProps) {
  const { layout, quality, colors, frameKey } = props
  const high = quality === 'high'
  const hovering = props.hoveredId != null
  useCursor(hovering)
  const specs = useLabelSpecs(props)
  const labelEls = useMemo(() => new Map<string, HTMLDivElement>(), [])

  return (
    <div className="absolute inset-0">
      <Canvas
        shadows={high ? 'percentage' : false}
        dpr={high ? [1, 2] : 1}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ position: [80, 90, 110], fov: 38, near: 0.5, far: 2500 }}
        onPointerMissed={() => props.onSelect(null)}
      >
        <color attach="background" args={[colors.canvas]} />
        <fog attach="fog" args={[colors.canvas, 220, 620]} />
        <ambientLight intensity={colors.dark ? 0.35 : 0.8} />
        <hemisphereLight args={[colors.accent2, colors.canvas, colors.dark ? 0.35 : 0.5]} />
        <directionalLight
          position={[70, 140, 50]}
          intensity={colors.dark ? 1.7 : 2.2}
          castShadow={high}
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-80}
          shadow-camera-right={80}
          shadow-camera-top={80}
          shadow-camera-bottom={-80}
          shadow-camera-far={400}
          shadow-bias={-0.0004}
        />
        <directionalLight position={[-90, 40, -80]} intensity={colors.dark ? 0.9 : 0.4} color={colors.accent} />

        <Grid
          position={[0, -0.01, 0]}
          args={[layout.size * 6, layout.size * 6]}
          cellSize={2.5}
          cellThickness={0.6}
          cellColor={colors.line}
          sectionSize={layout.size / 4}
          sectionThickness={1}
          sectionColor={colors.dark ? colors.accent : colors.inkMuted}
          fadeDistance={layout.size * 7}
          fadeStrength={1.5}
          infiniteGrid
        />
        <mesh rotation-x={-Math.PI / 2} position={[0, -0.05, 0]} receiveShadow>
          <planeGeometry args={[layout.size * 8, layout.size * 8]} />
          <shadowMaterial opacity={colors.dark ? 0.45 : 0.15} />
        </mesh>

        {/* key por número de instancias: si cambia, se crea otro InstancedMesh con la capacidad justa. */}
        <Districts key={`d${layout.districts.length}`} {...props} />
        <Buildings key={`b${layout.buildings.length}`} {...props} />
        <LabelProjector specs={specs} els={labelEls} />
        <Rig layout={layout} frameKey={frameKey} />

        {high && (
          <EffectComposer multisampling={4}>
            <Bloom mipmapBlur intensity={colors.dark ? 0.85 : 0.25} luminanceThreshold={1} luminanceSmoothing={0.2} />
            <Vignette eskil={false} offset={0.25} darkness={colors.dark ? 0.55 : 0.2} />
          </EffectComposer>
        )}
      </Canvas>
      <LabelLayer specs={specs} els={labelEls} />
    </div>
  )
}
