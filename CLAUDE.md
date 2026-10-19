# Gastópolis — notas para trabajar en el repo

- Interfaz, textos y comentarios en **español**. Identificadores de código en inglés.
- El diseño acordado y el plan por fases están en `docs/DESIGN.md`. `CURRENT_PHASE` en `src/ui/nav.ts` controla qué pantallas aparecen como «Próximamente».
- Comprobar antes de dar algo por hecho: `npx tsc -b`, `npx vitest run`, `npx oxlint src`, `npm run build`.

## Convenciones

- **Lógica pura fuera de React** (`src/import`, `src/model`) y con tests. Los componentes solo componen.
- **Signo de los importes:** gastos negativos, ingresos positivos, transferencias con su signo. Usa `signFor()`; no inventes otra convención.
- **El tipo pertenece a la categoría.** Si cambias la categoría de un movimiento, usa `recategorize()`/`updateMovement()` del repositorio, que ajustan `kind` y signo.
- **Rendimiento con 10k+ movimientos:** los movimientos se leen con `useMovements()` (una sola suscripción compartida, leída por clave primaria). No abras otro `useLiveQuery` sobre `movements` ni leas por índice en vivo: Dexie vigila cada clave y con 12k filas bloquea la app. Si tocas un cálculo de pantalla, `model/perf.test.ts` lo cronometra con `data/stress.ts`.
- **Gráficos 2D:** `ui/charts` (`ColumnChart`, `LineChart`), SVG propio; no hay Recharts ni se añade otra librería de gráficos. Escalas y etiquetas en `ui/charts/scale.ts` (puro, con tests). Animaciones continuas en `<canvas>`, no con CSS sobre SVG (repinta el SVG entero); nada de `filter: drop-shadow` en marcas que se repiten.
- **Informes** (`model/reports`): cada informe es un `ReportDoc` neutro que pintan `pdf.ts`, `sheet.ts` (Excel/CSV) y la vista previa. Un informe nuevo es un constructor en `build.ts` que reutiliza los cálculos de las pantallas (nunca una cifra calculada de otra forma) y una entrada en `catalog.ts`. El PDF es propio (`lib/pdf`, Helvetica en WinAnsi con métricas AFM): no añadas jsPDF ni similares. `sheet.ts` importa solo lo que usa de SheetJS y se carga bajo demanda. Archivos binarios: `saveFile(nombre, Uint8Array, mime)` (en Windows va por `save_binary_file`).
- **Nómina inteligente** (`model/payday.ts`): `useMovements()` devuelve fechas contables (la nómina del 28 cuenta el mes siguiente) con la real en `realDate`. Para enseñar fechas, `shownDate(m)`; para editar, importar o exportar, `useRawMovements()`. `toStored()` en el repositorio garantiza que nunca se guarda una fecha contable.
- **Cuentas:** cada movimiento puede tener `accountId` (efectivo, otra, banco). La sincronización nunca toca lo manual ni el efectivo: enlaza lo que coincide (importe y ±3 días) en vez de duplicar, y pasa a «Traspasos entre mis cuentas» lo que sale de una cuenta propia y entra en otra.
- Frase del ahorro: `savingsPhrase()`; no la compongas a mano (con balance negativo dice «Gastas un X % más…»).
- Toda escritura en IndexedDB pasa por `src/data/repo.ts`. Toda lectura en vivo, por `src/data/queries.ts` (tienen test que valida los índices de Dexie: un `orderBy` sobre un campo sin índice rompe la app entera).
- `Field` envuelve su control en un `<label>`. Si contiene varios controles (chips, casillas, `Segmented`), usa `<Field group>`: un label solo nombra al primero y pulsar en el texto lo activaría.
- Colores siempre con tokens (`text-ink`, `bg-surface`, `text-expense`…), nunca hex sueltos en componentes. Los colores de categoría usan `.chip-ink` + `--c` para que se lean en tema claro.
- Escenas 3D: lógica de layout pura en `scenes/<escena>/layout.ts` con tests; el lienzo solo pinta. Instancias con `InstancedMesh` y `key` por número de instancias. **No usar `drei/Html`** para rótulos (crea raíces React y rompe al desmontar): usar la capa DOM proyectada de `CityCanvas`. Pantallas con three.js se cargan con `lazy()`.
- Cámara: usar `fitToSphere`, **no `fitToBox`** (camera-controls redondea los ángulos a la cara de la caja y la vista queda de frente). La niebla se ajusta a la distancia de la cámara (`FogRig`).
- `ShaderMaterial` propios: terminar el fragment con `#include <colorspace_fragment>` o sus colores no casarán con los de los materiales estándar (ni con la niebla).
- **Nada de NaN en la GPU:** en calidad alta el bloom extiende un solo píxel NaN hasta dejar el lienzo negro (pasó en el Horizonte con `pow()` de un negativo). `clamp` antes de `pow`/`sqrt`/`log` en shaders; geometrías propias con normales analíticas (nunca de triángulos degenerados) y test de que no hay NaN.
- **Probar siempre en calidad «Alta» y «Ligera».** Este contenedor tiene 4 hilos y «Auto» elige ligera: lo de alta (reflejos, bloom) no se ve si no se fuerza en Ajustes. Para ver lo que ve un PC con GPU: Chromium con `headless: false` en Xvfb y `--use-gl=angle --use-angle=gl`.
- Sin transparencias que cambien al pasar el ratón (el orden de dibujo cambia y parpadea): atenuar con el color.
- El decorado de la Ciudad (`scenes/city/decor.ts`) es determinista y no recibe clics (`raycast` nulo); sus colores de ambiente viven en `scenes/city/ambient.ts`, no en la paleta de datos.
- Reproducción temporal: `ui/TimePlayer` + `ui/useTimeline` y fotogramas de `model/timeline.ts`; no hagas otro deslizador. La escena recibe el estado del fotograma (crecimiento, cursor, tramo) y anima hacia él.
- Laboratorio: la fecha de cada objetivo sale de un único cálculo (`goalRows` → `goalSooner`) que usan la lista, los pórticos del Horizonte y el gráfico 2D. No calcules «cuándo llega» de otra forma en otra vista.
- Paleta de categorías: `CATEGORY_PALETTE` en `lib/color.ts`, validada con el script del skill dataviz. Si se cambia, revalidar en modo oscuro (#06070c) y claro (#ffffff) y no reordenar a ojo.
- Formato: `npm run format` (Prettier, sin punto y coma, comillas simples, 160 columnas).
- **Privacidad por construcción:** la web no se conecta a nada. No añadas peticiones de red, analítica, fuentes o scripts de CDN, ni plugins de Tauri de red/actualizador. La CSP vive en `vite.config.ts` y en `src-tauri/tauri.conf.json`: si cambias una, cambia la otra.
- **Única excepción, opcional: el banco.** Solo la app de Windows, solo si el usuario conecta un banco, y solo a `api.enablebanking.com` desde Rust (`src-tauri/src/bank.rs`: el host está fijo y la web no puede elegirlo). Solo lectura (AIS): nunca pagos. La credencial (`.pem`) vive en la tabla `secrets` y no va en las copias. Lógica en `src/bank/sync.ts` (pura, con tests); `run.ts` solo encadena red y base de datos. Para probar sin banco real: `VITE_BANK_MOCK=1` (todo simulado) o `VITE_BANK_MOCK=window` (simulado, pero con la ventana real del banco en la app nativa); nunca en el build que se instala. La vuelta del banco se recoge en la ventana `bank-auth` (`on_navigation`), no en un servidor local: Enable Banking solo admite direcciones https con dominio.
- Plataformas: Windows (Tauri) y web app del iPhone; **sin Android**, por decisión. Lo que dependa de la plataforma va en `src/platform` (p. ej. `saveFile`, nunca `<a download>` directo). El service worker solo en navegador.
- Los datos reales de usuarios **no** se suben al repo. Los tests usan fixtures sintéticos que imitan su estructura.

## Probar en navegador

Chromium está en `/opt/pw-browsers/chromium`; con `@playwright/test` hay que pasar `executablePath` (no ejecutar `playwright install`).
