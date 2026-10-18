import { CameraControls, useCursor } from '@react-three/drei'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { useEffect, useLayoutEffect, useMemo, useRef, type ComponentRef } from 'react'
import * as THREE from 'three'
import { shade } from '../../lib/color'
import { hashString } from '../../lib/random'
import { fmtDate, fmtMoney, fmtPercent } from '../../model/format'
import type { CityNode } from '../../model/hierarchy'
import type { ResolvedQuality, SceneColors } from '../common'
import { ambientFor } from './ambient'
import { FogRig, Sky } from '../shared/atmosphere'
import { LabelLayer, LabelProjector, type LabelSpec } from '../shared/labels'
import { CityDecor } from './CityDecor'
import { buildDecor } from './decor'
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
  /** Id del nodo visible: siembra el decorado para que no cambie entre renders. */
  viewId: string
  /** Importe del nodo visible, para el % de cada rótulo. */
  total: number
  /** Icono de categoría de un nodo, si lo tiene. */
  iconFor: (node: CityNode) => string | undefined
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
}: Pick<CityCanvasProps, 'layout' | 'selectedId' | 'hoveredId' | 'colors' | 'onHover' | 'onSelect' | 'onEnter'>) {
  const body = useRef<THREE.InstancedMesh>(null!)
  const roof = useRef<THREE.InstancedMesh>(null!)
  // Una instancia por torre; `owner` dice a qué edificio pertenece cada una (para clics y colores).
  const { towers, owner } = useMemo(() => {
    const towers: { b: Block; t: Block['towers'][number] }[] = []
    const owner: number[] = []
    layout.buildings.forEach((b, i) =>
      b.towers.forEach((t) => {
        towers.push({ b, t })
        owner.push(i)
      }),
    )
    return { towers, owner }
  }, [layout])
  const n = towers.length
  const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), [])
  const material = useMemo(() => createWindowMaterial(colors.dark ? '#ffd7a1' : '#fff3d6', colors.dark ? 1.25 : 0.35), [colors.dark])
  const roofMat = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), [])
  const anim = useRef({ start: -1, running: true })
  const delays = useMemo(() => {
    const max = layout.size * 0.71
    return towers.map(({ b, t }) => (Math.hypot(b.x + t.dx, b.z + t.dz) / max) * 0.45)
  }, [layout, towers])

  useEffect(() => () => material.dispose(), [material])

  useLayoutEffect(() => {
    anim.current = { start: -1, running: true }
  }, [layout])

  useLayoutEffect(() => {
    if (!body.current || !roof.current) return
    const focus = selectedId ?? null
    towers.forEach(({ b }, i) => {
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
  }, [layout, towers, selectedId, hoveredId, colors.dark])

  useFrame(({ clock }) => {
    const a = anim.current
    if (!a.running || !body.current || !roof.current) return
    if (a.start < 0) a.start = clock.elapsedTime
    const t = reducedMotion() ? 1e9 : clock.elapsedTime - a.start
    let done = true
    towers.forEach(({ b, t: tower }, i) => {
      const p = Math.min(1, Math.max(0, (t - delays[i]) / GROW_SECONDS))
      if (p < 1) done = false
      const y0 = baseY(b)
      const h = Math.max(0.001, tower.h * easeOut(p))
      const x = b.x + tower.dx
      const z = b.z + tower.dz
      tmp.position.set(x, y0, z)
      tmp.scale.set(tower.w, h, tower.d)
      tmp.updateMatrix()
      body.current.setMatrixAt(i, tmp.matrix)
      // Tejado algo metido: deja un borde oscuro y no se convierte en una losa de color.
      const inset = Math.min(0.4, Math.min(tower.w, tower.d) * 0.08)
      tmp.position.set(x, y0 + h, z)
      tmp.scale.set(Math.max(0.02, tower.w - 2 * inset), ROOF, Math.max(0.02, tower.d - 2 * inset))
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

  const nodeAt = (e: ThreeEvent<PointerEvent | MouseEvent>) => (e.instanceId != null ? layout.buildings[owner[e.instanceId]]?.node : undefined)

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

function useLabelSpecs({
  layout,
  hoveredId,
  selectedId,
  quality,
  currency,
  locale,
  total,
  iconFor,
}: Pick<CityCanvasProps, 'layout' | 'hoveredId' | 'selectedId' | 'quality' | 'currency' | 'locale' | 'total' | 'iconFor'>): LabelSpec[] {
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
        value: fmtMoney(b.node.value, { currency, locale }),
        sub: total > 0 ? fmtPercent(b.node.value / total, locale) : undefined,
        icon: iconFor(b.node),
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
        icon: iconFor(focus.node),
        focus: true,
      })
    }
    return fixed
  }, [layout, hoveredId, selectedId, quality, currency, locale, total, iconFor])
}

function Rig({ layout, frameKey, viewId }: { layout: CityLayout; frameKey: string; viewId: string }) {
  const controls = useRef<ComponentRef<typeof CameraControls>>(null)
  const last = useRef<{ viewId: string; portrait: boolean } | null>(null)
  const size = useThree((s) => s.size)

  useEffect(() => {
    const c = controls.current
    if (!c) return
    // En vertical la ciudad (cuadrada) aprovecha mejor la pantalla vista algo más desde arriba.
    const portrait = size.height > size.width
    const prev = last.current
    if (!prev || prev.portrait !== portrait) void c.rotateTo(Math.PI / 5, portrait ? 0.8 : 0.95, Boolean(prev))
    // Pequeño giro al cambiar de vista para que se note que «entras» (no al recentrar ni al redimensionar).
    else if (prev.viewId !== viewId) void c.rotate(-0.25, 0, true)
    last.current = { viewId, portrait }
    // fitToSphere y no fitToBox: fitToBox redondea los ángulos a la cara más cercana de la caja y deja la vista de frente.
    const maxH = Math.max(4, ...layout.buildings.map((b) => baseY(b) + b.h))
    const half = layout.size / 2
    const radius = Math.hypot(half, half, maxH / 2) * (portrait ? 1.02 : 0.95)
    void c.fitToSphere(new THREE.Sphere(new THREE.Vector3(0, maxH / 3, 0), radius), true)
  }, [frameKey, viewId, layout, size.width, size.height])

  return (
    <CameraControls ref={controls} makeDefault minPolarAngle={0.12} maxPolarAngle={1.32} minDistance={12} maxDistance={800} dollyToCursor smoothTime={0.35} />
  )
}

export function CityCanvas(props: CityCanvasProps) {
  const { layout, quality, colors, frameKey } = props
  const high = quality === 'high'
  const hovering = props.hoveredId != null
  useCursor(hovering)
  const specs = useLabelSpecs(props)
  const labelEls = useMemo(() => new Map<string, HTMLDivElement>(), [])
  const decor = useMemo(() => buildDecor(layout, { quality, seed: hashString(props.viewId) }), [layout, quality, props.viewId])

  return (
    <div className="absolute inset-0">
      <Canvas
        shadows={high ? 'percentage' : false}
        dpr={high ? [1, 2] : 1}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ position: [80, 90, 110], fov: 38, near: 0.5, far: 5000 }}
        onPointerMissed={() => props.onSelect(null)}
      >
        <Sky dark={colors.dark} />
        {/* La niebla funde el extrarradio con el cielo: el centro (tus datos) queda nítido. */}
        <fog attach="fog" args={[ambientFor(colors.dark).horizon, 200, 500]} />
        <FogRig radius={decor.outskirtsRadius} />
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

        <CityDecor decor={decor} layout={layout} dark={colors.dark} quality={quality} />

        {/* key por número de instancias: si cambia, se crea otro InstancedMesh con la capacidad justa. */}
        <Districts key={`d${layout.districts.length}`} {...props} />
        <Buildings key={`b${layout.buildings.reduce((n, b) => n + b.towers.length, 0)}`} {...props} />
        <LabelProjector specs={specs} els={labelEls} />
        <Rig layout={layout} frameKey={frameKey} viewId={props.viewId} />

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
