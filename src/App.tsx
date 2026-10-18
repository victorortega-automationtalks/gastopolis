import { lazy, Suspense, useEffect } from 'react'
import { useSettings } from './data/hooks'
import { CategoriesScreen } from './features/categories/CategoriesScreen'
import { ImportWizard } from './features/import/ImportWizard'
import { MovementForm } from './features/movements/MovementForm'
import { MovementsScreen } from './features/movements/MovementsScreen'
import { ComingSoon } from './features/placeholder/ComingSoon'
import { SettingsScreen } from './features/settings/SettingsScreen'
import { useUI, type Route } from './store/ui'
import { AppShell } from './ui/AppShell'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { CURRENT_PHASE, navItem } from './ui/nav'

// Las escenas (three.js, recharts) van en su propio chunk: la primera carga solo trae lo básico.
const CityScreen = lazy(() => import('./features/city/CityScreen').then((m) => ({ default: m.CityScreen })))

function Loading() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-line-strong border-t-accent-2" />
    </div>
  )
}

function useTheme() {
  const { theme } = useSettings()
  useEffect(() => {
    const apply = () => {
      const resolved = theme === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'polar' : 'neon') : theme
      document.documentElement.dataset.theme = resolved
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'polar' ? '#f3f4fa' : '#06070c')
    }
    apply()
    if (theme !== 'system') return
    const mq = matchMedia('(prefers-color-scheme: light)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
}

function Screen({ route }: { route: Route }) {
  switch (route) {
    case 'ciudad':
      return (
        <Suspense fallback={<Loading />}>
          <CityScreen />
        </Suspense>
      )
    case 'movimientos':
      return <MovementsScreen />
    case 'categorias':
      return <CategoriesScreen />
    case 'ajustes':
      return <SettingsScreen />
    default: {
      const item = navItem(route)
      return item.phase > CURRENT_PHASE ? <ComingSoon item={item} /> : null
    }
  }
}

export default function App() {
  useTheme()
  const route = useUI((s) => s.route)
  return (
    <>
      <AppShell>
        <ErrorBoundary key={route}>
          <Screen route={route} />
        </ErrorBoundary>
      </AppShell>
      <ImportWizard />
      <MovementForm />
    </>
  )
}
