import { CircleDashed } from 'lucide-react'
import { CATEGORY_ICONS } from './iconRegistry'

export function CategoryIcon({ name, className, size = 16 }: { name: string; className?: string; size?: number }) {
  const Icon = CATEGORY_ICONS[name] ?? CircleDashed
  return <Icon className={className} size={size} strokeWidth={1.8} />
}
