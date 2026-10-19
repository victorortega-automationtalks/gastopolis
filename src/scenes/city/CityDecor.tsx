import { MeshReflectorMaterial, Stars } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { ResolvedQuality } from '../common'
import { perimeter, pointOnLoop, type CityDecorData } from './decor'
import { baseY, type CityLayout } from './layout'
import { ambientFor, type Ambient } from './ambient'
import { createWindowMaterial } from './windowMaterial'

const CAR_COLORS = ['#d8dbe2', '#9aa3b2', '#1b1d24', '#7a1e24', '#1f3a6b', '#3b3f48', '#c9c2b4']
const noRaycast = () => null
const tmp = new THREE.Object3D()
const col = new THREE.Color()
const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)

/** Coloca (y colorea, si `fill` devuelve un color) todas las instancias de una malla estática. */
function fillInstances(m: THREE.InstancedMesh | null, count: number, fill: (i: number, o: THREE.Object3D) => string | void) {
  if (!m) return
  for (let i = 0; i < count; i++) {
    tmp.position.set(0, 0, 0)
    tmp.rotation.set(0, 0, 0)
    tmp.scale.set(1, 1, 1)
    const c = fill(i, tmp)
    tmp.updateMatrix()
    m.setMatrixAt(i, tmp.matrix)
    if (c) m.setColorAt(i, col.set(c))
  }
  m.instanceMatrix.needsUpdate = true
  if (m.instanceColor) m.instanceColor.needsUpdate = true
}

function glowMaterial(color: string, intensity: number, opts: THREE.MeshBasicMaterialParameters = {}) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: false, ...opts })
}

export function CityDecor({ decor, layout, dark, quality }: { decor: CityDecorData; layout: CityLayout; dark: boolean; quality: ResolvedQuality }) {
  const a = ambientFor(dark)
  const high = quality === 'high'
  return (
    // key por número de instancias en cada grupo: si cambia, se crean mallas nuevas con la capacidad justa.
    <group>
      <Ground key={`g${decor.dashes.length}-${decor.parks.length}`} decor={decor} a={a} />
      <River decor={decor} a={a} high={high} />
      <Lamps key={`l${decor.lamps.length}`} decor={decor} a={a} dark={dark} />
      <Trees key={`t${decor.trees.length}`} decor={decor} a={a} />
      <Outskirts key={`o${decor.lots.length}`} decor={decor} a={a} />
      <Traffic key={`c${decor.loops.reduce((n, l) => n + l.starts.length, 0)}`} decor={decor} a={a} />
      <Boats key={`b${decor.boats.length}`} decor={decor} a={a} />
      <Rooftops key={`r${decor.roof.length}-${layout.buildings.length}`} decor={decor} layout={layout} a={a} />
    </group>
  )
}

/** Cúpula con degradado (horizonte iluminado por la ciudad, cénit oscuro) y estrellas de noche. */
export function Sky({ dark }: { dark: boolean }) {
  const a = ambientFor(dark)
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { top: { value: new THREE.Color(a.skyTop) }, horizon: { value: new THREE.Color(a.horizon) } },
        vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        // colorspace_fragment pasa de lineal a sRGB como los materiales estándar: sin él, el cielo sale más oscuro que
        // la niebla del mismo color y se ve una costura en el horizonte.
        fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 vDir;
          void main() {
            float t = smoothstep(-0.02, 0.3, vDir.y);
            gl_FragColor = vec4(mix(horizon, top, t), 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    [a],
  )
  useEffect(() => () => mat.dispose(), [mat])
  // La cúpula va centrada en la cámara: así su horizonte coincide con el de verdad y no hay costura con el suelo.
  const dome = useRef<THREE.Mesh>(null)
  useFrame(({ camera }) => dome.current?.position.copy(camera.position))
  return (
    <group>
      <mesh ref={dome} material={mat} raycast={noRaycast} renderOrder={-1} frustumCulled={false}>
        <sphereGeometry args={[2400, 32, 16]} />
      </mesh>
      {dark && <Stars radius={700} depth={200} count={1800} factor={5} saturation={0} fade speed={0.4} />}
    </group>
  )
}

function Ground({ decor, a }: { decor: CityDecorData; a: Ambient }) {
  const dashes = useRef<THREE.InstancedMesh>(null)
  const parks = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(
    () =>
      fillInstances(dashes.current, decor.dashes.length, (i, o) => {
        const d = decor.dashes[i]
        o.position.set(d.x, 0.005, d.z)
        o.scale.set(d.alongX ? 1.2 : 0.12, 0.01, d.alongX ? 0.12 : 1.2)
      }),
    [decor],
  )
  useLayoutEffect(
    () =>
      fillInstances(parks.current, decor.parks.length, (i, o) => {
        const p = decor.parks[i]
        o.position.set((p.x0 + p.x1) / 2, 0, (p.z0 + p.z1) / 2)
        o.scale.set(p.x1 - p.x0, 0.06, p.z1 - p.z0)
      }),
    [decor],
  )
  // El suelo llega hasta el horizonte: la niebla lo funde con el cielo y no se ve dónde acaba.
  const R = 1500
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.04, 0]} raycast={noRaycast} receiveShadow>
        <planeGeometry args={[R * 2, R * 2]} />
        <meshStandardMaterial color={a.ground} roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.03, 0]} raycast={noRaycast} receiveShadow>
        <planeGeometry args={[decor.ring.outer * 2, decor.ring.outer * 2]} />
        <meshStandardMaterial color={a.ring} roughness={0.95} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 0]} raycast={noRaycast} receiveShadow>
        <planeGeometry args={[decor.ring.inner * 2, decor.ring.inner * 2]} />
        <meshStandardMaterial color={a.slab} roughness={0.9} />
      </mesh>
      <instancedMesh ref={dashes} args={[box, undefined, decor.dashes.length]} raycast={noRaycast}>
        <meshBasicMaterial color={a.dash} />
      </instancedMesh>
      <instancedMesh ref={parks} args={[box, undefined, decor.parks.length]} raycast={noRaycast} receiveShadow>
        <meshStandardMaterial color={a.park} roughness={1} />
      </instancedMesh>
    </group>
  )
}

