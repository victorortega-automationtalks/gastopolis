import { CameraControls, MeshReflectorMaterial, useCursor } from '@react-three/drei'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { useEffect, useMemo, useRef, type ComponentRef } from 'react'
import * as THREE from 'three'
import { shade } from '../../lib/color'
import { fmtMoney } from '../../model/format'
import { bucketLabel } from '../../model/ridgeSeries'
import type { ResolvedQuality, SceneColors } from '../common'
import { ambientFor } from '../city/ambient'
import { FogRig, Sky } from '../shared/atmosphere'
import { LabelLayer, LabelProjector, type LabelSpec } from '../shared/labels'
import { applyReveal, buildRidge, revealAt } from './geometry'
import { axisTicks, type RidgeLayout } from './layout'

export interface RidgeHover {
  row: number
  /** Tramo (día, semana o mes) señalado. */
  at: number
}

export interface RidgeCanvasProps {
  layout: RidgeLayout
  hover: RidgeHover | null
  /** Fila resaltada desde el panel (sin tramo concreto). */
  focusRow: number | null
  quality: ResolvedQuality
  colors: SceneColors
  currency: string
  locale: string
  frameKey: string
  onHover: (h: RidgeHover | null) => void
  onPick: (h: RidgeHover) => void
  /** Reproducción: hasta qué tramo (con decimales) ha crecido la cordillera. Null = entera. */
  cursor?: number | null
}

const noRaycast = () => null
const isClick = (e: ThreeEvent<MouseEvent>) => e.delta < 5
const linear = (hex: string) => {
  const c = new THREE.Color(hex)
  return { r: c.r, g: c.g, b: c.b }
}

/**
 * Frente de la ola compartido por todas las crestas: avanza con suavidad hacia su objetivo. Al cambiar los datos
 * vuelve a empezar desde la izquierda, así la cordillera «se levanta» al entrar.
 */
/** Uno para todo el módulo: solo hay una Cordillera a la vez (como el `tmp` de la Ciudad). */
const WAVE = { front: -1e3, target: 1e3, width: 5 }

function WaveRig({ layout, cursor, frameKey }: { layout: RidgeLayout; cursor: number | null; frameKey: string }) {
  const w = Math.max(layout.spacingX * 2.2, 5)
  useEffect(() => {
    WAVE.front = -layout.width / 2 - 1
    WAVE.width = w
  }, [frameKey, layout.width, w])
  useFrame((_, dt) => {
    const s = WAVE
    s.width = w
    s.target = cursor == null ? layout.width / 2 + w + 1 : cursor * layout.spacingX - layout.width / 2 + w * 0.5
    // Al retroceder (arrastrar el deslizador hacia atrás) se coloca de golpe; si no, persigue el objetivo.
    if (s.target < s.front - layout.spacingX * 3) s.front = s.target
    else s.front += (s.target - s.front) * (1 - Math.exp(-dt * (cursor == null ? 2.6 : 9)))
  })
  return null
}

