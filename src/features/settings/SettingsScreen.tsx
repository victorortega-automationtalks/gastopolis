import { Database, Download, Lock, RotateCcw, Trash2 } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useBatches, useCategories, useCategoryMap, useRawMovements, useSettings } from '../../data/hooks'
import { paydayShifts } from '../../model/payday'
import { loadSample, removeSample, resetAll, saveSettings, toCSV, undoImport } from '../../data/repo'
import { monthName } from '../../model/format'
import { isNative, saveFile, stamp } from '../../platform'
import type { Quality, ThemeName } from '../../model/types'
import { useUI } from '../../store/ui'
import { Button, Card, Field, Modal, Segmented } from '../../ui/components/primitives'
import { BackupDialog, RestoreButton } from './backup'

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
  const { movements } = useRawMovements()
  const categories = useCategories()
  const batches = useBatches()
  const toast = useUI((s) => s.toast)
  const [backingUp, setBackingUp] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetText, setResetText] = useState('')
  const hasSample = movements.some((m) => m.source === 'sample')

  const exportCsv = async () => {
    const r = await saveFile(`gastopolis-movimientos-${stamp()}.csv`, toCSV(movements, categories), 'text/csv')
    if (r !== 'cancelled') toast('CSV listo')
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

      <PaydaySection />

      <Section title="Detector de fugas" desc="Ajusta qué cuenta como gasto hormiga y cuándo dos cargos iguales se consideran duplicados.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Gasto hormiga: compras de hasta" hint="Cafés, máquinas, chucherías… muchas pequeñas que suman.">
            <select className="field" value={settings.leakAntMax} onChange={(e) => saveSettings({ leakAntMax: Number(e.target.value) })}>
              {[3, 5, 8, 10, 15].map((v) => (
                <option key={v} value={v}>
                  {v} {settings.currency === 'EUR' ? '€' : settings.currency}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Duplicados: mismo cargo en" hint="Mismo concepto e importe con menos días de diferencia.">
            <select className="field" value={settings.leakDupDays} onChange={(e) => saveSettings({ leakDupDays: Number(e.target.value) })}>
              {[0, 1, 2, 3, 5].map((v) => (
                <option key={v} value={v}>
                  {v === 0 ? 'el mismo día' : `${v} ${v === 1 ? 'día' : 'días'} o menos`}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Aspecto">
        <div className="flex flex-wrap items-center gap-6">
          <Field group label="Tema">
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
          <Field group label="Calidad gráfica 3D" hint="«Auto» baja efectos en móviles modestos.">
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
        desc={
          isNative
            ? 'Todo vive en este dispositivo, dentro de la app: no sale a internet. Si desinstalas la app, se borra; haz copias de vez en cuando.'
            : 'Todo vive en este dispositivo: no sale a internet. Si borras los datos del navegador, se pierden; haz copias de vez en cuando.'
        }
      >
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setBackingUp(true)}>
            <Lock size={15} /> Hacer copia
          </Button>
          <RestoreButton />
          <Button onClick={exportCsv} disabled={!movements.length}>
            <Download size={15} /> Exportar CSV
          </Button>
          <Button onClick={sample}>
            <Database size={15} /> {hasSample ? 'Quitar datos de ejemplo' : 'Cargar datos de ejemplo'}
          </Button>
          <Button variant="danger" onClick={() => setConfirmReset(true)}>
            <Trash2 size={15} /> Borrar todo
          </Button>
        </div>
        <p className="mt-3 text-xs text-ink-faint">
          {settings.lastBackupAt
            ? `Última copia: ${new Date(settings.lastBackupAt).toLocaleDateString('es-ES', { dateStyle: 'long' })}. `
            : 'Aún no has hecho ninguna copia. '}
          Restaurar sustituye todo lo que hay ahora por el contenido de la copia.
        </p>
        <BackupDialog open={backingUp} onClose={() => setBackingUp(false)} />
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

/** Nómina inteligente: qué ha detectado y un interruptor. */
function PaydaySection() {
  const settings = useSettings()
  const { movements } = useRawMovements()
  const categories = useCategoryMap()
  const series = useMemo(() => paydayShifts(movements).series, [movements])
  const on = settings.paydayShift !== false
  const when = (offset: number) =>
    offset < 0 ? `suele llegar ${-offset === 1 ? 'el último día' : `${-offset} días antes de fin de mes`}` : `suele llegar el día ${offset + 1}`
  return (
    <Section
      title="Nómina inteligente"
      desc="Si cobras a finales de mes, ese dinero es para el mes siguiente: la nómina del 28 de septiembre cuenta en octubre. Si un mes llega tarde o pronto, se coloca en el mes que le toca. En las listas siempre ves la fecha real."
    >
      <Segmented<'on' | 'off'>
        value={on ? 'on' : 'off'}
        onChange={(v) => saveSettings({ paydayShift: v === 'on' })}
        options={[
          { value: 'on', label: 'Activada' },
          { value: 'off', label: 'Fechas reales' },
        ]}
      />
      {series.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm text-ink-muted">
          {series.map((s) => (
            <li key={s.categoryId}>
              <span className="font-medium text-ink">{categories.get(s.categoryId)?.name ?? 'Ingreso'}</span>: {when(s.offset)}
              {s.shifted > 0 && ` · ${s.shifted} ${s.shifted === 1 ? 'cobro cuenta' : 'cobros cuentan'} para el mes siguiente`}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-ink-faint">Aún no hay ingresos mensuales que detectar (hacen falta tres meses).</p>
      )}
    </Section>
  )
}
