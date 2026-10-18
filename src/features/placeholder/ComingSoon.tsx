import { Card } from '../../ui/components/primitives'
import type { NavItem } from '../../ui/nav'

export function ComingSoon({ item }: { item: NavItem }) {
  const Icon = item.icon
  return (
    <div className="mx-auto max-w-2xl py-10">
      <Card className="relative overflow-hidden p-8 text-center sm:p-12">
        <div className="absolute inset-x-0 -top-24 -z-10 mx-auto h-64 w-64 rounded-full blur-3xl" style={{ background: 'var(--glow)' }} />
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent/30 to-accent-2/20">
          <Icon size={30} className="text-accent-2" />
        </div>
        <div className="text-xs font-semibold tracking-widest text-accent-2 uppercase">Llega en la fase {item.phase}</div>
        <h2 className="mt-2 font-display text-3xl font-bold">{item.label}</h2>
        <p className="mx-auto mt-3 max-w-md text-ink-muted">{item.blurb}</p>
      </Card>
    </div>
  )
}
