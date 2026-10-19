# Gastópolis — diseño

Aplicación de finanzas personales, local-first, que convierte una hoja de gastos en una ciudad 3D navegable. Nace del Excel de gastos de JJ (`Concepto · Categoría · Fecha · Importe · Tipo`, gastos e ingresos en dos tablas en paralelo), pero no copia su formato: solo su propósito y su tipo de datos.

## Decisiones de partida

| Tema | Decisión |
|---|---|
| Usuario | Uso personal (JJ y pocos más). Sin login. |
| Datos | Local-first en IndexedDB (Dexie). Copia JSON/CSV. Supabase opcional más adelante. |
| Entrada | Importar Excel/CSV con mapeo de columnas + alta manual. Conexión bancaria: diseñada, no en v1. |
| Estilo | Identidad propia: oscuro neón/cristal (tema «Neón») con alternativa clara («Polar»). |
| Plataformas | Web + PWA; APK Android con Capacitor sobre el mismo build. |

## Modelo de datos

```ts
Movement { id, date, amount /* con signo */, kind: 'expense'|'income'|'transfer', concept, conceptKey,
           categoryId, merchantId?, tags[], notes?, source: 'import'|'manual'|'sample', importBatchId?, createdAt }
Category { id, name, kind, parentId, color, icon, budgetMonthly?, order }
Merchant { id, name, aliases[] }
Rule     { id, name, matchType: 'contains'|'equals'|'regex', pattern, set: { categoryId?, merchantId? }, priority, enabled }
Goal     { id, name, icon, color, target, deadline?, priority, createdAt }
ImportBatch { id, fileName, importedAt, count }
Settings { currency, locale, fiscalYearStart, theme, quality }
```

- **Signo:** gastos en negativo, ingresos en positivo. Las transferencias conservan el suyo (negativo = se aparta dinero a ahorro/inversión).
- **El tipo vive en la categoría.** `Movement.kind` es una copia para indexar; cambiar el tipo de una categoría ajusta sus movimientos y su signo.
- **Transferencias:** «Ahorro» o «Cryptos» aparecen en el Excel como gasto *y* como ingreso. Son dinero que cambia de bolsillo: no deben inflar gastos ni ingresos. El importador las detecta por nombre y el usuario puede corregirlo.
- **Categorías por (tipo, nombre):** «Otros» de gastos y «Otros» de ingresos son categorías distintas.

## Importador

1. SheetJS lee todas las hojas (CSV propio con detección de `;`/`,`/tab y Windows-1252).
2. Detecta filas de cabecera por sinónimos exactos (`Importe (€)` sí, `Suma de Importe (€)` no), separa tablas que van una al lado de otra y toma el rótulo de encima (`GASTOS`/`INGRESOS`) como pista de tipo.
3. Fechas de Excel en UTC (sin desfases por zona horaria); importes con formato español o inglés.
4. Signo automático por tabla (si una tabla de gastos viene en positivo, se invierte), «tal cual» o «invertir».
5. Duplicados por `(fecha, importe, concepto normalizado)` contados por ocurrencias: reimportar el mismo archivo no duplica, pero dos cafés iguales el mismo día sí entran.
6. Cada importación es un lote que se puede deshacer.

Probado contra el Excel real: 237 movimientos, 3 filas saltadas con su motivo, tablas dinámicas ignoradas.

## Pantallas

### Inicio · vista de pájaro (fase 3)

**Implementación:** selector de mes propio; si los datos se han quedado atrás (se importa a meses vencidos), arranca en el último mes con datos y avisa. Un mes en curso se compara con el anterior *hasta el mismo día*. Tarjetas: balance (cifra principal), mini-ciudad en órbita, KPIs con variación y tendencia de 12 meses, flujo mensual (barras ingresos/gastos y línea de balance, un solo eje), dónde se va el dinero, presupuestos con marca de ritmo, próximos cargos, suscripciones y recibos (detector de recurrentes con subidas de precio), racha. Se pueden reordenar y ocultar.

Rejilla de tarjetas con una mini-Ciudad viva en el centro. KPIs (ingresos, gastos, ahorro neto, tasa de ahorro, proyección de cierre de mes), curva de saldo acumulado, top 5 categorías, anillos de presupuesto, resumen de fugas, progreso de objetivos, próximos cargos recurrentes y racha de días sin gastar. Tarjetas reordenables/ocultables.

### Ciudad (fase 2)
Al entrar en una categoría, cada concepto toma un tono propio (`familyColor`: ángulo áureo en OKLCH con tres luminosidades) también dentro de los distritos; en la vista general cada barrio conserva el color de su categoría.

