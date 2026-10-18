# Gastópolis — notas para trabajar en el repo

- Interfaz, textos y comentarios en **español**. Identificadores de código en inglés.
- El diseño acordado y el plan por fases están en `docs/DESIGN.md`. `CURRENT_PHASE` en `src/ui/nav.ts` controla qué pantallas aparecen como «Próximamente».
- Comprobar antes de dar algo por hecho: `npx tsc -b`, `npx vitest run`, `npx oxlint src`, `npm run build`.

## Convenciones

- **Lógica pura fuera de React** (`src/import`, `src/model`) y con tests. Los componentes solo componen.
- **Signo de los importes:** gastos negativos, ingresos positivos, transferencias con su signo. Usa `signFor()`; no inventes otra convención.
- **El tipo pertenece a la categoría.** Si cambias la categoría de un movimiento, usa `recategorize()`/`updateMovement()` del repositorio, que ajustan `kind` y signo.
- Toda escritura en IndexedDB pasa por `src/data/repo.ts`. Toda lectura en vivo, por `src/data/queries.ts` (tienen test que valida los índices de Dexie: un `orderBy` sobre un campo sin índice rompe la app entera).
- Colores siempre con tokens (`text-ink`, `bg-surface`, `text-expense`…), nunca hex sueltos en componentes. Los colores de categoría usan `.chip-ink` + `--c` para que se lean en tema claro.
- Los datos reales de usuarios **no** se suben al repo. Los tests usan fixtures sintéticos que imitan su estructura.

## Probar en navegador

Chromium está en `/opt/pw-browsers/chromium`; con `@playwright/test` hay que pasar `executablePath` (no ejecutar `playwright install`).
