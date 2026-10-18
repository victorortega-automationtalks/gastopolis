import { CameraControls, MeshReflectorMaterial, useCursor } from '@react-three/drei'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { useEffect, useMemo, useRef, type ComponentRef } from 'react'
import * as THREE from 'three'
import { shade } from '../../lib/color'
import type { BalanceSeg, BalanceSnapshot } from '../../model/balance'
import { fmtMoney, fmtPercent } from '../../model/format'
import { ambientFor } from '../city/ambient'
import type { ResolvedQuality, SceneColors } from '../common'
import { FogRig, Sky } from '../shared/atmosphere'
import { LabelLayer, LabelProjector, type LabelSpec } from '../shared/labels'

export type BalanceSide = 'income' | 'expense'

export interface BalancePick {
  side: BalanceSide
  seg: BalanceSeg
}

export interface BalanceCanvasProps {
  snapshot: BalanceSnapshot
  /** Mayor platillo de todo el periodo: escala fija para que las alturas se puedan comparar entre meses. */
  scaleMax: number
  hovered: string | null
  quality: ResolvedQuality
  colors: SceneColors
  currency: string
  locale: string
  incomeColor: string
  expenseColor: string
  frameKey: string
  onHover: (key: string | null) => void
  onPick: (p: BalancePick) => void
}

const noRaycast = () => null
const PIVOT_Y = 15
const ARM = 12
const HANG = 4
const PAN_R = 4.4
const TOWER = 4.6
const TOWER_MAX = 14
const MAX_TILT = 0.38
/** Ángulo del brazo: con raíz, para que una diferencia del 10 % ya se note y una enorme no lo tumbe. */
const tiltAngle = (t: number) => Math.sign(t) * Math.sqrt(Math.abs(t)) * MAX_TILT

const segKey = (side: BalanceSide, s: BalanceSeg) => `${side}:${s.categoryId}`

function towerHeight(value: number, scaleMax: number) {
  return (value / Math.max(scaleMax, 1e-9)) * TOWER_MAX
}

