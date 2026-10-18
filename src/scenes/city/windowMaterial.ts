import * as THREE from 'three'

/**
 * Material de edificio con ventanas encendidas al azar en las fachadas. Las ventanas se calculan en coordenadas
 * de mundo, así tienen el mismo tamaño en un rascacielos que en una caseta (las cajas están escaladas).
 */
export function createWindowMaterial(windowColor: string, intensity: number): THREE.MeshStandardMaterial {
  const uniforms = {
    uWindow: { value: new THREE.Color(windowColor).multiplyScalar(intensity) },
  }
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.18 })
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vONormal;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
        vec4 gw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          gw = instanceMatrix * gw;
        #endif
        vWPos = (modelMatrix * gw).xyz;
        vONormal = normal;`,
    )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vONormal;\nuniform vec3 uWindow;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float side = 1.0 - step(0.5, abs(vONormal.y));
          float u = abs(vONormal.x) > 0.5 ? vWPos.z : vWPos.x;
          vec2 cell = vec2(u / 0.5, (vWPos.y - 0.35) / 0.62);
          vec2 f = fract(cell);
          float win = step(0.2, f.x) * step(f.x, 0.8) * step(0.25, f.y) * step(f.y, 0.8);
          float rnd = fract(sin(dot(floor(cell) + floor(vWPos.xz * 0.01), vec2(12.9898, 78.233))) * 43758.5453);
          float lit = win * side * step(0.62, rnd) * step(0.6, vWPos.y);
          totalEmissiveRadiance += uWindow * lit * (0.55 + 0.45 * fract(rnd * 7.0));
        }`,
      )
  }
  // Clave distinta por color para que three.js no reutilice un programa compilado con otros uniforms.
  mat.customProgramCacheKey = () => `windows-${windowColor}-${intensity}`
  mat.userData.uniforms = uniforms
  return mat
}
