import { Stars } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { ambientFor } from '../city/ambient'

const noRaycast = () => null

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

/**
 * La niebla sigue a la cámara: empieza un poco por delante de la ciudad y termina pasado el extrarradio, sea cual
 * sea el encuadre (en móvil vertical la cámara se aleja mucho más para que quepa el ancho).
 */
export function FogRig({ radius }: { radius: number }) {
  useFrame(({ camera, scene }) => {
    const fog = scene.fog as THREE.Fog | null
    if (!fog) return
    const d = camera.position.length()
    fog.near = d * 0.8
    fog.far = d + radius * 1.6
  })
  return null
}
