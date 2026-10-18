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
Rejilla de tarjetas con una mini-Ciudad viva en el centro. KPIs (ingresos, gastos, ahorro neto, tasa de ahorro, proyección de cierre de mes), curva de saldo acumulado, top 5 categorías, anillos de presupuesto, resumen de fugas, progreso de objetivos, próximos cargos recurrentes y racha de días sin gastar. Tarjetas reordenables/ocultables.

### Ciudad (fase 2)
Treemap 3D voxelizado: superficie = importe, altura = nº de movimientos (configurable: media, % de presupuesto, variación), color = categoría o calor. Clic en un bloque → la cámara entra y se subdivide (categoría → subcategoría → concepto → movimiento), como WinDirStat. Breadcrumb, `Esc` para subir, panel lateral sincronizado (hover en la lista ilumina el bloque). `InstancedMesh` para miles de bloques a 60 fps.

### Cordillera (fase 3)
Relieve mes × categoría. Clic en una celda → Ciudad filtrada a ese mes y categoría.

### Balanza (fase 3)
Torres de ingresos y gastos apiladas por categoría, transferencias en el centro, objetivos como torres de cristal. Deslizador temporal mensual o acumulado.

### Objetivos (fase 4)
Metas de ahorro («Entrada vivienda · 40.000 € · dic 2029»): aportación mensual necesaria, fecha estimada según tu tasa de ahorro real, adelantado/atrasado, hitos 25/50/75/100 %. Las transferencias a ahorro se asignan a objetivos por regla o reparto porcentual.

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

### Laboratorio de decisiones (fase 5)
Palancas (recortar o topar una categoría, cancelar un recurrente, cambio de ingresos, gasto puntual, aportación a objetivo, rentabilidad con interés compuesto, inflación) contra una línea base de tu media real. Proyección a 1/3/5/10 años, «llegas a Vivienda 14 meses antes», escenarios guardados y comparables. Escena 3D «Horizonte»: las proyecciones como cintas que atraviesan los pórticos de los objetivos.

### Movimientos, Categorías, Ajustes (fase 1)
Tabla virtualizada con orden, filtros globales (periodo, tipo, búsqueda), selección múltiple para recategorizar o borrar con deshacer. Categorías con jerarquía, color, icono, presupuesto, cambio de tipo y fusión al borrar. Ajustes: moneda, inicio de año, tema, calidad 3D, copias, CSV, datos de ejemplo e historial de importaciones.

## Móvil y APK (fase 6)

- PWA instalable y offline (`vite-plugin-pwa`).
- **Capacitor** envuelve el mismo build en Android; `base: './'` y rutas por hash ya funcionan con `file://`.
- GitHub Actions compila el `.apk` en cada release.
- Desde ya: controles táctiles en las escenas, calidad gráfica automática, panel lateral que en móvil es hoja inferior, alta en tres toques.

## Fases

1. **Base** — scaffold, modelo, importador, Movimientos, Categorías, Ajustes. ✅
2. **Ciudad** — treemap 3D con drill-down y panel lateral.
3. **Cordillera, Balanza, deslizador temporal, Inicio.**
4. **Alta rápida, reglas, Objetivos, Detector de fugas.**
5. **Laboratorio + Horizonte.**
6. **PWA, APK, CI, rendimiento con 10k movimientos, pulido.**
