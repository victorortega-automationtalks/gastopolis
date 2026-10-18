import { Lock, ShieldAlert, Upload, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { useMovements, useSettings } from '../../data/hooks'
import { exportBackup, restoreBackup, saveSettings, validateBackup } from '../../data/repo'
import { isSealed, sealText, unsealText, type SealedFile } from '../../lib/crypto'
import { backupDue } from '../../model/backup'
import { saveFile, stamp } from '../../platform'
import { useUI } from '../../store/ui'
import { Button, Field, Modal } from '../../ui/components/primitives'

const MIN_PASSWORD = 6

/** Hace la copia (cifrada salvo que se pida lo contrario) y la entrega según la plataforma. */
export function BackupDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useUI((s) => s.toast)
  const [pass, setPass] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const close = () => {
    setPass('')
    setAgain('')
    onClose()
  }
  const run = async (encrypt: boolean) => {
    setBusy(true)
    try {
      const b = await exportBackup()
      const json = JSON.stringify(b)
      const text = encrypt ? JSON.stringify(await sealText(json, pass)) : json
      const name = `gastopolis-copia${encrypt ? '-cifrada' : ''}-${stamp()}.json`
      const result = await saveFile(name, text, 'application/json')
      if (result === 'cancelled') return
      await saveSettings({ lastBackupAt: Date.now() })
      toast(`Copia ${encrypt ? 'cifrada ' : ''}lista: ${b.movements.length} movimientos`)
      close()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }
  const ok = pass.length >= MIN_PASSWORD && pass === again
  return (
    <Modal
      open={open}
      onClose={close}
      title="Copia de seguridad"
      footer={
        <>
          <Button variant="ghost" className="mr-auto" onClick={() => run(false)} disabled={busy}>
            Sin cifrar
          </Button>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => run(true)} disabled={!ok || busy}>
            <Lock size={14} /> {busy ? 'Cifrando…' : 'Guardar cifrada'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (ok && !busy) void run(true)
        }}
      >
        <p className="text-sm text-ink-muted">
          La copia sale del dispositivo (a Drive, un pendrive, WhatsApp…). Cífrala: sin la contraseña nadie puede abrirla. Si la olvidas, tampoco tú.
        </p>
        <Field label="Contraseña" hint={pass && pass.length < MIN_PASSWORD ? `Al menos ${MIN_PASSWORD} caracteres` : undefined}>
          <input type="password" className="field" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} autoFocus />
        </Field>
        <Field label="Repítela" hint={again && again !== pass ? 'No coinciden' : undefined}>
          <input type="password" className="field" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

/** Botón que restaura una copia (cifrada o no), con su selector de archivo y la contraseña si hace falta. */
export function RestoreButton() {
  const toast = useUI((s) => s.toast)
  const input = useRef<HTMLInputElement>(null)
  const [sealed, setSealed] = useState<SealedFile | null>(null)
  const [pass, setPass] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const apply = async (data: unknown) => {
    const b = validateBackup(data)
    await restoreBackup(b)
    toast(`Copia restaurada: ${b.movements.length} movimientos`)
  }
  const pick = async (file: File) => {
    try {
      const data: unknown = JSON.parse(await file.text())
      if (isSealed(data)) setSealed(data)
      else await apply(data)
    } catch (e) {
      toast(e instanceof SyntaxError ? 'Ese archivo no es una copia de Gastópolis' : (e as Error).message, 'error')
    }
  }
  const unlock = async () => {
    if (!sealed) return
    setBusy(true)
    setError(null)
    try {
      await apply(JSON.parse(await unsealText(sealed, pass)))
      setSealed(null)
      setPass('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button onClick={() => input.current?.click()}>
        <Upload size={15} /> Restaurar copia
      </Button>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void pick(f)
          e.target.value = ''
        }}
      />
      <Modal
        open={!!sealed}
        onClose={() => setSealed(null)}
        title="Copia cifrada"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSealed(null)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={unlock} disabled={!pass || busy}>
              {busy ? 'Descifrando…' : 'Restaurar'}
            </Button>
          </>
        }
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (pass && !busy) void unlock()
          }}
        >
          <p className="text-sm text-ink-muted">Escribe la contraseña con la que se hizo. Restaurar sustituye todo lo que hay ahora.</p>
          <Field label="Contraseña">
            <input type="password" className="field" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} autoFocus />
          </Field>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button type="submit" hidden />
        </form>
      </Modal>
    </>
  )
}

const SNOOZE_KEY = 'gastopolis.backupSnooze'
const WEEK = 7 * 86_400_000

function readSnooze(): number {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY)) || 0
  } catch {
    return 0
  }
}

/** Aviso en el Inicio cuando hace mucho de la última copia: los datos solo viven en este dispositivo. */
export function BackupReminder() {
  const settings = useSettings()
  const { movements } = useMovements()
  const [now] = useState(Date.now)
  const [snoozedUntil, setSnoozedUntil] = useState(readSnooze)
  const [open, setOpen] = useState(false)
  const real = movements.reduce((n, m) => (m.source === 'sample' ? n : n + 1), 0)
  const due = backupDue(settings.lastBackupAt, real, now)
  if (!due || now < snoozedUntil) return null
  const snooze = () => {
    const until = now + WEEK
    setSnoozedUntil(until)
    try {
      localStorage.setItem(SNOOZE_KEY, String(until))
    } catch {
      // Sin almacenamiento: el aviso volverá a salir, nada más.
    }
  }
  return (
    <div className="glass flex flex-wrap items-center gap-3 rounded-2xl border-warn/30 px-4 py-3 text-sm">
      <ShieldAlert size={18} className="shrink-0 text-warn" />
      <span className="min-w-0 flex-1">
        {due.days == null ? 'Aún no has hecho ninguna copia.' : `Tu última copia es de hace ${due.days} días.`} Tus datos solo están en este dispositivo: si se
        pierde o se borra la app, se pierden con él.
      </span>
      <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
        <Lock size={13} /> Hacer copia
      </Button>
      <Button size="sm" variant="ghost" onClick={snooze} aria-label="Recordar dentro de una semana">
        <X size={14} />
      </Button>
      <BackupDialog open={open} onClose={() => setOpen(false)} />
    </div>
  )
}
