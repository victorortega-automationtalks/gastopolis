# Gastópolis

Tu dinero como una ciudad en 3D. Importa tu Excel de gastos y explóralo bloque a bloque, fija objetivos de ahorro, caza fugas de dinero y simula decisiones antes de tomarlas.

Local-first: todo se guarda en el dispositivo (IndexedDB). Sin cuentas ni servidores.

> Estado: **fase 2 de 6** — importador, movimientos, categorías, ajustes y la **Ciudad 3D**. Plan completo en [`docs/DESIGN.md`](docs/DESIGN.md).

## Arrancar

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest: importador, repositorio, consultas
npm run build      # tsc + build de producción en dist/
```

## Qué hace ya

- **Ciudad 3D**: cada categoría es un barrio y cada concepto un edificio (superficie = importe; altura = nº de movimientos, importe o media). Clic para seleccionar, clic en un barrio o doble clic para entrar, Esc para subir — como WinDirStat. Panel lateral sincronizado con barras por mes, bloques hijos y últimos movimientos; en móvil, hoja inferior. Agrupación configurable (categoría → concepto, por meses…), color por categoría o por calor. Ambientada como una ciudad nocturna real: racimos de torres con ventanas encendidas, tráfico con faros, farolas, río con barcos y reflejos, extrarradio, parques y cielo estrellado; calidad automática para móviles.
- **Importar Excel/CSV** (`.xlsx`, `.xlsm`, `.xls`, `.csv`): detecta tablas de movimientos aunque estén una al lado de otra, propone el mapeo de columnas, convierte Ahorro/Cripto en transferencias, avisa de filas que no puede leer y no duplica si reimportas. Cada importación se puede deshacer.
- **Movimientos**: tabla virtualizada, filtros por periodo, tipo y texto; edición, alta manual y acciones en bloque con deshacer.
- **Categorías**: jerarquía, color, icono, presupuesto mensual, cambio de tipo y fusión.
- **Ajustes**: moneda, inicio del año, tema Neón/Polar, copia de seguridad JSON, CSV, datos de ejemplo.

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