Treemap 3D voxelizado: superficie = importe, altura = nº de movimientos (configurable: media, % de presupuesto, variación), color = categoría o calor. Clic en un bloque → la cámara entra y se subdivide (categoría → subcategoría → concepto → movimiento), como WinDirStat. Breadcrumb, `Esc` para subir, panel lateral sincronizado (hover en la lista ilumina el bloque). `InstancedMesh` para miles de bloques a 60 fps.

**Implementación (fase 2):** la jerarquía (`model/hierarchy.ts`) baja por subcategorías antes de pasar a la siguiente dimensión y siempre termina en movimientos; los ids son rutas, así la navegación sobrevive a cambios de filtro. El layout (`scenes/city/layout.ts`) es un treemap squarify de dos niveles con calles entre distritos; los edificios heredan el color de su barrio con variaciones de tono. Edificios y tejados son `InstancedMesh`; las ventanas salen de un shader en coordenadas de mundo. Los rótulos son DOM proyectado cada fotograma con detección de choques (no `drei/Html`): icono de categoría, importe y % del total.

**Ambientación:** los solares grandes se reparten en racimos de torres del mismo color (la más alta mide exactamente la altura del dato; la superficie total se conserva). Alrededor, un decorado procedural y determinista que no se puede seleccionar: calles con coches que rodean cada manzana (en una calle compartida circulan en sentidos opuestos), farolas con halo, ronda de circunvalación con árboles, río con reflejos, paseo iluminado y barcos, extrarradio de edificios bajos y parques que se funde con la niebla, máquinas y antenas en las azoteas, cielo con degradado y estrellas. En calidad ligera se reduce el tráfico, el extrarradio y se quitan reflejos, sombras y bloom. La paleta de categorías es la validada por `validate_palette.js` sobre los dos fondos; el modo «calor» usa una rampa secuencial de un solo tono.

### Cordillera (fase 3)
Relieve mes × categoría. Clic en una celda → Ciudad filtrada a ese mes y categoría.

**Implementación:** una cresta extruida por categoría (raíz o subcategoría), perfil con interpolación cúbica monótona (pasa por cada mes sin sobrepasarlo ni bajar de cero), la de más importe al fondo para no tapar a las demás, más de 10 se pliegan en «Otras». Rótulo de cada categoría sobre su pico, meses en el borde, cursor del mes al pasar el ratón y barras por mes en el panel.

**Rediseño (tras probarla en un PC):** agrupación adaptativa por días, semanas o meses (`model/ridgeSeries.ts`; «Auto» según lo que abarquen los datos: un mes de datos se ve por días, no como una cuña de dos puntos). Ancho constante, alturas algo comprimidas en días y semanas para que el alquiler no aplaste el resto. Geometría propia (`scenes/ridge/geometry.ts`) con normales analíticas y color por altura: valles en sombra, cumbres con todo su color, y una cinta luminosa en la cresta. Sin transparencias ni z-fighting (parpadeo). La reproducción es una ola que levanta la cordillera de izquierda a derecha, con destellos en el frente; lo que aún no ha llegado queda en penumbra. Clic en una cresta abre la Ciudad con ese día, semana o mes.

### Balanza (fase 3)
Torres de ingresos y gastos apiladas por categoría. Deslizador temporal mensual o acumulado. (El tarro de «Apartado» se quitó: estorbaba más de lo que contaba; lo ahorrado vive en Objetivos.)

**Implementación:** balanza física con brazo que se inclina hacia lo que pesa más (raíz de la diferencia relativa, para que un 10 % ya se note), platillos colgados con cadenas y torres apiladas por categoría raíz (más de 7 → «Otras»). Escala fija para todo el periodo, así un mes ligero se ve ligero. Deslizador con reproducción; arranca en el último mes con ingresos. Clic en una franja → Ciudad de esa categoría y mes.

### Objetivos (fase 4)
Metas de ahorro («Entrada vivienda · 40.000 € · dic 2029»): aportación mensual necesaria, fecha estimada según tu tasa de ahorro real, adelantado/atrasado, hitos 25/50/75/100 %. Las transferencias a ahorro se asignan a objetivos por regla o reparto porcentual.

**Implementación:** lo ahorrado = inicial + transferencias a las categorías vinculadas desde «Contar lo apartado desde» + aportaciones a mano. Cada categoría alimenta un solo objetivo (sin repartos: más simple y sin dobles cuentas). El ritmo es la media mensual de los últimos 6 meses y cuenta las categorías vinculadas aunque sea antes de crear el objetivo, porque es la costumbre de ahorro; con menos de ~6 semanas de datos el objetivo está «Recién empezado» y no se inventa un ritmo con una aportación suelta. Plantillas (vivienda, colchón con 6 meses de gasto real, coche, viaje), anillo, evolución mensual, hitos con celebración y tarjeta en el Inicio.

