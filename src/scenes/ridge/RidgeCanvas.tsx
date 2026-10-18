import { CameraControls, Line, MeshReflectorMaterial, useCursor } from '@react-three/drei'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { useEffect, useMemo, useRef, type ComponentRef } from 'react'
import * as THREE from 'three'
import { shade } from '../../lib/color'
import { fmtMoney, fmtMonth } from '../../model/format'
import type { ResolvedQuality, SceneColors } from '../common'
import { ambientFor } from '../city/ambient'
import { FogRig, Sky } from '../shared/atmosphere'
import { LabelLayer, LabelProjector, type LabelSpec } from '../shared/labels'
import type { RidgeLayout } from './layout'

export interface RidgeHover {
  row: number
  month: number
}

export interface RidgeCanvasProps {
  layout: RidgeLayout
  hover: RidgeHover | null
  /** Fila resaltada desde el panel (sin mes concreto). */
  focusRow: number | null
  quality: ResolvedQuality
  colors: SceneColors
  currency: string
  locale: string
  frameKey: string
  onHover: (h: RidgeHover | null) => void
  onPick: (h: RidgeHover) => void
  /** Reproducción temporal: hasta dónde (en meses, con decimales) se ve la cordillera. Null = entera. */
  cursor?: number | null
}

const noRaycast = () => null
const THICK = 0.55
/** Plano de recorte de la reproducción (deja ver x ≤ constant). Uno para todo el módulo: solo hay una Cordillera a la vez. */
const CLIP = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 1e5)
const PLANES = [CLIP]
const isClick = (e: ThreeEvent<MouseEvent>) => e.delta < 5

function ridgeGeometry(profile: number[], width: number, depth: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape()
  const n = profile.length
  shape.moveTo(0, 0)
  profile.forEach((h, i) => shape.lineTo((i / Math.max(n - 1, 1)) * width, Math.max(h, 0.05)))
  shape.lineTo(width, 0)
  shape.closePath()
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 2, curveSegments: 1 })
  g.translate(-width / 2, 0, -depth / 2)
  return g
}

function Ridge({
  row,
  index,
  layout,
  active,
  dimmed,
  planes,
  onHover,
  onPick,
}: {
  row: RidgeLayout['rows'][number]
  index: number
  layout: RidgeLayout
  active: boolean
  dimmed: boolean
  planes: THREE.Plane[]
  onHover: RidgeCanvasProps['onHover']
  onPick: RidgeCanvasProps['onPick']
}) {
  const depth = layout.spacingZ * THICK
  const geo = useMemo(() => ridgeGeometry(row.profile, layout.width, depth), [row.profile, layout.width, depth])
  useEffect(() => () => geo.dispose(), [geo])
  const linePoints = useMemo(
    () =>
      row.profile.map(
        (h, i) => new THREE.Vector3((i / Math.max(row.profile.length - 1, 1)) * layout.width - layout.width / 2, Math.max(h, 0.05) + 0.14, depth / 2 + 0.13),
      ),
    [row.profile, layout.width, depth],
  )
  const glow = useMemo(() => new THREE.Color(row.color).multiplyScalar(active ? 3 : dimmed ? 0.5 : 1.8), [row.color, active, dimmed])
  const monthAt = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const m = Math.round((e.point.x + layout.width / 2) / layout.spacingX)
    return Math.max(0, Math.min(layout.months.length - 1, m))
  }
  return (
    <group position={[0, 0, row.z]}>
      <mesh
        geometry={geo}
        castShadow
        receiveShadow
        onPointerMove={(e) => {
          e.stopPropagation()
          onHover({ row: index, month: monthAt(e) })
        }}
        onPointerOut={() => onHover(null)}
        onClick={(e) => {
          e.stopPropagation()
          if (isClick(e)) onPick({ row: index, month: monthAt(e) })
        }}
      >
        <meshStandardMaterial
          color={shade(row.color, dimmed ? -0.65 : active ? 0 : -0.25)}
          emissive={row.color}
          emissiveIntensity={active ? 0.35 : dimmed ? 0.02 : 0.12}
          roughness={0.45}
          metalness={0.15}
          transparent={dimmed}
          opacity={dimmed ? 0.55 : 1}
          clippingPlanes={planes}
          // Al recortar en la reproducción se ve el interior: con doble cara el corte no queda hueco.
          side={THREE.DoubleSide}
        />
      </mesh>
      <Line points={linePoints} color={glow} lineWidth={active ? 3 : 2} toneMapped={false} raycast={noRaycast} clippingPlanes={planes} />
    </group>
  )
}