function Ridge({
  row,
  index,
  layout,
  active,
  dimmed,
  dark,
  onHover,
  onPick,
}: {
  row: RidgeLayout['rows'][number]
  index: number
  layout: RidgeLayout
  active: boolean
  dimmed: boolean
  dark: boolean
  onHover: RidgeCanvasProps['onHover']
  onPick: RidgeCanvasProps['onPick']
}) {
  const buffers = useMemo(
    () =>
      buildRidge(
        row.profile,
        layout.width,
        layout.thickness,
        linear(shade(row.color, dark ? -0.08 : 0)),
        linear(shade(row.color, dark ? -0.82 : -0.55)),
        layout.maxH,
      ),
    [row.profile, row.color, layout.width, layout.thickness, layout.maxH, dark],
  )
  const { geo, crestGeo } = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(buffers.positions.slice(), 3))
    geo.setAttribute('normal', new THREE.BufferAttribute(buffers.normals.slice(), 3))
    geo.setAttribute('color', new THREE.BufferAttribute(buffers.colors.slice(), 3))
    geo.setIndex(new THREE.BufferAttribute(buffers.index, 1))
    const crestGeo = new THREE.BufferGeometry()
    crestGeo.setAttribute('position', new THREE.BufferAttribute(buffers.crest.positions.slice(), 3))
    crestGeo.setIndex(new THREE.BufferAttribute(buffers.crest.index, 1))
    // Volumen con la altura final: la animación no cambia lo que la cámara debe considerar visible.
    geo.computeBoundingSphere()
    crestGeo.computeBoundingSphere()
    return { geo, crestGeo }
  }, [buffers])
  useEffect(
    () => () => {
      geo.dispose()
      crestGeo.dispose()
    },
    [geo, crestGeo],
  )
  const body = useRef<THREE.Mesh>(null)
  const edge = useRef<THREE.Mesh>(null)
  const last = useRef(NaN)
  useFrame(() => {
    const { front, width } = WAVE
    if (!body.current || !edge.current || Math.abs(front - last.current) < 1e-3) return
    last.current = front
    const pos = body.current.geometry.attributes.position as THREE.BufferAttribute
    const nor = body.current.geometry.attributes.normal as THREE.BufferAttribute
    const crest = edge.current.geometry.attributes.position as THREE.BufferAttribute
    const col = body.current.geometry.attributes.color as THREE.BufferAttribute
    applyReveal(buffers, front, width, pos.array as Float32Array, nor.array as Float32Array, crest.array as Float32Array, col.array as Float32Array)
    col.needsUpdate = true
    pos.needsUpdate = true
    nor.needsUpdate = true
    crest.needsUpdate = true
  })

  // Sin transparencias: atenuar con el color evita que el orden de dibujo cambie al pasar el ratón (parpadeo).
  const tint = active ? 1.15 : dimmed ? 0.32 : 1
  const glow = useMemo(() => new THREE.Color(row.color).multiplyScalar(dimmed ? 0.45 : dark ? (active ? 3.2 : 2.1) : 1.15), [row.color, active, dimmed, dark])
  const at = (e: ThreeEvent<PointerEvent | MouseEvent>) =>
    Math.max(0, Math.min(layout.frames.length - 1, Math.round((e.point.x + layout.width / 2) / layout.spacingX)))
  return (
    <group position={[0, 0, row.z]}>
      <mesh
        ref={body}
        geometry={geo}
        onPointerMove={(e) => {
          e.stopPropagation()
          onHover({ row: index, at: at(e) })
        }}
        onPointerOut={() => onHover(null)}
        onClick={(e) => {
          e.stopPropagation()
          if (isClick(e)) onPick({ row: index, at: at(e) })
        }}
      >
        <meshStandardMaterial
          vertexColors
          color={new THREE.Color(tint, tint, tint)}
          emissive={row.color}
          emissiveIntensity={active ? 0.22 : dimmed ? 0 : dark ? 0.07 : 0.02}
          // Mate: con brillo, las láminas planas reflejan la luz en ángulo rasante y se ven blanquecinas.
          roughness={0.92}
          metalness={0}
        />
      </mesh>
      <mesh ref={edge} geometry={crestGeo} raycast={noRaycast}>
        <meshBasicMaterial color={glow} toneMapped={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>
    </group>
  )
}