function River({ decor, a, high }: { decor: CityDecorData; a: Ambient; high: boolean }) {
  const r = decor.river
  const w = r.x1 - r.x0
  const d = r.z1 - r.z0
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[(r.x0 + r.x1) / 2, -0.01, (r.z0 + r.z1) / 2]} raycast={noRaycast}>
        <planeGeometry args={[w, d]} />
        {high ? (
          <MeshReflectorMaterial
            resolution={512}
            blur={[260, 80]}
            mixBlur={0.9}
            mixStrength={14}
            mirror={0.85}
            depthScale={0}
            color={a.water}
            metalness={0.5}
            roughness={0.7}
          />
        ) : (
          <meshStandardMaterial color={a.water} metalness={0.4} roughness={0.35} />
        )}
      </mesh>
      {[r.z0 - 0.2, r.z1 + 0.2].map((z) => (
        <mesh key={z} position={[(r.x0 + r.x1) / 2, 0, z]} scale={[w, 0.25, 0.4]} geometry={box} raycast={noRaycast}>
          <meshStandardMaterial color={a.bank} roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}

function Lamps({ decor, a, dark }: { decor: CityDecorData; a: Ambient; dark: boolean }) {
  const poles = useRef<THREE.InstancedMesh>(null)
  const bulbs = useRef<THREE.InstancedMesh>(null)
  const pools = useRef<THREE.InstancedMesh>(null)
  const n = decor.lamps.length
  const poleGeo = useMemo(() => new THREE.CylinderGeometry(0.035, 0.05, 1, 5).translate(0, 0.5, 0), [])
  const bulbGeo = useMemo(() => new THREE.SphereGeometry(0.11, 8, 6), [])
  const poolGeo = useMemo(() => new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), [])
  const bulbMat = useMemo(() => glowMaterial(a.bulb, a.glow), [a])
  const poolMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: a.pool, transparent: true, opacity: dark ? 0.16 : 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    [a, dark],
  )
  useLayoutEffect(
    () =>
      fillInstances(poles.current, n, (i, o) => {
        o.position.set(decor.lamps[i].x, 0, decor.lamps[i].z)
        o.scale.set(1, 1.3, 1)
      }),
    [decor, n],
  )
  useLayoutEffect(
    () =>
      fillInstances(bulbs.current, n, (i, o) => {
        o.position.set(decor.lamps[i].x, 1.35, decor.lamps[i].z)
      }),
    [decor, n],
  )
  useLayoutEffect(
    () =>
      fillInstances(pools.current, n, (i, o) => {
        o.position.set(decor.lamps[i].x, 0.02, decor.lamps[i].z)
        o.scale.setScalar(1.1)
      }),
    [decor, n],
  )
  return (
    <group>
      <instancedMesh ref={poles} args={[poleGeo, undefined, n]} raycast={noRaycast}>
        <meshStandardMaterial color={a.pole} roughness={0.6} metalness={0.4} />
      </instancedMesh>
      <instancedMesh ref={bulbs} args={[bulbGeo, bulbMat, n]} raycast={noRaycast} />
      <instancedMesh ref={pools} args={[poolGeo, poolMat, n]} raycast={noRaycast} renderOrder={1} />
    </group>
  )
}

