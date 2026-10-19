# Gastópolis

Tu dinero como una ciudad en 3D. Importa tu Excel de gastos y explóralo bloque a bloque, fija objetivos de ahorro, caza fugas de dinero y simula decisiones antes de tomarlas.

Local-first: todo se guarda en el dispositivo (IndexedDB). Sin cuentas ni servidores.

> Estado: **fase 1 de 6** — importador, movimientos, categorías y ajustes. Las escenas 3D llegan en la fase 2. Plan completo en [`docs/DESIGN.md`](docs/DESIGN.md).

## Arrancar

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest: importador, repositorio, consultas
npm run build      # tsc + build de producción en dist/
```

## Qué hace ya

- **Importar Excel/CSV** (`.xlsx`, `.xlsm`, `.xls`, `.csv`): detecta tablas de movimientos aunque estén una al lado de otra, propone el mapeo de columnas, convierte Ahorro/Cripto en transferencias, avisa de filas que no puede leer y no duplica si reimportas. Cada importación se puede deshacer.
- **Movimientos**: tabla virtualizada, filtros por periodo, tipo y texto; edición, alta manual y acciones en bloque con deshacer.
- **Categorías**: jerarquía, color, icono, presupuesto mensual, cambio de tipo y fusión.
- **Ajustes**: moneda, inicio del año, tema Neón/Polar, copia de seguridad JSON, CSV, datos de ejemplo.

## Stack

React 19 · TypeScript · Vite · Tailwind 4 · Zustand · Dexie · SheetJS · (próximas fases) three.js con react-three-fiber, d3-hierarchy, Capacitor.

## Estructura

```
src/
  import/      lectura de archivos, detección de tablas, plan de importación (puro, con tests)
  data/        Dexie, repositorio, hooks en vivo, datos de ejemplo
  model/       tipos, periodos, agregaciones, formato
  features/    pantallas: import, movements, categories, settings…
  ui/          shell, navegación, componentes base, iconos
  store/       estado de UI (Zustand): ruta, filtros, modales, avisos
```
