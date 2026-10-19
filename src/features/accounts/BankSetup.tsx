import clsx from 'clsx'
import { Check, Copy, ExternalLink, FileKey2, ShieldCheck } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { DEFAULT_REDIRECT, listBanks } from '../../bank/run'
import { useBankSecret } from '../../data/hooks'
import { saveBankSecret } from '../../data/repo'
import { openExternal } from '../../platform'
import { useUI } from '../../store/ui'
import { Button, Field, Modal } from '../../ui/components/primitives'

/**
 * Tutorial para crear la cuenta y la aplicación de Enable Banking, y cargar su credencial en Gastópolis. Enable
 * Banking es quien habla con los bancos por PSD2; en modo «restringido» es gratis para leer tus propias cuentas.
 */

const CONTROL_PANEL = 'https://enablebanking.com/cp/applications'
const SIGN_IN = 'https://enablebanking.com/sign-in/'
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

const STEPS = ['Antes de empezar', 'Crea tu cuenta', 'Registra la aplicación', 'Enlaza tus bancos', 'Carga la credencial'] as const

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-semibold text-ink">{n}</span>
      <div className="min-w-0 space-y-2 text-sm text-ink-muted">
        <h3 className="font-medium text-ink">{title}</h3>
        {children}
      </div>
    </div>
  )
}

function CopyLine({ value }: { value: string }) {
  const [done, setDone] = useState(false)
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
      <code className="num min-w-0 flex-1 truncate text-xs text-ink">{value}</code>
      <button
        onClick={() => {
          void navigator.clipboard?.writeText(value)
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        }}
        className="text-ink-muted hover:text-ink"
        aria-label="Copiar"
      >
        {done ? <Check size={15} className="text-income" /> : <Copy size={15} />}
      </button>
    </div>
  )
}

function LinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button size="sm" onClick={() => void openExternal(href)}>
      <ExternalLink size={14} />
      {children}
    </Button>
  )
}

