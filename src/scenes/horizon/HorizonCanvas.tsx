import { CameraControls, Line, MeshReflectorMaterial } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { useEffect, useMemo, useRef, type ComponentRef } from 'react'
import * as THREE from 'three'
import { fmtMoney, fmtMonth } from '../../model/format'
import { addMonths } from '../../model/series'
import type { ResolvedQuality, SceneColors } from '../common'
import { ambientFor } from '../city/ambient'
import { FogRig, Sky } from '../shared/atmosphere'
import { LabelLayer, LabelProjector, type LabelSpec } from '../shared/labels'
import type { HorizonGate, HorizonLayout, HorizonSeries } from './layout'

export interface HorizonCanvasProps {
  layout: HorizonLayout
  colors: SceneColors
  quality: ResolvedQuality
  currency: string
  locale: string
  /** Mes de hoy (aaaa-mm): pone fecha a los años y a los pórticos. */
  startMonth: string
  /** Cambia cuando cambian los datos: las cintas vuelven a crecer hacia el horizonte. */
  animKey: string
}

const noRaycast = () => null
const RIBBON_W = 2.2
const GROW_SECONDS = 1.6
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

/** Cortina bajo la cinta: del color de la serie, más opaca arriba y transparente en el suelo. Con niebla. */
function curtainMaterial(color: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0.42 } }]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      attribute float aH;
      varying float vH;
      void main() {
        vH = aH;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vH;
      #include <fog_pars_fragment>
      void main() {
        gl_FragColor = vec4(uColor, uOpacity * pow(vH, 1.2));
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  })
}

function Ribbon({ s, main, animKey }: { s: HorizonSeries; main: boolean; animKey: string }) {
  const band = useRef<THREE.Mesh>(null)
  const curtain = useRef<THREE.Mesh>(null)
  const start = useRef(-1)
  const n = s.points.length
  // Banda horizontal (la cinta) y cortina vertical hasta el suelo, con los mismos puntos.
  const { bandGeo, curtainGeo } = useMemo(() => {
    const bandPos: number[] = []
    const curtPos: number[] = []
    const curtH: number[] = []
    for (const [x, y, z] of s.points) {
      bandPos.push(x - RIBBON_W / 2, y, z, x + RIBBON_W / 2, y, z)
      curtPos.push(x, y, z, x, 0, z)
      curtH.push(1, 0)
    }
    const idx: number[] = []
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    const bandGeo = new THREE.BufferGeometry()
    bandGeo.setAttribute('position', new THREE.Float32BufferAttribute(bandPos, 3))
    bandGeo.setIndex(idx)
    bandGeo.computeVertexNormals()
    const curtainGeo = new THREE.BufferGeometry()
    curtainGeo.setAttribute('position', new THREE.Float32BufferAttribute(curtPos, 3))
    curtainGeo.setAttribute('aH', new THREE.Float32BufferAttribute(curtH, 1))
    curtainGeo.setIndex(idx)
    return { bandGeo, curtainGeo }
  }, [s.points, n])
  const curtainMat = useMemo(() => curtainMaterial(s.color), [s.color])
  const glow = useMemo(() => new THREE.Color(s.color).multiplyScalar(main ? 2.4 : 1.4), [s.color, main])
  const edge = useMemo(() => s.points.map(([x, y, z]) => new THREE.Vector3(x, y + 0.06, z)), [s.points])
  useEffect(
    () => () => {
      bandGeo.dispose()
      curtainGeo.dispose()
      curtainMat.dispose()
    },
    [bandGeo, curtainGeo, curtainMat],
  )
  useEffect(() => {
    start.current = -1
  }, [animKey])

  // La cinta crece hacia el horizonte al entrar o al cambiar el escenario.
  useFrame(({ clock }) => {
    if (start.current < 0) start.current = clock.elapsedTime
    const p = easeOut(Math.min(1, (clock.elapsedTime - start.current) / GROW_SECONDS))
    const count = Math.max(0, Math.floor((n - 1) * p)) * 6
    bandGeo.setDrawRange(0, count)
    curtainGeo.setDrawRange(0, count)
  })

  return (
    <group>
      <mesh ref={band} geometry={bandGeo} raycast={noRaycast}>
        <meshStandardMaterial
          color={s.color}
          emissive={s.color}
          emissiveIntensity={main ? 0.9 : 0.35}
          roughness={0.35}
          metalness={0.2}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh ref={curtain} geometry={curtainGeo} material={curtainMat} raycast={noRaycast} />
      <Line points={edge} color={glow} lineWidth={main ? 2.5 : 1.5} toneMapped={false} raycast={noRaycast} />
    </group>
  )
}

