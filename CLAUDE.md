# Gastópolis — notas para trabajar en el repo

- Interfaz, textos y comentarios en **español**. Identificadores de código en inglés.
- El diseño acordado y el plan por fases están en `docs/DESIGN.md`. `CURRENT_PHASE` en `src/ui/nav.ts` controla qué pantallas aparecen como «Próximamente».
- Comprobar antes de dar algo por hecho: `npx tsc -b`, `npx vitest run`, `npx oxlint src`, `npm run build`.

## Convenciones

- **Lógica pura fuera de React** (`src/import`, `src/model`) y con tests. Los componentes solo componen.
- **Signo de los importes:** gastos negativos, ingresos positivos, transferencias con su signo. Usa `signFor()`; no inventes otra convención.
- **El tipo pertenece a la categoría.** Si cambias la categoría de un movimiento, usa `recategorize()`/`updateMovement()` del repositorio, que ajustan `kind` y signo.
- Toda escritura en IndexedDB pasa por `src/data/repo.ts`. Toda lectura en vivo, por `src/data/queries.ts` (tienen test que valida los índices de Dexie: un `orderBy` sobre un campo sin índice rompe la app entera).
- `Field` envuelve su control en un `<label>`. Si contiene varios controles (chips, casillas, `Segmented`), usa `<Field group>`: un label solo nombra al primero y pulsar en el texto lo activaría.
- Colores siempre con tokens (`text-ink`, `bg-surface`, `text-expense`…), nunca hex sueltos en componentes. Los colores de categoría usan `.chip-ink` + `--c` para que se lean en tema claro.
- Escenas 3D: lógica de layout pura en `scenes/<escena>/layout.ts` con tests; el lienzo solo pinta. Instancias con `InstancedMesh` y `key` por número de instancias. **No usar `drei/Html`** para rótulos (crea raíces React y rompe al desmontar): usar la capa DOM proyectada de `CityCanvas`. Pantallas con three.js/recharts se cargan con `lazy()`.
- Cámara: usar `fitToSphere`, **no `fitToBox`** (camera-controls redondea los ángulos a la cara de la caja y la vista queda de frente). La niebla se ajusta a la distancia de la cámara (`FogRig`).
- `ShaderMaterial` propios: terminar el fragment con `#include <colorspace_fragment>` o sus colores no casarán con los de los materiales estándar (ni con la niebla).
- El decorado de la Ciudad (`scenes/city/decor.ts`) es determinista y no recibe clics (`raycast` nulo); sus colores de ambiente viven en `scenes/city/ambient.ts`, no en la paleta de datos.
- Reproducción temporal: `ui/TimePlayer` + `ui/useTimeline` y fotogramas de `model/timeline.ts`; no hagas otro deslizador. La escena recibe el estado del fotograma (crecimiento, cursor, tramo) y anima hacia él.
- Laboratorio: la fecha de cada objetivo sale de un único cálculo (`goalRows` → `goalSooner`) que usan la lista, los pórticos del Horizonte y el gráfico 2D. No calcules «cuándo llega» de otra forma en otra vista.
- Paleta de categorías: `CATEGORY_PALETTE` en `lib/color.ts`, validada con el script del skill dataviz. Si se cambia, revalidar en modo oscuro (#06070c) y claro (#ffffff) y no reordenar a ojo.
- Formato: `npm run format` (Prettier, sin punto y coma, comillas simples, 160 columnas).
- **Privacidad por construcción:** la app no se conecta a nada. No añadas peticiones de red, analítica, fuentes o scripts de CDN, ni plugins de Tauri de red/actualizador. La CSP vive en `vite.config.ts` y en `src-tauri/tauri.conf.json`: si cambias una, cambia la otra.
- Plataformas: Windows (Tauri) y web app del iPhone; **sin Android**, por decisión. Lo que dependa de la plataforma va en `src/platform` (p. ej. `saveFile`, nunca `<a download>` directo). El service worker solo en navegador.
- Los datos reales de usuarios **no** se suben al repo. Los tests usan fixtures sintéticos que imitan su estructura.

## Probar en navegador

Chromium está en `/opt/pw-browsers/chromium`; con `@playwright/test` hay que pasar `executablePath` (no ejecutar `playwright install`).
