import { Database, Download, RotateCcw, Trash2, Upload } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { useBatches, useCategories, useMovements, useSettings } from '../../data/hooks'
import { exportBackup, loadSample, removeSample, resetAll, restoreBackup, saveSettings, toCSV, undoImport, validateBackup } from '../../data/repo'
import { downloadText, stamp } from '../../lib/download'
import { monthName } from '../../model/format'
import type { Quality, ThemeName } from '../../model/types'
import { useUI } from '../../store/ui'
import { Button, Card, Field, Modal, Segmented } from '../../ui/components/primitives'

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'MXN', 'ARS', 'COP', 'CLP', 'PEN']

function Section({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {desc && <p className="mt-1 text-sm text-ink-muted">{desc}</p>}
      <div className="mt-4">{children}</div>
    </Card>
  )
}

export function SettingsScreen() {
  const settings = useSettings()
  const { movements } = useMovements()
  const categories = useCategories()
  const batches = useBatches()
  const toast = useUI((s) => s.toast)
  const fileRef = useRef<HTMLInputElement>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetText, setResetText] = useState('')
  const hasSample = movements.some((m) => m.source === 'sample')

  const backup = async () => {
    const b = await exportBackup()
    downloadText(`gastopolis-copia-${stamp()}.json`, JSON.stringify(b), 'application/json')
    toast(`Copia descargada: ${b.movements.length} movimientos, ${b.categories.length} categorías`)
  }

  const restore = async (file: File) => {
    try {
      const b = validateBackup(JSON.parse(await file.text()))
      await restoreBackup(b)
      toast(`Copia restaurada: ${b.movements.length} movimientos`)
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  const sample = async () => {
    if (hasSample) {
      await removeSample()
      toast('Datos de ejemplo retirados')
    } else {
      const { buildSample } = await import('../../data/sample')
      await loadSample(buildSample())
      toast('Datos de ejemplo cargados')
    }
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <Section title="Formato">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Moneda">
            <select className="field" value={settings.currency} onChange={(e) => saveSettings({ currency: e.target.value })}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Inicio del año" hint="Para «Este año» y los años en los filtros. Útil si tu año empieza con la paga de septiembre, por ejemplo.">
            <select className="field" value={settings.fiscalYearStart} onChange={(e) => saveSettings({ fiscalYearStart: Number(e.target.value) })}>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i + 1}>
                  {monthName(i + 1)}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Aspecto">
        <div className="flex flex-wrap items-center gap-6">
          <Field label="Tema">
            <Segmented<ThemeName>
              value={settings.theme}
              onChange={(theme) => saveSettings({ theme })}
              options={[
                { value: 'neon', label: 'Neón' },
                { value: 'polar', label: 'Polar' },
                { value: 'system', label: 'Sistema' },
              ]}
            />
          </Field>
          <Field label="Calidad gráfica 3D" hint="«Auto» baja efectos en móviles modestos.">
            <Segmented<Quality>
              value={settings.quality}
              onChange={(quality) => saveSettings({ quality })}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'high', label: 'Alta' },
                { value: 'low', label: 'Ligera' },
              ]}
            />
          </Field>
        </div>
      </Section>

      <Section
        title="Tus datos"
        desc="Todo vive en este dispositivo (IndexedDB del navegador). Haz copias de vez en cuando: si borras los datos del navegador, se pierden."
      >
        <div className="flex flex-wrap gap-2">
          <Button onClick={backup}>
            <Download size={15} /> Descargar copia (.json)
          </Button>
          <Button onClick={() => fileRef.current?.click()}>
            <Upload size={15} /> Restaurar copia
          </Button>
          <Button onClick={() => downloadText(`gastopolis-movimientos-${stamp()}.csv`, toCSV(movements, categories), 'text/csv')} disabled={!movements.length}>
            <Download size={15} /> Exportar CSV
          </Button>
          <Button onClick={sample}>
            <Database size={15} /> {hasSample ? 'Quitar datos de ejemplo' : 'Cargar datos de ejemplo'}
          </Button>
          <Button variant="danger" onClick={() => setConfirmReset(true)}>
            <Trash2 size={15} /> Borrar todo
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void restore(f)
            e.target.value = ''
          }}
        />
        <p className="mt-3 text-xs text-ink-faint">Restaurar sustituye todo lo que hay ahora por el contenido de la copia.</p>
      </Section>

      <Section title="Importaciones" desc="Cada importación se puede deshacer: se borran exactamente los movimientos que trajo.">
        {batches.length === 0 ? (
          <p className="text-sm text-ink-faint">Aún no has importado nada.</p>
        ) : (
          <ul className="divide-y divide-line">
            {batches.map((b) => (
              <li key={b.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{b.fileName}</span>
                <span className="text-xs text-ink-muted">{new Date(b.importedAt).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                <span className="num w-16 text-right text-xs">{b.count} mov.</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    const n = await undoImport(b.id)
                    toast(`Deshecha: ${n} movimientos borrados`)
                  }}
                >
                  <RotateCcw size={13} /> Deshacer
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Borrar todos los datos"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={resetText !== 'BORRAR'}
              onClick={async () => {
                await resetAll()
                setConfirmReset(false)
                setResetText('')
                toast('Datos borrados')
              }}
            >
              Borrar {movements.length} movimientos
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">
          Se borran movimientos, categorías, reglas y objetivos de este dispositivo. No se puede deshacer; descarga una copia antes si dudas.
        </p>
        <Field label="Escribe BORRAR para confirmar" className="mt-4">
          <input className="field" value={resetText} onChange={(e) => setResetText(e.target.value)} />
        </Field>
      </Modal>
    </div>
  )
}
