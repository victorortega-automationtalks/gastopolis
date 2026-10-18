import { Component, type ErrorInfo, type ReactNode } from 'react'
import { exportBackup } from '../data/repo'
import { saveFile, stamp } from '../platform'

interface State {
  error: Error | null
}

/**
 * Si una pantalla revienta, se ve el error y una salida (copia de seguridad, recargar) en vez de una página negra.
 * Se remonta con `key` al cambiar de pantalla, lo que limpia el error.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <h2 className="font-display text-2xl font-semibold">Algo se ha roto en esta pantalla</h2>
        <p className="mt-2 text-sm text-ink-muted">Tus datos siguen guardados. Puedes guardar una copia por si acaso y recargar.</p>
        <pre className="mt-4 overflow-x-auto rounded-lg border border-line bg-surface p-3 text-left text-xs text-danger">
          {error.name}: {error.message}
        </pre>
        <div className="mt-5 flex justify-center gap-2">
          <button
            className="rounded-lg border border-line bg-surface-2 px-4 py-2 text-sm"
            onClick={async () => saveFile(`gastopolis-copia-${stamp()}.json`, JSON.stringify(await exportBackup()), 'application/json')}
          >
            Guardar copia
          </button>
          <button className="rounded-lg bg-accent px-4 py-2 text-sm text-white" onClick={() => location.reload()}>
            Recargar
          </button>
        </div>
      </div>
    )
  }
}
