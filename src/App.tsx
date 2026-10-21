import { lazy, Suspense, useEffect } from 'react'
import { useSettings } from './data/hooks'
import { CategoriesScreen } from './features/categories/CategoriesScreen'
import { ImportWizard } from './features/import/ImportWizard'
import { MovementForm } from './features/movements/MovementForm'
import { MovementsScreen } from './features/movements/MovementsScreen'
import { ComingSoon } from './features/placeholder/ComingSoon'
import { SettingsScreen } from './features/settings/SettingsScreen'
import { useUI, type Route } from './store/ui'
import { useBankAutoSync } from './features/accounts/useBankAutoSync'
import { AppShell } from './ui/AppShell'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { CURRENT_PHASE, navItem } from './ui/nav'

// Las escenas (three.js) van en su propio chunk: la primera carga solo trae lo básico.
const CityScreen = lazy(() => import('./features/city/CityScreen').then((m) => ({ default: m.CityScreen })))
const RidgeScreen = lazy(() => import('./features/ridge/RidgeScreen').then((m) => ({ default: m.RidgeScreen })))
const BalanceScreen = lazy(() => import('./features/balance/BalanceScreen').then((m) => ({ default: m.BalanceScreen })))
const LabScreen = lazy(() => import('./features/lab/LabScreen').then((m) => ({ default: m.LabScreen })))
const RiverScreen = lazy(() => import('./features/river/RiverScreen').then((m) => ({ default: m.RiverScreen })))
const GoalsScreen = lazy(() => import('./features/goals/GoalsScreen').then((m) => ({ default: m.GoalsScreen })))
const LeaksScreen = lazy(() => import('./features/leaks/LeaksScreen').then((m) => ({ default: m.LeaksScreen })))
const CalendarScreen = lazy(() => import('./features/calendar/CalendarScreen').then((m) => ({ default: m.CalendarScreen })))
const SortScreen = lazy(() => import('./features/sort/SortScreen').then((m) => ({ default: m.SortScreen })))
const AccountsScreen = lazy(() => import('./features/accounts/AccountsScreen').then((m) => ({ default: m.AccountsScreen })))
const ReportsScreen = lazy(() => import('./features/reports/ReportsScreen').then((m) => ({ default: m.ReportsScreen })))
const DashboardScreen = lazy(() => import('./features/dashboard/DashboardScreen').then((m) => ({ default: m.DashboardScreen })))

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
    case 'inicio':
      return (
        <Suspense fallback={<Loading />}>
          <DashboardScreen />
        </Suspense>
      )
    case 'ciudad':
      return (
        <Suspense fallback={<Loading />}>
          <CityScreen />
        </Suspense>
      )
    case 'cordillera':
      return (
        <Suspense fallback={<Loading />}>
          <RidgeScreen />
        </Suspense>
      )
    case 'balanza':
      return (
        <Suspense fallback={<Loading />}>
          <BalanceScreen />
        </Suspense>
      )
    case 'rio':
      return (
        <Suspense fallback={<Loading />}>
          <RiverScreen />
        </Suspense>
      )
    case 'objetivos':
      return (
        <Suspense fallback={<Loading />}>
          <GoalsScreen />
        </Suspense>
      )
    case 'fugas':
      return (
        <Suspense fallback={<Loading />}>
          <LeaksScreen />
        </Suspense>
      )
    case 'laboratorio':
      return (
        <Suspense fallback={<Loading />}>
          <LabScreen />
        </Suspense>
      )
    case 'calendario':
      return (
        <Suspense fallback={<Loading />}>
          <CalendarScreen />
        </Suspense>
      )
    case 'clasificar':
      return (
        <Suspense fallback={<Loading />}>
          <SortScreen />
        </Suspense>
      )
    case 'cuentas':
      return (
        <Suspense fallback={<Loading />}>
          <AccountsScreen />
        </Suspense>
      )
    case 'informes':
      return (
        <Suspense fallback={<Loading />}>
          <ReportsScreen />
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
  useBankAutoSync()
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
