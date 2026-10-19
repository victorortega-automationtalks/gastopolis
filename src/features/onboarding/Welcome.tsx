import { createStarterCategories, loadSample } from '../../data/repo'
import { useUI } from '../../store/ui'

/** Primera vez: importar, ver un ejemplo o empezar en blanco. */
export function Welcome() {
  const openImport = useUI((s) => s.openImport)
  const editMovement = useUI((s) => s.editMovement)
  const toast = useUI((s) => s.toast)
  const sample = async () => {
    const { buildSample } = await import('../../data/sample')
    const data = buildSample()
    await loadSample(data)
    toast(`Cargados ${data.movements.length} movimientos de ejemplo. Puedes quitarlos en Ajustes.`)
  }
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-8 py-10 text-center sm:py-16">
      <div className="relative">
        <div className="absolute inset-0 -z-10 blur-3xl" style={{ background: 'radial-gradient(circle, var(--glow), transparent 70%)' }} />
        <img src="./favicon.svg" alt="" className="h-20 w-20 rounded-2xl shadow-2xl" />
      </div>
      <div>
        <h2 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
          Tu dinero, como una <span className="text-gradient">ciudad</span>.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-ink-muted">
          Importa tu Excel de gastos y explóralo en 3D, bloque a bloque. Todo se guarda en este dispositivo: sin cuentas, sin servidores.
        </p>
      </div>
      <div className="grid w-full gap-3 sm:grid-cols-3">
        <button onClick={() => openImport(true)} className="glass group rounded-2xl p-5 text-left transition hover:border-accent/50">
          <div className="font-display font-semibold">Importar Excel o CSV</div>
          <p className="mt-1 text-sm text-ink-muted">Detecta tablas de gastos e ingresos, también una al lado de la otra.</p>
        </button>
        <button onClick={sample} className="glass group rounded-2xl p-5 text-left transition hover:border-accent-2/50">
          <div className="font-display font-semibold">Ver con datos de ejemplo</div>
          <p className="mt-1 text-sm text-ink-muted">18 meses inventados para curiosear. Se quitan con un botón.</p>
        </button>
        <button
          onClick={() => void createStarterCategories().then(() => editMovement(''))}
          className="glass group rounded-2xl p-5 text-left transition hover:border-income/50"
        >
          <div className="font-display font-semibold">Empezar en blanco</div>
          <p className="mt-1 text-sm text-ink-muted">Te dejo unas categorías básicas y apuntas movimientos a mano.</p>
        </button>
      </div>
    </div>
  )
}