function Trees({ decor, a }: { decor: CityDecorData; a: Ambient }) {
  const trunks = useRef<THREE.InstancedMesh>(null)
  const crowns = useRef<THREE.InstancedMesh>(null)
  const n = decor.trees.length
  const trunkGeo = useMemo(() => new THREE.CylinderGeometry(0.06, 0.08, 1, 5).translate(0, 0.5, 0), [])
  const crownGeo = useMemo(() => new THREE.IcosahedronGeometry(0.55, 0), [])
  useLayoutEffect(
    () =>
      fillInstances(trunks.current, n, (i, o) => {
        const t = decor.trees[i]
        o.position.set(t.x, 0, t.z)
        o.scale.set(t.s, 0.6 * t.s, t.s)
      }),
    [decor, n],
  )
  useLayoutEffect(
    () =>
      fillInstances(crowns.current, n, (i, o) => {
        const t = decor.trees[i]
        o.position.set(t.x, 0.6 * t.s + 0.45 * t.s, t.z)
        o.scale.set(t.s, t.s * 1.15, t.s)
        o.rotation.y = i
      }),
    [decor, n],
  )
  return (
    <group>
      <instancedMesh ref={trunks} args={[trunkGeo, undefined, n]} raycast={noRaycast}>
        <meshStandardMaterial color={a.trunk} roughness={1} />
      </instancedMesh>
      <instancedMesh ref={crowns} args={[crownGeo, undefined, n]} raycast={noRaycast} castShadow>
        <meshStandardMaterial color={a.canopy} roughness={0.9} flatShading />
      </instancedMesh>
    </group>
  )
}

function Outskirts({ decor, a }: { decor: CityDecorData; a: Ambient }) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const n = decor.lots.length
  const mat = useMemo(() => createWindowMaterial(a.windows[0], a.windows[1]), [a])
  useEffect(() => () => mat.dispose(), [mat])
  useLayoutEffect(
    () =>
      fillInstances(mesh.current, n, (i, o) => {
        const l = decor.lots[i]
        o.position.set(l.x, 0, l.z)
        o.scale.set(l.w, l.h, l.d)
        return a.tones[l.tone]
      }),
    [decor, a, n],
  )
  return <instancedMesh ref={mesh} args={[box, mat, n]} raycast={noRaycast} receiveShadow />
}