### Detector de fugas (fase 4)
Motor determinista → `Leak { type, severity, yearlyCost, evidence[], status }`:

| Tipo | Detección |
|---|---|
| Suscripción olvidada | Recurrente (mismo comercio, importe ±10 %, cadencia mensual/anual) no marcado como «la uso». Triaje: usar / cancelar / ignorar. |
| Subida de tarifa | Recurrente cuyo importe sube: «Spotify 10,99 → 11,99 (+12 €/año)». |
| Comisiones bancarias | Reglas de texto (comisión, mantenimiento, descubierto…) + categoría. |
| Cargo duplicado | Mismo comercio e importe en ≤ 48 h. |
| Gasto hormiga | Muchos movimientos pequeños; proyección anual. |
| Sin clasificar | «Otros» / «???» por encima de un umbral. |
| Suscripciones solapadas | Dos recurrentes del mismo tipo. |

«Simular cancelación» manda la fuga al Laboratorio.

**Implementación:** `model/leaks.ts`, puro y con ids estables para que las decisiones (la uso / la cancelo / ignorar, en la tabla `decisions`) sobrevivan a cada nuevo análisis. Solo son suscripciones las cuotas **fijas** de hasta 60 €/mes: un recibo que varía cada mes (luz, agua) no se olvida. El gasto hormiga no cuenta las cuotas. Umbrales del gasto hormiga y de los duplicados en Ajustes. Los duplicados se pueden borrar desde la propia fuga, con deshacer.

### Reglas y alta rápida (fase 4)
Reglas «el concepto contiene / es / cumple la expresión → categoría», con prioridad (gana la primera) y aplicables a lo que ya hay. Respetan el tipo y el signo: una regla de gasto no convierte un ingreso. Se usan al importar y al apuntar a mano; al corregir la categoría de un concepto se ofrece «Siempre así» en el aviso. El alta rápida sugiere la categoría por regla y luego por historial, con atajos a los conceptos más usados.

### Laboratorio de decisiones (fase 5)
Palancas (recortar o topar una categoría, cancelar un recurrente, cambio de ingresos, gasto puntual, aportación a objetivo, rentabilidad con interés compuesto, inflación) contra una línea base de tu media real. Proyección a 1/3/5/10 años, «llegas a Vivienda 14 meses antes», escenarios guardados y comparables. Escena 3D «Horizonte»: las proyecciones como cintas que atraviesan los pórticos de los objetivos.

**Implementación:** la línea base es la media de los últimos 6 meses completos (el mes en curso está a medias). Lo que sobra cada mes suma a lo que tienes; los gastos suben con la inflación y los ingresos con su propia subida (supuestos editables). Dos palancas sobre la misma categoría no se suman dos veces. «Invertir» aplica interés compuesto mensual a una parte de lo acumulado. El extra al mes se destina a un objetivo y se calcula cuántos meses antes llega con `goalSooner`; **ese mismo dato** sitúa los pórticos del Horizonte y las marcas del gráfico 2D (antes cada vista usaba una medida distinta y daban fechas distintas). Escenarios guardados en la tabla `scenarios` (Dexie v3) e incluidos en la copia. «Simular» en una suscripción de Fugas abre el Laboratorio con la cancelación puesta. Horizonte: cintas con cortina (shader propio con niebla), vista de lado (hoy a la izquierda, el futuro a la derecha en la niebla); con números rojos el cero sube y la cinta se ve bajar.

### Río (fase 5)
De dónde viene el dinero y a dónde va (Sankey): ingresos por categoría y lo sacado de ahorros → gastos, cada ahorro o inversión y lo que sobra; si se gasta más de lo que entra, el hueco es una fuente («Gastado de más»). El dinero no lleva etiqueta: cada fuente se reparte entre los destinos en proporción. Tercera columna opcional con los gastos por categoría. Cintas con degradado y estelas de luz animadas (sin animación con «reducir movimiento»). Pantalla propia y tarjeta «Río del mes» en el Inicio. Lógica pura en `model/flow.ts` y `lib/sankey.ts`.

### Reproducción en el tiempo (Ciudad, Cordillera, Balanza)
Reproductor común (`ui/TimePlayer` + `ui/useTimeline`): día, semana o mes, velocidad 1×/2×/4×; al cambiar de paso se queda en la misma fecha. Fotogramas puros en `model/timeline.ts`. Ciudad: el plano no cambia y cada edificio crece hasta lo gastado en la fecha (`scenes/city/growth.ts`). Cordillera: un plano de recorte (`localClippingEnabled`) descubre la cordillera tras un muro de luz. Balanza: cualquier tramo de fechas (`balanceBetween`), por periodo o acumulado, con escala fija.

