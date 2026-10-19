import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { shade } from '../../lib/color'
import type { SceneColors } from '../common'
import { Sky } from '../shared/atmosphere'
import { ambientFor } from './ambient'
import { baseY, type CityLayout } from './layout'
import { createWindowMaterial } from './windowMaterial'

const tmp = new THREE.Object3D()
const col = new THREE.Color()
const noRaycast = () => null

function Towers({ layout, dark }: { layout: CityLayout; dark: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const towers = useMemo(() => layout.buildings.flatMap((b) => b.towers.map((t) => ({ b, t }))), [layout])
  const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), [])
  const mat = useMemo(() => createWindowMaterial(dark ? '#ffd7a1' : '#fff3d6', dark ? 1.25 : 0.35), [dark])
  useEffect(() => () => mat.dispose(), [mat])
  useLayoutEffect(() => {
    const m = mesh.current
    if (!m) return
    towers.forEach(({ b, t }, i) => {
      tmp.position.set(b.x + t.dx, baseY(b), b.z + t.dz)
      tmp.scale.set(t.w, t.h, t.d)
      tmp.updateMatrix()
      m.setMatrixAt(i, tmp.matrix)
      m.setColorAt(i, col.set(shade(b.color, -0.15)))
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [towers])
  return <instancedMesh ref={mesh} args={[geo, mat, towers.length]} raycast={noRaycast} />
}

/** Órbita lenta alrededor de la ciudad. */
function Orbit({ radius, height }: { radius: number; height: number }) {
  useFrame(({ camera, clock }) => {
    const a = clock.elapsedTime * 0.12 + 0.6
    camera.position.set(Math.cos(a) * radius, height, Math.sin(a) * radius)
    camera.lookAt(0, 4, 0)
  })
  return null
}

/** Ciudad en miniatura para el Inicio: sin controles, sin decorado, sin rótulos. Un clic lleva a la Ciudad. */
export function MiniCity({ layout, colors }: { layout: CityLayout; colors: SceneColors }) {
  const a = ambientFor(colors.dark)
  const radius = layout.size * 1.05
  return (
    <Canvas dpr={[1, 1.5]} gl={{ antialias: true }} camera={{ fov: 35, near: 0.5, far: 5000 }} frameloop="always">
      <Sky dark={colors.dark} />
      <fog attach="fog" args={[a.horizon, radius * 1.1, radius * 2.6]} />
      <ambientLight intensity={colors.dark ? 0.45 : 0.9} />
      <hemisphereLight args={[colors.accent2, colors.canvas, colors.dark ? 0.4 : 0.5]} />
      <directionalLight position={[60, 120, 40]} intensity={colors.dark ? 1.6 : 2} />
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 0]} raycast={noRaycast}>
        <planeGeometry args={[3000, 3000]} />
        <meshStandardMaterial color={a.slab} roughness={1} />
      </mesh>
      <Towers layout={layout} dark={colors.dark} />
      <Orbit radius={radius} height={layout.size * 0.62} />
    </Canvas>
  )
}