/** Destellos que viajan por la cresta de cada fila en la reproducción, en el frente de la ola. */
function Sparks({ layout, playing }: { layout: RidgeLayout; playing: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const tmp = useMemo(() => new THREE.Object3D(), [])
  const tint = useMemo(() => layout.rows.map((r) => new THREE.Color(r.color).multiplyScalar(4)), [layout.rows])
  const n = layout.rows.length
  useFrame(() => {
    const m = mesh.current
    if (!m) return
    const { front, width } = WAVE
    const x = front - width * 0.45
    const f = revealAt(x, front, width)
    layout.rows.forEach((r, i) => {
      // Altura del perfil en x (interpolada) por lo que ya ha crecido.
      const t = ((x + layout.width / 2) / layout.width) * (r.profile.length - 1)
      const k = Math.max(0, Math.min(r.profile.length - 2, Math.floor(t)))
      const y = (r.profile[k] + ((r.profile[k + 1] ?? r.profile[k]) - r.profile[k]) * Math.min(1, Math.max(0, t - k))) * f
      tmp.position.set(x, y + 0.12, r.z + layout.thickness / 2 + 0.05)
      const visible = playing && x > -layout.width / 2 && x < layout.width / 2
      tmp.scale.setScalar(visible ? 0.32 : 0)
      tmp.updateMatrix()
      m.setMatrixAt(i, tmp.matrix)
      m.setColorAt(i, tint[i])
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  })
  return (
    <instancedMesh key={n} ref={mesh} args={[undefined, undefined, n]} raycast={noRaycast}>
      <sphereGeometry args={[1, 16, 12]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  )
}

/** Señal del tramo bajo el puntero: una línea en el suelo a lo ancho y una columna de luz en la cresta. */
function Cursor({ layout, hover }: { layout: RidgeLayout; hover: RidgeHover | null }) {
  if (!hover) return null
  const row = layout.rows[hover.row]
  const x = hover.at * layout.spacingX - layout.width / 2
  const h = Math.max(row.heights[hover.at], 0.05)
  const c = new THREE.Color(row.color).multiplyScalar(2.6)
  return (
    <group>
      <mesh position={[x, 0.08, 0]} raycast={noRaycast}>
        <boxGeometry args={[0.07, 0.02, layout.depth + layout.spacingZ * 1.6]} />
        <meshBasicMaterial color={c} toneMapped={false} />
      </mesh>
      <mesh position={[x, h / 2, row.z + layout.thickness / 2 + 0.12]} raycast={noRaycast}>
        <boxGeometry args={[0.14, h, 0.14]} />
        <meshBasicMaterial color={c} toneMapped={false} />
      </mesh>
    </group>
  )
}

/** Suelo y rejilla de tiempo. Las líneas van separadas del suelo para que no se peleen con él (z-fighting). */
function Floor({ layout, dark, high, ticks }: { layout: RidgeLayout; dark: boolean; high: boolean; ticks: number[] }) {
  const a = ambientFor(dark)
  const grid = useMemo(() => {
    const z0 = -layout.depth / 2 - layout.spacingZ
    const z1 = layout.depth / 2 + layout.spacingZ
    const pts: number[] = []
    for (const i of ticks) {
      const x = i * layout.spacingX - layout.width / 2
      pts.push(x, 0, z0, x, 0, z1)
    }
    pts.push(-layout.width / 2, 0, z1, layout.width / 2, 0, z1)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [layout, ticks])
  useEffect(() => () => grid.dispose(), [grid])
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} raycast={noRaycast}>
        <planeGeometry args={[3000, 3000]} />
        {high ? (
          <MeshReflectorMaterial
            resolution={512}
            blur={[260, 80]}
            mixBlur={1}
            mixStrength={dark ? 3.5 : 1.5}
            mirror={0.45}
            depthScale={0}
            color={a.ground}
            metalness={0.3}
            roughness={0.85}
          />
        ) : (
          <meshStandardMaterial color={a.ground} roughness={1} />
        )}
      </mesh>
      <lineSegments geometry={grid} position={[0, 0.06, 0]} raycast={noRaycast}>
        <lineBasicMaterial color={dark ? '#2b3150' : '#c3c8d6'} />
      </lineSegments>
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
      void c.rotateTo(-0.42, portrait ? 0.95 : 1.08, false)
    }
    const radius = Math.hypot(layout.width / 2, layout.depth / 2 + layout.spacingZ, layout.maxH / 2) * (portrait ? 1.05 : 0.88)
    void c.fitToSphere(new THREE.Sphere(new THREE.Vector3(0, layout.maxH / 3, 0), radius), true)
  }, [frameKey, layout, size.width, size.height])
  return (
    <CameraControls ref={controls} makeDefault minPolarAngle={0.25} maxPolarAngle={1.42} minDistance={8} maxDistance={600} dollyToCursor smoothTime={0.35} />
  )
}

function useSpecs(
  { layout, hover, currency, locale, cursor }: Pick<RidgeCanvasProps, 'layout' | 'hover' | 'currency' | 'locale' | 'cursor'>,
  ticks: number[],
): LabelSpec[] {
  // Mientras se reproduce, los rótulos se recalculan por tramo entero, no a cada fotograma.
  const step = cursor == null ? null : Math.floor(cursor + 1e-6)
  return useMemo(() => {
    const specs: LabelSpec[] = []
    const money = (v: number, compact = false) => fmtMoney(v, { currency, locale, compact })
    if (hover) {
      const row = layout.rows[hover.row]
      specs.push({
        id: 'focus',
        pos: [hover.at * layout.spacingX - layout.width / 2, row.heights[hover.at] + 0.5, row.z],
        color: row.color,
        icon: row.icon,
        title: row.name,
        value: money(row.values[hover.at]),
        sub: bucketLabel(layout.frames[hover.at], layout.bucket, true),
        focus: true,
      })
    }
    // Cada categoría, sobre su pico (de lo que ya se ve, en la reproducción).
    for (const row of layout.rows) {
      const seen = step == null ? row.values : row.values.slice(0, step + 1)
      if (!seen.some((v) => v > 0)) continue
      const peak = seen.indexOf(Math.max(...seen))
      specs.push({
        id: `row:${row.categoryId}`,
        pos: [peak * layout.spacingX - layout.width / 2, row.heights[peak] + 1.1, row.z],
        color: row.color,
        icon: row.icon,
        title: row.name,
        value: money(
          seen.reduce((a, v) => a + v, 0),
          true,
        ),
        sub: `pico ${bucketLabel(layout.frames[peak], layout.bucket)}`,
      })
    }
    const front = layout.depth / 2 + layout.spacingZ * 0.95
    for (const i of ticks) {
      specs.push({
        id: `t:${i}`,
        pos: [i * layout.spacingX - layout.width / 2, 0, front],
        color: '',
        title: bucketLabel(layout.frames[i], layout.bucket),
        value: '',
        axis: true,
      })
    }
    return specs
  }, [layout, hover, currency, locale, step, ticks])
}

export function RidgeCanvas(props: RidgeCanvasProps) {
  const { layout, quality, colors, hover, focusRow } = props
  const high = quality === 'high'
  const cursor = props.cursor ?? null
  useCursor(hover != null)
  const ticks = useMemo(() => axisTicks(layout), [layout])
  const specs = useSpecs(props, ticks)
  const els = useMemo(() => new Map<string, HTMLDivElement>(), [])
  const activeRow = hover?.row ?? focusRow
  return (
    <div className="absolute inset-0">
      <Canvas
        dpr={high ? [1, 2] : 1}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ position: [-40, 50, 90], fov: 36, near: 0.5, far: 5000 }}
        onPointerMissed={() => props.onHover(null)}
      >
        <Sky dark={colors.dark} />
        <fog attach="fog" args={[ambientFor(colors.dark).horizon, 150, 400]} />
        <FogRig radius={Math.max(layout.width, layout.depth) * 1.5} />
        <ambientLight intensity={colors.dark ? 0.32 : 0.75} />
        <hemisphereLight args={[colors.accent2, colors.canvas, colors.dark ? 0.45 : 0.5]} />
        <directionalLight position={[-30, 70, 60]} intensity={colors.dark ? 1.5 : 2.1} />
        {/* Contraluz de color: perfila las crestas contra el cielo. */}
        <directionalLight position={[40, 25, -80]} intensity={colors.dark ? 1.4 : 0.5} color={colors.accent} />

        <Floor layout={layout} dark={colors.dark} high={high} ticks={ticks} />
        <WaveRig layout={layout} cursor={cursor} frameKey={props.frameKey} />
        {layout.rows.map((row, i) => (
          <Ridge
            key={`${row.categoryId}:${row.profile.length}`}
            row={row}
            index={i}
            layout={layout}
            active={activeRow === i}
            dimmed={activeRow != null && activeRow !== i}
            dark={colors.dark}
            onHover={props.onHover}
            onPick={props.onPick}
          />
        ))}
        <Sparks layout={layout} playing={cursor != null} />
        <Cursor layout={layout} hover={hover} />
        <LabelProjector specs={specs} els={els} />
        <Rig layout={layout} frameKey={props.frameKey} />

        {high && (
          <EffectComposer multisampling={4}>
            <Bloom mipmapBlur intensity={colors.dark ? 0.75 : 0.22} luminanceThreshold={1} luminanceSmoothing={0.25} />
            <Vignette eskil={false} offset={0.25} darkness={colors.dark ? 0.5 : 0.2} />
          </EffectComposer>
        )}
      </Canvas>
      <LabelLayer specs={specs} els={els} />
    </div>
  )
}