### Movimientos, Categorías, Ajustes (fase 1)
Tabla virtualizada con orden, filtros globales (periodo, tipo, búsqueda), selección múltiple para recategorizar o borrar con deshacer. Categorías con jerarquía, color, icono, presupuesto, cambio de tipo y fusión al borrar. Ajustes: moneda, inicio de año, tema, calidad 3D, copias, CSV, datos de ejemplo e historial de importaciones.

## Distribución: Windows e iPhone, 100 % privada

Decisión: **ejecutable en Windows** y **web app instalada en el iPhone**. Sin Android. Ninguna de las dos habla con un servidor: los datos nunca salen del dispositivo salvo en una copia que exporte el usuario.

- **Windows — Tauri 2** (`src-tauri/`): instalador NSIS por usuario de ~2,3 MB que usa el WebView2 del sistema. Sin plugins de red ni actualizador; navegación bloqueada fuera de la app; «Guardar como» con un comando Rust propio (`save_text_file`), sin dar permisos de archivos a la web. Datos en `%LOCALAPPDATA%\es.gastopolis.app`; desinstalar no los borra salvo que se marque. Instalador sin firmar: SmartScreen avisa la primera vez.
- **iPhone — web app** (`vite-plugin-pwa`): todo precacheado (3D incluido), funciona sin conexión desde la primera visita, se instala desde Safari en la pantalla de inicio. Instalada, iOS no aplica el borrado de 7 días a sus datos. El service worker solo se registra en el navegador (`platform/pwa.ts`). Necesita un alojamiento estático con HTTPS para instalarse y actualizarse; el alojamiento solo sirve el código, nunca ve datos.
- **Mismo build para todo:** `base: './'` y rutas por hash. `src/platform` decide lo que cambia por plataforma (guardar archivos, almacenamiento persistente).
- **CSP estricta** en el build y en Tauri: solo `'self'` (más el canal `ipc:` de Tauri). Ningún `connect-src` externo.
- **Copias cifradas** (AES-GCM 256, PBKDF2-SHA256 600k) para mover datos entre PC y móvil o guardarlos fuera; aviso en el Inicio si hace más de un mes de la última.
- **CI:** `ci.yml` (tipos, tests, lint, formato, build, clippy) en cada PR; `release.yml` con una etiqueta `v*` compila el instalador en `windows-latest` y la web app, y crea un borrador de release.

## Fases

1. **Base** — scaffold, modelo, importador, Movimientos, Categorías, Ajustes. ✅
2. **Ciudad** — treemap 3D con drill-down y panel lateral. ✅
3. **Cordillera, Balanza, deslizador temporal, Inicio.** ✅
4. **Alta rápida, reglas, Objetivos, Detector de fugas.** ✅
5. **Laboratorio + Horizonte, Río, reproducción en el tiempo.** ✅
6. **Distribución (Windows + iPhone, CI)** ✅ · **rendimiento con 10k movimientos, pulido.** ✅

### Notas de la fase 6

- **Banco de pruebas:** `data/stress.ts` genera 12.000 movimientos en 8 años con 900 comercios y 40 suscripciones; `model/perf.test.ts` cronometra cada cálculo de pantalla con ellos (presupuesto: 1,5 s; hoy el más lento, la jerarquía de la Ciudad, ronda los 100 ms). `PERF=1 npx vitest run src/model/perf.test.ts` imprime la tabla.
- **Lectura de movimientos:** una sola suscripción en vivo compartida (`movementsStore` en `data/hooks.ts`) y lectura por clave primaria ordenada en memoria. Leer por un índice (`orderBy('date')`) hace que Dexie vigile cada clave por separado: con 12k filas eran ~300 ms por cambio y bloqueos de 750 ms al entrar en la Ciudad.
- **Río:** el agua corre en un `<canvas>` encima del SVG, no con `stroke-dashoffset` animado (repintaba el SVG entero: de 7 a 36 fps en software). El brillo de los nodos es un halo, no un `drop-shadow`.
- **Gráficos propios** (`ui/charts`) en lugar de Recharts: columnas agrupadas con línea en la misma escala y líneas con marcas. Escalas y colocación de etiquetas puras con tests. JS+CSS de 778 a 660 KB comprimidos; fuentes solo latín (de 351 a 230 KB).
- **Pulido:** frase del ahorro única (`savingsPhrase`: «Gastas un X % más de lo que entra» si el balance es negativo); etiquetas del eje x que no se cortan por los bordes ni se pisan.
- Lo que queda de los bloqueos al entrar en una escena 3D es crear el contexto WebGL y compilar shaders (la primera vez).