/** Pórtico de un objetivo: dos columnas y un dintel a la altura de la meta, en el mes en que se alcanza. */
function Gate({ g, width, dark }: { g: HorizonGate; width: number; dark: boolean }) {
  const half = width / 2 + 1.6
  const reached = g.inside
  const c = useMemo(() => new THREE.Color(g.color).multiplyScalar(reached ? (dark ? 2.2 : 1.2) : 0.6), [g.color, reached, dark])
  const h = Math.max(0.5, g.y)
  return (
    // El pórtico abarca todos los carriles: se ve como un marco que la cinta atraviesa.
    <group position={[0, 0, g.z]}>
      {[-half, half].map((x) => (
        <mesh key={x} position={[x, h / 2, 0]} raycast={noRaycast}>
          <boxGeometry args={[0.35, h, 0.35]} />
          <meshBasicMaterial color={c} toneMapped={false} transparent opacity={reached ? 1 : 0.45} />
        </mesh>
      ))}
      <mesh position={[0, h, 0]} raycast={noRaycast}>
        <boxGeometry args={[half * 2 + 0.35, 0.35, 0.35]} />
        <meshBasicMaterial color={c} toneMapped={false} transparent opacity={reached ? 1 : 0.45} />
      </mesh>
      {/* Velo del pórtico: se ve el paso de la cinta a través de la meta. */}
      <mesh position={[0, h / 2, 0]} raycast={noRaycast}>
        <planeGeometry args={[half * 2, h]} />
        <meshBasicMaterial color={g.color} transparent opacity={reached ? 0.07 : 0.03} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  )
}

function Floor({ layout, dark, high }: { layout: HorizonLayout; dark: boolean; high: boolean }) {
  const a = ambientFor(dark)
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, -layout.length / 2]} raycast={noRaycast}>
        <planeGeometry args={[3000, 3000]} />
        {high ? (
          <MeshReflectorMaterial
            resolution={512}
            blur={[300, 90]}
            mixBlur={0.9}
            mixStrength={dark ? 5 : 2}
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
      {layout.years.map((y) => (
        <mesh key={y.month} position={[0, 0.01, y.z]} raycast={noRaycast}>
          <boxGeometry args={[layout.width + 10, 0.01, 0.12]} />
          <meshBasicMaterial color={dark ? '#5b6390' : '#8a90aa'} />
        </mesh>
      ))}
    </group>
  )
}

function Rig({ layout, animKey }: { layout: HorizonLayout; animKey: string }) {
  const controls = useRef<ComponentRef<typeof CameraControls>>(null)
  const size = useThree((s) => s.size)
  useEffect(() => {
    const c = controls.current
    if (!c) return
    const portrait = size.height > size.width
    // De lado: hoy a la izquierda y el futuro a la derecha, perdiéndose en la niebla. Las cortinas se leen como
    // muros que suben con el tiempo y los pórticos se ven de frente al pasar la cinta.
    const dist = layout.length * (portrait ? 1.25 : 0.86)
    void c.setLookAt(dist, layout.maxH * (portrait ? 1.1 : 0.8), layout.length * 0.12, 0, layout.maxH * 0.45, -layout.length * 0.5, true)
  }, [layout.width, layout.maxH, layout.length, size.width, size.height, animKey])
  return <CameraControls ref={controls} makeDefault minPolarAngle={0.2} maxPolarAngle={1.5} minDistance={8} maxDistance={700} dollyToCursor smoothTime={0.4} />
}