/** Coches con faros delante y pilotos detrás; dan vueltas a cada manzana y a la ronda. */
function Traffic({ decor, a }: { decor: CityDecorData; a: Ambient }) {
  const bodies = useRef<THREE.InstancedMesh>(null)
  const heads = useRef<THREE.InstancedMesh>(null)
  const tails = useRef<THREE.InstancedMesh>(null)
  const cars = useMemo(() => decor.loops.flatMap((loop) => loop.starts.map((s) => ({ loop, s, p: perimeter(loop.rect) }))), [decor])
  const n = cars.length
  const headMat = useMemo(() => glowMaterial(a.head, a.glow), [a])
  const tailMat = useMemo(() => glowMaterial(a.tail, a.glow), [a])
  const lightGeo = useMemo(() => new THREE.BoxGeometry(0.05, 0.05, 0.07), [])

  useLayoutEffect(() => {
    const m = bodies.current
    if (!m) return
    cars.forEach((_, i) => m.setColorAt(i, col.set(CAR_COLORS[i % CAR_COLORS.length])))
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [cars])

  useFrame(({ clock }) => {
    const b = bodies.current
    const h = heads.current
    const t = tails.current
    if (!b || !h || !t) return
    const time = clock.elapsedTime
    for (let i = 0; i < n; i++) {
      const c = cars[i]
      const dist = c.s + (c.loop.reverse ? -1 : 1) * c.loop.speed * time
      const { x, z, angle } = pointOnLoop(c.loop.rect, dist)
      const heading = angle + (c.loop.reverse ? Math.PI : 0)
      const fx = Math.cos(heading)
      const fz = -Math.sin(heading)
      tmp.position.set(x, 0, z)
      tmp.rotation.set(0, heading, 0)
      tmp.scale.set(0.72, 0.24, 0.34)
      tmp.updateMatrix()
      b.setMatrixAt(i, tmp.matrix)
      // Dos faros y dos pilotos: a izquierda y derecha del eje del coche.
      for (let k = 0; k < 2; k++) {
        const side = k === 0 ? 0.11 : -0.11
        const sx = fz * side
        const sz = -fx * side
        tmp.scale.set(1, 1, 1)
        tmp.position.set(x + fx * 0.37 + sx, 0.13, z + fz * 0.37 + sz)
        tmp.updateMatrix()
        h.setMatrixAt(i * 2 + k, tmp.matrix)
        tmp.position.set(x - fx * 0.37 + sx, 0.13, z - fz * 0.37 + sz)
        tmp.updateMatrix()
        t.setMatrixAt(i * 2 + k, tmp.matrix)
      }
    }
    b.instanceMatrix.needsUpdate = true
    h.instanceMatrix.needsUpdate = true
    t.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={bodies} args={[box, undefined, n]} raycast={noRaycast}>
        <meshStandardMaterial roughness={0.35} metalness={0.5} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[lightGeo, headMat, n * 2]} raycast={noRaycast} />
      <instancedMesh ref={tails} args={[lightGeo, tailMat, n * 2]} raycast={noRaycast} />
    </group>
  )
}

function Boats({ decor, a }: { decor: CityDecorData; a: Ambient }) {
  const hulls = useRef<THREE.InstancedMesh>(null)
  const lights = useRef<THREE.InstancedMesh>(null)
  const n = decor.boats.length
  const lightMat = useMemo(() => glowMaterial(a.bulb, a.glow), [a])
  const lightGeo = useMemo(() => new THREE.SphereGeometry(0.12, 8, 6), [])
  const span = decor.river.x1 - decor.river.x0
  useFrame(({ clock }) => {
    const hm = hulls.current
    const lm = lights.current
    if (!hm || !lm) return
    decor.boats.forEach((b, i) => {
      const x = decor.river.x0 + ((((b.phase + b.speed * clock.elapsedTime) % span) + span) % span)
      const bob = Math.sin(clock.elapsedTime * 1.3 + i) * 0.04
      tmp.rotation.set(0, b.speed < 0 ? Math.PI : 0, 0)
      tmp.position.set(x, bob, b.z)
      tmp.scale.set(b.len, 0.35, 0.8)
      tmp.updateMatrix()
      hm.setMatrixAt(i, tmp.matrix)
      tmp.rotation.set(0, 0, 0)
      tmp.scale.set(1, 1, 1)
      tmp.position.set(x, 0.55 + bob, b.z)
      tmp.updateMatrix()
      lm.setMatrixAt(i, tmp.matrix)
    })
    hm.instanceMatrix.needsUpdate = true
    lm.instanceMatrix.needsUpdate = true
  })
  return (
    <group>
      <instancedMesh ref={hulls} args={[box, undefined, n]} raycast={noRaycast}>
        <meshStandardMaterial color={a.boat} roughness={0.4} />
      </instancedMesh>
      <instancedMesh ref={lights} args={[lightGeo, lightMat, n]} raycast={noRaycast} />
    </group>
  )
}

/** Máquinas y antenas en las azoteas. Aparecen cuando los edificios terminan de crecer. */
function Rooftops({ decor, layout, a }: { decor: CityDecorData; layout: CityLayout; a: Ambient }) {
  const items = useRef<THREE.InstancedMesh>(null)
  const beacons = useRef<THREE.InstancedMesh>(null)
  const boxes = useMemo(() => decor.roof.filter((r) => layout.buildings[r.building]?.towers[r.tower]), [decor, layout])
  const antennas = useMemo(() => boxes.filter((r) => r.antenna), [boxes])
  const beaconMat = useMemo(() => glowMaterial(a.antenna, a.glow), [a])
  const beaconGeo = useMemo(() => new THREE.SphereGeometry(0.16, 8, 6), [])
  const shown = useRef({ at: -1, done: false })
  useLayoutEffect(() => {
    shown.current = { at: -1, done: false }
  }, [layout])

  useFrame(({ clock }) => {
    const s = shown.current
    const im = items.current
    const bm = beacons.current
    if (s.done || !im || !bm) return
    if (s.at < 0) s.at = clock.elapsedTime
    const k = Math.min(1, Math.max(0, (clock.elapsedTime - s.at - 1.2) / 0.4))
    boxes.forEach((r, i) => {
      const b = layout.buildings[r.building]
      tmp.position.set(b.x + r.dx, baseY(b) + b.towers[r.tower].h + 0.12, b.z + r.dz)
      tmp.scale.set(r.w, r.h * k + 1e-4, r.d)
      tmp.updateMatrix()
      im.setMatrixAt(i, tmp.matrix)
    })
    antennas.forEach((r, i) => {
      const b = layout.buildings[r.building]
      tmp.position.set(b.x + r.dx, baseY(b) + b.towers[r.tower].h + 0.12 + r.h * k, b.z + r.dz)
      tmp.scale.setScalar(k + 1e-4)
      tmp.updateMatrix()
      bm.setMatrixAt(i, tmp.matrix)
    })
    im.instanceMatrix.needsUpdate = true
    bm.instanceMatrix.needsUpdate = true
    if (k >= 1) s.done = true
  })

  return (
    <group>
      <instancedMesh ref={items} args={[box, undefined, boxes.length]} raycast={noRaycast} castShadow>
        <meshStandardMaterial color={a.roofItem} roughness={0.7} metalness={0.3} />
      </instancedMesh>
      <instancedMesh ref={beacons} args={[beaconGeo, beaconMat, antennas.length]} raycast={noRaycast} />
    </group>
  )
}