7. **Informes en PDF, Excel y CSV.** ✅

### Notas de la fase 7

- **Doce informes** (`model/reports`): resumen, evolución mensual, por categoría (con subcategorías y presupuesto), categorías en el tiempo (tabla cruzada por mes, trimestre o año según la duración), por concepto, comparativa con el año anterior, presupuestos, suscripciones y cargos fijos, objetivos, fugas, escenarios del Laboratorio y listado de movimientos; más el «informe completo» con todos. Se elige periodo, categorías (y tipos en el listado) y formato.
- **Un documento, tres salidas.** Cada informe es un `ReportDoc` neutro (indicadores, columnas, ranking, tablas y texto, con valores sin formatear y el tipo de cada columna). `pdf.ts`, `sheet.ts` (Excel y CSV) y la vista previa lo pintan cada uno a su manera. Los cálculos son los de las pantallas (`totals`, `goalProgress`, `detectRecurring`, `detectLeaks`, `project`…): un informe nunca da otra cifra que la app.
- **PDF propio, sin librerías** (`lib/pdf`): Helvetica y Helvetica-Bold (dos de las 14 fuentes estándar, no se incrustan) en WinAnsi, con sus métricas de Adobe para medir y alinear; flujos comprimidos con `CompressionStream`. La maqueta pone cabecera y pie con «Página n de N», portada con índice en el informe completo, tarjetas de indicadores, columnas y barras con las reglas de los gráficos de la app, y tablas que continúan en la página siguiente repitiendo la cabecera. Los números nunca se encogen; el texto largo parte línea. Pesa 5,6 KB comprimido.
- **Excel**: una hoja por informe, importes como números con formato de moneda, fechas como fechas, porcentajes como porcentajes y autofiltro en las hojas de una sola tabla. **CSV** para Excel en español: «;», coma decimal y BOM.
- **Guardar en Windows**: los binarios van por `save_binary_file`, con los bytes en el cuerpo de la llamada (sin JSON) y el nombre en una cabecera; el «Guardar como» sigue siendo nativo y la web no recibe permiso para escribir archivos.
- Con 12.000 movimientos: los doce informes, 0,1 s; el PDF completo (263 páginas), 1,2 s; el Excel, 0,7 s.

8. **Cuentas, bancos (Enable Banking) y nómina inteligente.** ✅

### Notas de la fase 8

- **Nómina inteligente:** se detectan los ingresos mensuales regulares (una vez al mes, la mayoría de los meses, siempre por las mismas fechas ±4 días) y cada cobro cuenta para el mes cuya fecha esperada tiene más cerca: la nómina del 28 paga el mes siguiente; si un mes llega el 1, ese mes. La fecha real se ve siempre; se puede desactivar en Ajustes.
- **Cuentas:** efectivo, otras manuales y bancarias. Filtro por cuenta, cuenta en el alta, saldo de cada una.
- **Bancos por PSD2 con Enable Banking** (modo restringido, gratis para tus cuentas), solo en Windows: Rust firma el token RS256 con la clave del usuario y llama solo a `api.enablebanking.com`; la vuelta del banco se recoge en una ventana de la app: se entra en el banco dentro de ella y, cuando redirige a la dirección de vuelta (https, con dominio: el panel de Enable Banking no admite localhost; por defecto `https://gastopolis.invalid/callback`), se intercepta antes de cargarla. Alternativa: abrirlo en el navegador y pegar la dirección. El iPhone recibe los datos con la copia (el navegador no puede llamar a la API sin un servidor intermedio, que no queremos).
- **Sincronización incremental:** la primera vez, hasta dos años (lo que dé el banco); después, solo desde 7 días antes de lo ya traído. Al abrir la app y cada 6/12/24 h (PSD2 permite 4 lecturas al día sin el usuario). Los pendientes no entran hasta asentarse. Sin duplicados (id del banco o huella estable) y enlazando lo apuntado a mano o importado. Traspasos entre cuentas propias detectados. Categorías por reglas y por historial (también si el banco escribe el comercio de otra forma).
- **Permiso del banco:** hasta 180 días; aviso en el Inicio y en Cuentas una semana antes y al caducar; renovar reconoce las cuentas (huella estable o IBAN) y conserva lo traído.
- **Tutorial** en la app para crear la cuenta y la aplicación de Enable Banking, enlazar los bancos y cargar la credencial.
