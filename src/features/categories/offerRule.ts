import { applyRulesToExisting, createRule } from '../../data/repo'
import type { Toast } from '../../store/ui'

type ToastFn = (text: string, tone?: Toast['tone'], action?: Toast['action']) => void

/**
 * Tras cambiar a mano la categoría de un concepto, ofrece convertirlo en regla: así el próximo «Repsol» importado
 * ya llega a Gasolina, y los que había se corrigen también.
 */
export function offerRule(toast: ToastFn, concept: string, categoryId: string, categoryName: string, message: string) {
  toast(message, 'ok', {
    label: `Siempre «${concept.length > 18 ? concept.slice(0, 17) + '…' : concept}» → ${categoryName}`,
    run: async () => {
      const id = await createRule({ matchType: 'contains', pattern: concept, categoryId })
      const n = await applyRulesToExisting(id)
      toast(n ? `Regla creada · ${n} movimientos más corregidos` : 'Regla creada: se aplicará a lo que importes')
    },
  })
}