function useSpecs({ layout, currency, locale, startMonth }: Pick<HorizonCanvasProps, 'layout' | 'currency' | 'locale' | 'startMonth'>): LabelSpec[] {
  return useMemo(() => {
    const money = (v: number) => fmtMoney(v, { currency, locale, compact: true })
    const specs: LabelSpec[] = []
    layout.series.forEach((s) => {
      const end = s.points[s.points.length - 1]
      specs.push({
        id: `s:${s.id}`,
        pos: [end[0], end[1] + 1.2, end[2]],
        color: s.color,
        title: s.label,
        value: money(s.values[s.values.length - 1]),
        sub: `en ${fmtMonth(addMonths(startMonth, layout.months))}`,
      })
    })
    for (const g of layout.gates) {
      specs.push({
        id: `g:${g.id}`,
        pos: [0, Math.max(0.5, g.y) + 1.1, g.z],
        color: g.color,
        icon: g.icon,
        title: g.name,
        value: money(g.target),
        sub:
          !g.inside || g.month == null
            ? 'más allá de este horizonte'
            : `${fmtMonth(addMonths(startMonth, g.month))}${g.sooner && g.sooner > 0 ? ` · ${g.sooner} meses antes` : ''}`,
        focus: true,
      })
    }
    for (const y of layout.years)
      specs.push({
        id: `y:${y.month}`,
        pos: [layout.width / 2 + 5, 0, y.z],
        color: '',
        title: addMonths(startMonth, y.month).slice(0, 4),
        value: '',
        axis: true,
      })
    return specs
  }, [layout, currency, locale, startMonth])
}

export function HorizonCanvas(props: HorizonCanvasProps) {
  const { layout, colors, quality, animKey } = props
  const high = quality === 'high'
  const specs = useSpecs(props)
  const els = useMemo(() => new Map<string, HTMLDivElement>(), [])
  return (
    <div className="absolute inset-0">
      <Canvas
        dpr={high ? [1, 2] : 1}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ position: [20, 20, 30], fov: 42, near: 0.5, far: 5000 }}
      >
        <Sky dark={colors.dark} />
        {/* Niebla larga: el futuro lejano se funde con el horizonte. */}
        <fog attach="fog" args={[ambientFor(colors.dark).horizon, 60, layout.length * 1.4]} />
        <FogRig radius={layout.length} />
        <ambientLight intensity={colors.dark ? 0.4 : 0.85} />
        <hemisphereLight args={[colors.accent2, colors.canvas, colors.dark ? 0.4 : 0.5]} />
        <directionalLight position={[30, 60, 40]} intensity={colors.dark ? 1.4 : 2} />
        <Floor layout={layout} dark={colors.dark} high={high} />
        {layout.series.map((s, i) => (
          <Ribbon key={`${s.id}:${s.points.length}`} s={s} main={i === 0} animKey={animKey} />
        ))}
        {layout.gates.map((g) => (
          <Gate key={g.id} g={g} width={layout.width} dark={colors.dark} />
        ))}
        <LabelProjector specs={specs} els={els} />
        <Rig layout={layout} animKey={animKey} />
        {high && (
          <EffectComposer multisampling={4}>
            <Bloom mipmapBlur intensity={colors.dark ? 0.9 : 0.3} luminanceThreshold={1} luminanceSmoothing={0.2} />
            <Vignette eskil={false} offset={0.25} darkness={colors.dark ? 0.5 : 0.2} />
          </EffectComposer>
        )}
      </Canvas>
      <LabelLayer specs={specs} els={els} />
    </div>
  )
}