/** Brazo, platillos y torres. Todo se mueve en un único useFrame para que vayan sincronizados. */
function Scale({ snapshot, scaleMax, hovered, colors, incomeColor, expenseColor, onHover, onPick }: BalanceCanvasProps) {
  // Estado animado: se acerca cada fotograma a lo que pide el mes elegido.
  const anim = useRef({ tilt: 0, heights: new Map<string, number>() })
  const beam = useRef<THREE.Group>(null)
  const pans = { income: useRef<THREE.Group>(null), expense: useRef<THREE.Group>(null) }
  const segRefs = useRef(new Map<string, THREE.Mesh>())
  const chainRefs = useRef<THREE.Mesh[]>([])

  useFrame((_, dt) => {
    const a = anim.current
    const k = Math.min(1, dt * 5)
    a.tilt += (tiltAngle(snapshot.tilt) - a.tilt) * k
    if (beam.current) beam.current.rotation.z = -a.tilt
    const cos = Math.cos(a.tilt)
    const sin = Math.sin(a.tilt)
    for (const side of ['income', 'expense'] as const) {
      const sign = side === 'income' ? -1 : 1
      const g = pans[side].current
      // Extremo del brazo; el platillo cuelga vertical debajo.
      const ex = sign * ARM * cos
      const ey = PIVOT_Y - sign * ARM * sin
      if (g) g.position.set(ex, ey - HANG, 0)
      const segs = side === 'income' ? snapshot.income : snapshot.expense
      let y = 0.35
      for (const s of segs) {
        const key = segKey(side, s)
        const target = towerHeight(s.value, scaleMax)
        const cur = (a.heights.get(key) ?? 0) + (target - (a.heights.get(key) ?? 0)) * k
        a.heights.set(key, cur)
        const m = segRefs.current.get(key)
        if (m) {
          // La caja está centrada: su centro va a media altura de la franja.
          m.scale.set(1, Math.max(cur, 0.001), 1)
          m.position.y = y + cur / 2
        }
        y += cur + (cur > 0.05 ? 0.06 : 0)
      }
    }
    chainRefs.current.forEach((c, i) => {
      const side = i < 3 ? -1 : 1
      const ex = side * ARM * cos
      const ey = PIVOT_Y - side * ARM * sin
      const ang = ((i % 3) / 3) * Math.PI * 2
      const px = ex + Math.cos(ang) * (PAN_R - 0.4)
      const pz = Math.sin(ang) * (PAN_R - 0.4)
      // Cadena del extremo del brazo al borde del platillo.
      const from = new THREE.Vector3(ex, ey, 0)
      const to = new THREE.Vector3(px, ey - HANG + 0.2, pz)
      const mid = from.clone().add(to).multiplyScalar(0.5)
      c.position.copy(mid)
      c.scale.set(1, from.distanceTo(to), 1)
      c.lookAt(to)
      c.rotateX(Math.PI / 2)
    })
  })

  const tower = (side: BalanceSide, segs: BalanceSeg[]) =>
    segs.map((s) => {
      const key = segKey(side, s)
      const active = hovered === key
      const dim = hovered != null && !active
      return (
        <mesh
          key={key}
          ref={(m) => {
            if (m) segRefs.current.set(key, m)
            else segRefs.current.delete(key)
          }}
          castShadow
          onPointerMove={(e) => {
            e.stopPropagation()
            if (!active) onHover(key)
          }}
          onPointerOut={() => onHover(null)}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation()
            if (e.delta < 5) onPick({ side, seg: s })
          }}
        >
          <boxGeometry args={[TOWER, 1, TOWER]} />
          <meshStandardMaterial
            color={shade(s.color, dim ? -0.65 : active ? 0.1 : -0.15)}
            emissive={s.color}
            emissiveIntensity={active ? 0.45 : dim ? 0.02 : 0.15}
            roughness={0.35}
            metalness={0.25}
          />
        </mesh>
      )
    })

  const metal = colors.dark ? '#9aa3b8' : '#6b7286'
  return (
    <group>
      {/* Pie y pilar */}
      <mesh position={[0, 0.3, 0]} receiveShadow castShadow raycast={noRaycast}>
        <cylinderGeometry args={[3.2, 3.8, 0.6, 48]} />
        <meshStandardMaterial color={shade(metal, -0.4)} metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[0, PIVOT_Y / 2, 0]} castShadow raycast={noRaycast}>
        <cylinderGeometry args={[0.45, 0.7, PIVOT_Y, 24]} />
        <meshStandardMaterial color={metal} metalness={0.85} roughness={0.25} />
      </mesh>
      <mesh position={[0, PIVOT_Y + 0.9, 0]} raycast={noRaycast}>
        <coneGeometry args={[0.9, 1.6, 4]} />
        <meshStandardMaterial color={metal} metalness={0.85} roughness={0.25} />
      </mesh>
      {/* Brazo */}
      <group ref={beam} position={[0, PIVOT_Y, 0]}>
        <mesh castShadow raycast={noRaycast}>
          <boxGeometry args={[ARM * 2 + 0.6, 0.45, 0.6]} />
          <meshStandardMaterial color={metal} metalness={0.85} roughness={0.25} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * ARM, 0, 0]} raycast={noRaycast}>
            <sphereGeometry args={[0.45, 16, 12]} />
            <meshBasicMaterial color={new THREE.Color(s < 0 ? incomeColor : expenseColor).multiplyScalar(colors.dark ? 2.5 : 1)} toneMapped={false} />
          </mesh>
        ))}
      </group>
      {/* Cadenas */}
      {Array.from({ length: 6 }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            if (m) chainRefs.current[i] = m
          }}
          raycast={noRaycast}
        >
          <cylinderGeometry args={[0.04, 0.04, 1, 6]} />
          <meshStandardMaterial color={metal} metalness={0.9} roughness={0.3} />
        </mesh>
      ))}
      {/* Platillos con sus torres */}
      {(['income', 'expense'] as const).map((side) => (
        <group key={side} ref={pans[side]}>
          <mesh receiveShadow castShadow raycast={noRaycast}>
            <cylinderGeometry args={[PAN_R, PAN_R - 0.4, 0.35, 48]} />
            <meshStandardMaterial color={shade(metal, -0.25)} metalness={0.85} roughness={0.25} />
          </mesh>
          <mesh position={[0, 0.19, 0]} rotation-x={-Math.PI / 2} raycast={noRaycast}>
            <ringGeometry args={[PAN_R - 0.35, PAN_R - 0.15, 48]} />
            <meshBasicMaterial
              color={new THREE.Color(side === 'income' ? incomeColor : expenseColor).multiplyScalar(colors.dark ? 2.2 : 1)}
              toneMapped={false}
            />
          </mesh>
          <group position={[0, 0, 0]}>{tower(side, side === 'income' ? snapshot.income : snapshot.expense)}</group>
        </group>
      ))}
    </group>
  )
}

function Stage({ dark, high }: { dark: boolean; high: boolean }) {
  const a = ambientFor(dark)
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 0]} raycast={noRaycast} receiveShadow>
        <planeGeometry args={[3000, 3000]} />
        {high ? (
          <MeshReflectorMaterial
            resolution={512}
            blur={[300, 90]}
            mixBlur={0.9}
            mixStrength={dark ? 8 : 2}
            mirror={0.65}
            depthScale={0}
            color={a.ground}
            metalness={0.4}
            roughness={0.8}
          />
        ) : (
          <meshStandardMaterial color={a.ground} roughness={1} />
        )}
      </mesh>
      {[18, 26].map((r) => (
        <mesh key={r} rotation-x={-Math.PI / 2} position={[0, 0.01, 0]} raycast={noRaycast}>
          <ringGeometry args={[r, r + 0.08, 128]} />
          <meshBasicMaterial
            color={new THREE.Color(dark ? '#6c63ff' : '#9aa0b8').multiplyScalar(dark ? 1.6 : 1)}
            toneMapped={false}
            transparent
            opacity={0.7}
          />
        </mesh>
      ))}
    </group>
  )
}

