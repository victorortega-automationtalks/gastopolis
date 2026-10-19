# Gastópolis

Tu dinero como una ciudad en 3D. Importa tu Excel de gastos y explóralo bloque a bloque, fija objetivos de ahorro, caza fugas de dinero y simula decisiones antes de tomarlas.

Local-first: todo se guarda en el dispositivo (IndexedDB). Sin cuentas ni servidores.

> Estado: **fase 4 de 6** — Inicio, Ciudad, Cordillera y Balanza en 3D, Objetivos, Detector de fugas, reglas, importador, movimientos, categorías y ajustes. Plan completo en [`docs/DESIGN.md`](docs/DESIGN.md).
>
> La app arranca **vacía**: nada de lo que hay en el repositorio son datos reales. Los datos de ejemplo son inventados y solo se cargan si pulsas «Ver con datos de ejemplo».

## Arrancar

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest: importador, repositorio, consultas
npm run build      # tsc + build de producción en dist/
```

## Qué hace ya

- **Inicio**: vista de pájaro del mes (balance, KPIs con tendencia, mini-ciudad viva, flujo de 12 meses, dónde se va el dinero, objetivos, fugas, presupuestos, próximos cargos, suscripciones con subidas de precio). Personalizable.
- **Objetivos**: metas de ahorro con fecha (entrada de la vivienda, colchón, coche, viaje…). Cuenta lo que apartas en las categorías vinculadas y lo que aportes a mano; dice a qué ritmo vas, cuándo llegas y cuánto hace falta al mes. Hitos del 25/50/75/100 %.
- **Fugas**: suscripciones que conviene revisar, servicios solapados (dos plataformas de vídeo), subidas de tarifa, comisiones del banco, cargos duplicados, gasto hormiga y gasto sin clasificar. Cada aviso con sus movimientos y una decisión: la uso, la cancelo o ignorar.
- **Cordillera**: una cresta 3D por categoría a lo largo de los meses; los picos dicen cuándo se disparó cada gasto. Clic en un pico → la Ciudad de ese mes.
- **Balanza**: ingresos contra gastos en una balanza que se inclina, con torres por categoría; deslizador temporal con reproducción y modo acumulado.
- **Ciudad 3D**: cada categoría es un barrio y cada concepto un edificio (superficie = importe; altura = nº de movimientos, importe o media). Clic para seleccionar, clic en un barrio o doble clic para entrar, Esc para subir — como WinDirStat. Panel lateral sincronizado con barras por mes, bloques hijos y últimos movimientos; en móvil, hoja inferior. Agrupación configurable (categoría → concepto, por meses…), color por categoría o por calor. Ambientada como una ciudad nocturna real: racimos de torres con ventanas encendidas, tráfico con faros, farolas, río con barcos y reflejos, extrarradio, parques y cielo estrellado; calidad automática para móviles.
- **Importar Excel/CSV** (`.xlsx`, `.xlsm`, `.xls`, `.csv`): detecta tablas de movimientos aunque estén una al lado de otra, propone el mapeo de columnas, convierte Ahorro/Cripto en transferencias, avisa de filas que no puede leer y no duplica si reimportas. Cada importación se puede deshacer.
- **Movimientos**: tabla virtualizada, filtros por periodo, tipo y texto; edición, alta rápida (sugiere la categoría y recuerda tus conceptos habituales) y acciones en bloque con deshacer.
- **Categorías y reglas**: jerarquía, color, icono, presupuesto mensual, cambio de tipo y fusión. Reglas «si el concepto contiene X → categoría» que se aplican al importar y al apuntar.
- **Ajustes**: moneda, inicio del año, tema Neón/Polar, umbrales del detector de fugas, copia de seguridad JSON, CSV, datos de ejemplo.

## Stack

React 19 · TypeScript · Vite · Tailwind 4 · Zustand · Dexie · SheetJS · three.js con react-three-fiber, drei y postprocessing · d3-hierarchy · Recharts · (fase 6) Capacitor.

## Estructura

```
src/
  import/      lectura de archivos, detección de tablas, plan de importación (puro, con tests)
  data/        Dexie, repositorio, hooks en vivo, datos de ejemplo
  model/       tipos, periodos, agregaciones, formato
  scenes/      escenas 3D: layout puro (con tests) + lienzo react-three-fiber
  features/    pantallas: city, import, movements, categories, settings…
  ui/          shell, navegación, componentes base, iconos
  store/       estado de UI (Zustand): ruta, filtros, modales, avisos
```