export function BankSetup({ open, onClose, onReady }: { open: boolean; onClose: () => void; onReady?: () => void }) {
  const current = useBankSecret()
  const toast = useUI((s) => s.toast)
  const [step, setStep] = useState(current ? 4 : 0)
  const [appId, setAppId] = useState(current?.appId ?? '')
  const [pem, setPem] = useState(current?.privateKeyPem ?? '')
  const [redirect, setRedirect] = useState(current?.redirectUrl ?? DEFAULT_REDIRECT)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  const loadPem = async (file: File) => {
    const text = await file.text()
    if (!/-----BEGIN (RSA )?PRIVATE KEY-----/.test(text)) {
      setResult({ ok: false, text: 'Ese archivo no es la clave privada (.pem) que descarga Enable Banking.' })
      return
    }
    setPem(text)
    const id = UUID.exec(file.name)?.[0]
    if (id) setAppId(id)
    setResult(null)
  }

  const saveAndTest = async () => {
    setTesting(true)
    setResult(null)
    try {
      await saveBankSecret({ appId: appId.trim(), privateKeyPem: pem, redirectUrl: redirect.trim() })
      const banks = await listBanks('ES')
      setResult({ ok: true, text: `Conectado con Enable Banking: ${banks.length} bancos disponibles en España.` })
      toast('Enable Banking configurado')
      onReady?.()
    } catch (e) {
      setResult({ ok: false, text: (e as Error).message })
    } finally {
      setTesting(false)
    }
  }

  const ready = UUID.test(appId) && pem.length > 0 && /^https?:\/\//.test(redirect)

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Conectar con tus bancos: Enable Banking"
      footer={
        <>
          {step > 0 && (
            <Button variant="ghost" onClick={() => setStep(step - 1)}>
              Atrás
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button variant="primary" onClick={() => setStep(step + 1)}>
              Siguiente
            </Button>
          ) : (
            <Button variant="primary" disabled={!ready || testing} onClick={() => void saveAndTest()}>
              {testing ? 'Probando…' : 'Guardar y probar'}
            </Button>
          )}
        </>
      }
    >
      <ol className="mb-5 flex flex-wrap gap-1.5">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              onClick={() => setStep(i)}
              className={clsx(
                'rounded-full border px-2.5 py-1 text-xs transition',
                i === step ? 'border-accent-2 bg-accent-2/10 text-ink' : i < step ? 'border-line text-ink-muted' : 'border-line text-ink-faint',
              )}
            >
              {i + 1}. {s}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="space-y-4 text-sm text-ink-muted">
          <p>
            Gastópolis lee los movimientos de tus bancos con las APIs oficiales de la banca europea (PSD2), a través de{' '}
            <b className="text-ink">Enable Banking</b>. Es <b className="text-ink">solo lectura</b>: nadie puede mover dinero con este permiso.
          </p>
          <div className="rounded-xl border border-line bg-surface p-4">
            <div className="mb-2 flex items-center gap-2 font-medium text-ink">
              <ShieldCheck size={16} className="text-income" /> Qué sale de tu equipo y qué no
            </div>
            <ul className="list-disc space-y-1 pl-5">
              <li>La app se conecta solo a api.enablebanking.com, y solo para leer las cuentas que tú enlaces.</li>
              <li>Tus movimientos pasan por tu banco y por Enable Banking (empresa regulada en la UE) y se guardan solo aquí.</li>
              <li>La credencial (archivo .pem) se queda en este equipo y no va en las copias de seguridad.</li>
              <li>El permiso del banco dura hasta 180 días (90 en algunos bancos). Te avisaremos una semana antes para renovarlo.</li>
              <li>La sincronización funciona en la app de Windows. Al iPhone le llegan los datos con la copia cifrada.</li>
            </ul>
          </div>
          <p>
            Para leer tus propias cuentas, Enable Banking es gratis en su modo «restringido». Necesitas crear una cuenta y una «aplicación» suya; son unos 10
            minutos, una sola vez.
          </p>
        </div>
      )}

      {step === 1 && (
        <Step n={2} title="Crea tu cuenta en Enable Banking">
          <p>Entra con tu correo: te llegará un enlace para confirmar. Si ya tienes cuenta, pasa al siguiente paso.</p>
          <LinkButton href={SIGN_IN}>Abrir enablebanking.com</LinkButton>
        </Step>
      )}

      {step === 2 && (
        <Step n={3} title="Registra tu aplicación (una vez)">
          <p>
            En el panel de control, ve a <b className="text-ink">API applications</b> y rellena «Add a new application»:
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <b className="text-ink">Environment:</b> Production (para tus bancos reales).
            </li>
            <li>
              <b className="text-ink">Private key:</b> deja la opción por defecto (se genera en el navegador).
            </li>
            <li>
              <b className="text-ink">Application name:</b> por ejemplo «Gastópolis personal» (es lo que verás al dar permiso en tu banco).
            </li>
            <li>
              <b className="text-ink">Redirect URLs:</b> esta dirección (cópiala tal cual):
              <div className="mt-1.5">
                <CopyLine value={redirect} />
              </div>
              <span className="mt-1 block text-xs">
                Tiene que ser https y con dominio (el panel no admite localhost). No hace falta que exista: Gastópolis abre tu banco en su propia ventana y
                recoge la vuelta antes de que se cargue, así que nada sale de tu equipo. Si el panel no la aceptara, vale cualquier dirección https tuya (la de
                tu web, por ejemplo); ponla igual en el paso 5.
              </span>
            </li>
            <li>
              Los demás campos (descripción, correo, direcciones de privacidad y de condiciones) puedes rellenarlos con tus datos o con el nombre de la app.
            </li>
          </ul>
          <p>
            Pulsa <b className="text-ink">Register</b>. El navegador descargará un archivo <code className="text-ink">xxxxxxxx-xxxx-….pem</code>: es tu clave
            privada. <b className="text-ink">Guárdalo bien</b>; Enable Banking no lo vuelve a enseñar.
          </p>
          <LinkButton href={CONTROL_PANEL}>Abrir el panel de control</LinkButton>
        </Step>
      )}

      {step === 3 && (
        <Step n={4} title="Activa la aplicación enlazando tus bancos">
          <p>
            En la ficha de la aplicación, pulsa <b className="text-ink">Activate by linking accounts</b> y entra en cada banco que quieras ver en Gastópolis
            (ABANCA, Revolut, Santander, BBVA, CaixaBank…). Aceptas las condiciones de Enable Banking y das permiso en la web de tu banco.
          </p>
          <p>
            Al terminar, la aplicación aparece como <b className="text-ink">Restricted</b> y <b className="text-ink">Active</b>: puede leer solo las cuentas que
            has enlazado, que es justo lo que queremos. Si más adelante abres otra cuenta, vuelve aquí y enlázala también.
          </p>
          <p className="text-xs">Revolut suele estar como banco de Lituania (Revolut Bank UAB). B100 es de ABANCA: si no aparece aparte, entra por ABANCA.</p>
          <LinkButton href={CONTROL_PANEL}>Abrir el panel de control</LinkButton>
        </Step>
      )}

      {step === 4 && (
        <Step n={5} title="Carga la credencial en Gastópolis">
          <Field label="Archivo de la clave (.pem)" hint="El que descargó el navegador al registrar la aplicación. El id de la aplicación se lee de su nombre.">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line-strong bg-surface px-3 py-3 text-sm text-ink hover:border-accent-2">
              <FileKey2 size={16} className="text-accent-2" />
              {pem ? 'Clave cargada · elegir otra' : 'Elegir el archivo .pem'}
              <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && void loadPem(e.target.files[0])} />
            </label>
          </Field>
          <Field label="Id de la aplicación" hint="Aparece en el panel de control (Application ID) y es el nombre del archivo .pem.">
            <input className="field num" value={appId} onChange={(e) => setAppId(e.target.value)} placeholder="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" />
          </Field>
          <Field label="Dirección de vuelta (Redirect URL)" hint="Exactamente la misma que registraste en el panel.">
            <input className="field num" value={redirect} onChange={(e) => setRedirect(e.target.value)} />
          </Field>
          {result && <p className={clsx('rounded-lg px-3 py-2 text-sm', result.ok ? 'bg-income/10 text-income' : 'bg-danger/10 text-danger')}>{result.text}</p>}
        </Step>
      )}
    </Modal>
  )
}