/** Cursor del mes señalado: columna translúcida a lo ancho y barra brillante en la cresta. */
function Cursor({ layout, hover }: { layout: RidgeLayout; hover: RidgeHover | null }) {
  if (!hover) return null
  const row = layout.rows[hover.row]
  const x = hover.month * layout.spacingX - layout.width / 2
  const h = Math.max(row.heights[hover.month], 0.05)
  return (
    <group>
      <mesh position={[x, 0.03, 0]} raycast={noRaycast}>
        <boxGeometry args={[0.08, 0.02, layout.depth + layout.spacingZ * 2]} />
        <meshBasicMaterial color={new THREE.Color(row.color).multiplyScalar(2)} toneMapped={false} />
      </mesh>
      <mesh position={[x, h / 2, row.z + layout.spacingZ * THICK * 0.5 + 0.2]} raycast={noRaycast}>
        <boxGeometry args={[0.18, h, 0.18]} />
        <meshBasicMaterial color={new THREE.Color(row.color).multiplyScalar(3)} toneMapped={false} />
      </mesh>
    </group>
  )
}

/**
 * Muro de luz en la fecha de la reproducción: el plano de recorte avanza con suavidad hacia el fotograma y la
 * cordillera aparece detrás de él.
 */
function TimeWall({ layout, cursor, color }: { layout: RidgeLayout; cursor: number | null; color: string }) {
  const clip = CLIP
  const wall = useRef<THREE.Mesh>(null)
  const start = -layout.width / 2 - 0.5
  useFrame((_, dt) => {
    if (cursor == null) {
      clip.constant = 1e5
      if (wall.current) wall.current.visible = false
      return
    }
    const target = cursor * layout.spacingX - layout.width / 2 + 0.05
    // Al empezar (o si salta hacia atrás) se coloca de golpe; si no, persigue el objetivo.
    if (clip.constant > 1e4 || target < clip.constant - layout.spacingX * 2) clip.constant = Math.max(start, target)
    else clip.constant += (target - clip.constant) * (1 - Math.exp(-dt * 10))
    if (wall.current) {
      wall.current.visible = true
      wall.current.position.x = clip.constant
    }
  })
  const span = layout.depth + layout.spacingZ * 2
  return (
    <mesh ref={wall} rotation-y={Math.PI / 2} position={[start, layout.maxH * 0.55, 0]} raycast={noRaycast} visible={false}>
      <planeGeometry args={[span, layout.maxH * 1.1]} />
      <meshBasicMaterial
        color={new THREE.Color(color).multiplyScalar(1.6)}
        transparent
        opacity={0.13}
        side={THREE.DoubleSide}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  )
}

function Floor({ layout, dark, high }: { layout: RidgeLayout; dark: boolean; high: boolean }) {
  const a = ambientFor(dark)
  const lines = useMemo(() => layout.months.map((m, i) => ({ x: i * layout.spacingX - layout.width / 2, year: m.endsWith('-01') })), [layout])
  const span = layout.depth + layout.spacingZ * 2
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 0]} raycast={noRaycast} receiveShadow>
        <planeGeometry args={[3000, 3000]} />
        {high ? (
          <MeshReflectorMaterial
            resolution={512}
            blur={[300, 90]}
            mixBlur={0.9}
            mixStrength={dark ? 6 : 2}
            mirror={0.6}
            depthScale={0}
            color={a.ground}
            metalness={0.4}
            roughness={0.8}
          />
        ) : (
          <meshStandardMaterial color={a.ground} roughness={1} />
        )}
      </mesh>
      {lines.map((l) => (
        <mesh key={l.x} position={[l.x, 0.01, 0]} raycast={noRaycast}>
          <boxGeometry args={[l.year ? 0.12 : 0.05, 0.01, span]} />
          <meshBasicMaterial color={dark ? (l.year ? '#5b6390' : '#262b44') : l.year ? '#8a90aa' : '#c7cbd8'} />
        </mesh>
      ))}
    </group>
  )
}

function Rig({ layout, frameKey }: { layout: RidgeLayout; frameKey: string }) {
  const controls = useRef<ComponentRef<typeof CameraControls>>(null)
  const size = useThree((s) => s.size)
  const first = useRef(true)
  useEffect(() => {
    const c = controls.current
    if (!c) return
    const portrait = size.height > size.width
    if (first.current) {
      first.current = false
      void c.rotateTo(-0.5, portrait ? 0.85 : 1.02, false)
    }
    const radius = Math.hypot(layout.width / 2, layout.depth / 2 + layout.spacingZ, layout.maxH / 2) * (portrait ? 1.1 : 0.95)
    void c.fitToSphere(new THREE.Sphere(new THREE.Vector3(0, layout.maxH / 3, 0), radius), true)
  }, [frameKey, layout, size.width, size.height])
  return (
    <CameraControls ref={controls} makeDefault minPolarAngle={0.2} maxPolarAngle={1.45} minDistance={8} maxDistance={600} dollyToCursor smoothTime={0.35} />
  )
}