function useSpecs(p: BalanceCanvasProps): LabelSpec[] {
  const { snapshot, scaleMax, hovered, currency, locale, incomeColor, expenseColor } = p
  return useMemo(() => {
    const money = (v: number) => fmtMoney(v, { currency, locale })
    const tilt = tiltAngle(snapshot.tilt)
    const specs: LabelSpec[] = []
    const sides: [BalanceSide, BalanceSeg[], number, string, string][] = [
      ['income', snapshot.income, snapshot.incomeTotal, 'Ingresos', incomeColor],
      ['expense', snapshot.expense, snapshot.expenseTotal, 'Gastos', expenseColor],
    ]
    for (const [side, segs, total, title, color] of sides) {
      const sign = side === 'income' ? -1 : 1
      const ex = sign * ARM * Math.cos(tilt)
      const panY = PIVOT_Y - sign * ARM * Math.sin(tilt) - HANG
      const h = towerHeight(total, scaleMax)
      let y = panY + 0.35
      for (const s of segs) {
        const sh = towerHeight(s.value, scaleMax)
        const key = segKey(side, s)
        if (hovered === key)
          specs.push({
            id: `focus:${key}`,
            pos: [ex, y + sh, 0],
            color: s.color,
            icon: s.icon,
            title: s.name,
            value: money(s.value),
            sub: total > 0 ? `${fmtPercent(s.value / total, locale)} de ${title.toLowerCase()}` : undefined,
            focus: true,
          })
        else if (total > 0 && s.value / total > 0.1)
          specs.push({
            id: `seg:${key}`,
            pos: [ex + sign * (TOWER / 2 + 0.2), y + sh / 2, TOWER / 2],
            color: s.color,
            icon: s.icon,
            title: s.name,
            value: money(s.value),
          })
        y += sh + 0.06
      }
      specs.push({
        id: `head:${side}`,
        pos: [ex, panY + 0.35 + h + 1.4, 0],
        color,
        title,
        value: money(total),
        icon: side === 'income' ? 'HandCoins' : 'Receipt',
      })
    }
    return specs
  }, [snapshot, scaleMax, hovered, currency, locale, incomeColor, expenseColor])
}

function Rig({ frameKey }: { frameKey: string }) {
  const controls = useRef<ComponentRef<typeof CameraControls>>(null)
  const size = useThree((s) => s.size)
  useEffect(() => {
    const c = controls.current
    if (!c) return
    const portrait = size.height > size.width
    void c.rotateTo(0.12, portrait ? 1.12 : 1.2, true)
    void c.fitToSphere(new THREE.Sphere(new THREE.Vector3(0, portrait ? 10 : 12, 2), portrait ? 19 : 24), true)
  }, [frameKey, size.width, size.height])
  return <CameraControls ref={controls} makeDefault minPolarAngle={0.3} maxPolarAngle={1.45} minDistance={10} maxDistance={300} smoothTime={0.4} />
}

export function BalanceCanvas(props: BalanceCanvasProps) {
  const { quality, colors, hovered } = props
  const high = quality === 'high'
  useCursor(hovered != null)
  const specs = useSpecs(props)
  const els = useMemo(() => new Map<string, HTMLDivElement>(), [])
  return (
    <div className="absolute inset-0">
      <Canvas
        shadows={high ? 'percentage' : false}
        dpr={high ? [1, 2] : 1}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ position: [20, 24, 60], fov: 38, near: 0.5, far: 5000 }}
        onPointerMissed={() => props.onHover(null)}
      >
        <Sky dark={colors.dark} />
        <fog attach="fog" args={[ambientFor(colors.dark).horizon, 80, 300]} />
        <FogRig radius={60} />
        <ambientLight intensity={colors.dark ? 0.35 : 0.8} />
        <hemisphereLight args={[colors.accent2, colors.canvas, colors.dark ? 0.4 : 0.5]} />
        <spotLight position={[0, 60, 25]} angle={0.5} penumbra={0.6} intensity={colors.dark ? 900 : 600} castShadow={high} shadow-mapSize={[1024, 1024]} />
        <directionalLight position={[-40, 30, -40]} intensity={colors.dark ? 0.8 : 0.5} color={colors.accent} />

        <Stage dark={colors.dark} high={high} />
        <Scale {...props} />
        <LabelProjector specs={specs} els={els} />
        <Rig frameKey={props.frameKey} />

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
