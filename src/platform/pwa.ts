import { useUI } from '../store/ui'
import { runtime } from '.'

/**
 * Registra el service worker de la web app (solo navegador y build de producción). Con una versión nueva no se
 * cambia sola a mitad de uso: avisa y se actualiza al pulsar (o la próxima vez que se abra).
 */
export async function registerPWA(): Promise<void> {
  if (runtime !== 'web' || !import.meta.env.PROD || !('serviceWorker' in navigator)) return
  const { registerSW } = await import('virtual:pwa-register')
  const update = registerSW({
    onNeedRefresh: () => useUI.getState().toast('Hay una versión nueva de Gastópolis', 'info', { label: 'Actualizar', run: () => void update(true) }),
  })
}