function useSpecs({ layout, hover, currency, locale, cursor }: Pick<RidgeCanvasProps, 'layout' | 'hover' | 'currency' | 'locale' | 'cursor'>): LabelSpec[] {
  return useMemo(() => {
    const specs: LabelSpec[] = []
    if (hover) {
      const row = layout.rows[hover.row]
      const x = hover.month * layout.spacingX - layout.width / 2
      specs.push({
        id: 'focus',
        pos: [x, row.heights[hover.month] + 0.4, row.z],
        color: row.color,
        icon: row.icon,
        title: row.name,
        value: fmtMoney(row.values[hover.month], { currency, locale }),
        sub: fmtMonth(layout.months[hover.month], true),
        focus: true,
      })
    }
    // Rótulo de cada categoría sobre su pico: dice de quién es la cresta y cuándo se disparó.
    // En la reproducción, el pico de lo que ya se ve y lo acumulado hasta la fecha.
    const seen = cursor == null ? Infinity : Math.floor(cursor + 1e-6)
    for (const row of layout.rows) {
      const visible = row.values.slice(0, Math.min(row.values.length, seen + 1))
      if (cursor != null && !visible.some((v) => v > 0)) continue
      const peak = visible.indexOf(Math.max(...visible))
      specs.push({
        id: `row:${row.categoryId}`,
        pos: [peak * layout.spacingX - layout.width / 2, row.heights[peak] + 1.2, row.z],
        color: row.color,
        icon: row.icon,
        title: row.name,
        value: fmtMoney(cursor == null ? row.total : visible.reduce((a, v) => a + v, 0), { currency, locale, compact: true }),
        sub: `pico ${fmtMonth(layout.months[peak])}`,
      })
    }
    // Meses en el borde delantero (uno de cada dos si no caben).
    const every = layout.months.length > 14 ? 2 : 1
    const front = layout.depth / 2 + layout.spacingZ * 0.9
    layout.months.forEach((m, i) => {
      if (i % every) return
      specs.push({ id: `m:${m}`, pos: [i * layout.spacingX - layout.width / 2, 0, front], color: '', title: fmtMonth(m), value: '', axis: true })
    })
    return specs
  }, [layout, hover, currency, locale, cursor])
}

export function RidgeCanvas(props: RidgeCanvasProps) {
  const { layout, quality, colors, hover, focusRow } = props
  const high = quality === 'high'
  useCursor(hover != null)
  const specs = useSpecs(props)
  const els = useMemo(() => new Map<string, HTMLDivElement>(), [])
  const activeRow = hover?.row ?? focusRow
  return (
    <div className="absolute inset-0">
      <Canvas
        shadows={high ? 'percentage' : false}
        dpr={high ? [1, 2] : 1}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ position: [-40, 50, 90], fov: 38, near: 0.5, far: 5000 }}
        onPointerMissed={() => props.onHover(null)}
        onCreated={({ gl }) => {
          gl.localClippingEnabled = true
        }}
      >
        <Sky dark={colors.dark} />
        <fog attach="fog" args={[ambientFor(colors.dark).horizon, 150, 400]} />
        <FogRig radius={Math.max(layout.width, layout.depth) * 1.5} />
        <ambientLight intensity={colors.dark ? 0.35 : 0.8} />
        <hemisphereLight args={[colors.accent2, colors.canvas, colors.dark ? 0.4 : 0.5]} />
        <directionalLight
          position={[-30, 80, 60]}
          intensity={colors.dark ? 1.6 : 2.2}
          castShadow={high}
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-80}
          shadow-camera-right={80}
          shadow-camera-top={80}
          shadow-camera-bottom={-80}
          shadow-bias={-0.0004}
        />
        <directionalLight position={[60, 30, -60]} intensity={colors.dark ? 0.9 : 0.4} color={colors.accent} />

        <Floor layout={layout} dark={colors.dark} high={high} />
        {layout.rows.map((row, i) => (
          <Ridge
            key={row.categoryId}
            row={row}
            index={i}
            layout={layout}
            active={activeRow === i}
            dimmed={activeRow != null && activeRow !== i}
            planes={PLANES}
            onHover={props.onHover}
            onPick={props.onPick}
          />
        ))}
        <Cursor layout={layout} hover={hover} />
        <TimeWall layout={layout} cursor={props.cursor ?? null} color={colors.accent2} />
        <LabelProjector specs={specs} els={els} />
        <Rig layout={layout} frameKey={props.frameKey} />

        {high && (
          <EffectComposer multisampling={4}>
            <Bloom mipmapBlur intensity={colors.dark ? 0.8 : 0.25} luminanceThreshold={1} luminanceSmoothing={0.2} />
            <Vignette eskil={false} offset={0.25} darkness={colors.dark ? 0.5 : 0.2} />
          </EffectComposer>
        )}
      </Canvas>
      <LabelLayer specs={specs} els={els} />
    </div>
  )
}
