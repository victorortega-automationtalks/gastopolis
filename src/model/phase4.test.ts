import { describe, expect, it } from 'vitest'
import { buildSample } from '../data/sample'
import { goalProgress, suggestedEmergencyFund } from './goals'
import { detectLeaks, summarizeLeaks } from './leaks'
import { compileRules, countMatches, isValidRegex, previewRules, ruleMatcher } from './rules'
import type { Category, Goal, Kind, Movement, Rule } from './types'

let seq = 0
const mov = (date: string, amount: number, categoryId: string, concept = 'x', kind: Kind = amount < 0 ? 'expense' : 'income'): Movement => ({
  id: `m${seq++}`,
  date,
  amount,
  kind,
  concept,
  conceptKey: concept.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(),
  categoryId,
  tags: [],
  source: 'manual',
  createdAt: 0,
})
const cat = (id: string, kind: Kind, name = id): Category => ({ id, name, kind, parentId: null, color: '#3987e5', icon: 'X', order: 0 })
const rule = (pattern: string, categoryId: string, matchType: Rule['matchType'] = 'contains', priority = 0, enabled = true): Rule => ({
  id: `r${seq++}`,
  name: pattern,
  matchType,
  pattern,
  set: { categoryId },
  priority,
  enabled,
})

describe('reglas', () => {
  it('compara sin tildes ni mayúsculas', () => {
    expect(ruleMatcher({ matchType: 'contains', pattern: 'repsol' })('REPSOL Estación 24h')).toBe(true)
    expect(ruleMatcher({ matchType: 'equals', pattern: 'Nómina' })('nomina')).toBe(true)
    expect(ruleMatcher({ matchType: 'equals', pattern: 'Nómina' })('nomina extra')).toBe(false)
    expect(ruleMatcher({ matchType: 'regex', pattern: '^(lidl|mercadona)' })('Mercadona Centro')).toBe(true)
  })

  it('una regex inválida no coincide con nada y se detecta', () => {
    expect(isValidRegex('(abc')).toBe(false)
    expect(ruleMatcher({ matchType: 'regex', pattern: '(abc' })('abc')).toBe(false)
    expect(ruleMatcher({ matchType: 'contains', pattern: '  ' })('lo que sea')).toBe(false)
  })

  it('gana la primera por prioridad, solo activas y nunca de gasto a ingreso', () => {
    const cats = [cat('gas', 'expense'), cat('coche', 'expense'), cat('nomina', 'income'), cat('cripto', 'transfer')]
    const rules = [
      rule('repsol', 'coche', 'contains', 2),
      rule('repsol', 'gas', 'contains', 1),
      rule('repsol', 'nomina', 'contains', 0),
      rule('revolut', 'cripto'),
    ]
    const c = compileRules(rules, cats)
    expect(c.categoryFor('Repsol', 'expense', -50)).toBe('gas')
    expect(c.categoryFor('Revolut top-up', 'expense', -200)).toBe('cripto')
    expect(compileRules([{ ...rules[1], enabled: false }], cats).categoryFor('Repsol', 'expense', -50)).toBeUndefined()
    // Una transferencia que sale puede pasar a gasto, no a ingreso.
    const toIncome = compileRules([rule('bizum', 'nomina')], cats)
    expect(toIncome.categoryFor('Bizum', 'transfer', -20)).toBeUndefined()
    expect(toIncome.categoryFor('Bizum', 'transfer', 20)).toBe('nomina')
  })

  it('vista previa: solo lo que cambiaría', () => {
    const cats = [cat('gas', 'expense'), cat('otros', 'expense')]
    const ms = [mov('2025-01-01', -50, 'otros', 'Repsol'), mov('2025-01-02', -40, 'gas', 'Repsol'), mov('2025-01-03', -9, 'otros', 'Café')]
    const ch = previewRules([rule('repsol', 'gas')], cats, ms)
    expect(ch.map((c) => c.movement.id)).toEqual([ms[0].id])
    expect(countMatches({ matchType: 'contains', pattern: 'repsol' }, ms)).toBe(2)
  })
})

describe('objetivos', () => {
  const goal = (over: Partial<Goal> = {}): Goal => ({
    id: 'g',
    name: 'Entrada vivienda',
    icon: 'House',
    color: '#3987e5',
    target: 10000,
    initial: 1000,
    startDate: '2025-01-01',
    linkedCategoryIds: ['ahorro-casa'],
    contributions: [],
    priority: 0,
    createdAt: 0,
    ...over,
  })
  // 300 al mes durante 6 meses a la categoría vinculada, y una retirada de 100.
  const ms = [
    ...['01', '02', '03', '04', '05', '06'].map((m) => mov(`2025-${m}-28`, -300, 'ahorro-casa', 'Traspaso', 'transfer')),
    mov('2025-04-10', 100, 'ahorro-casa', 'Saco para el coche', 'transfer'),
    mov('2025-03-01', -999, 'otra', 'No cuenta', 'transfer'),
  ]

  it('suma inicial, transferencias vinculadas y aportaciones; resta retiradas', () => {
    const g = goal({ contributions: [{ id: 'c', date: '2025-05-05', amount: 250, note: 'Regalo' }] })
    const p = goalProgress(g, ms, '2025-06-30')
    expect(p.saved).toBe(1000 + 1800 - 100 + 250)
    expect(p.ratio).toBeCloseTo(0.295)
    expect(p.entries[0]).toMatchObject({ source: 'initial', amount: 1000 })
  })

  it('ritmo, fecha estimada y estado frente a la fecha límite', () => {
    const p = goalProgress(goal({ deadline: '2027-06-30' }), ms, '2025-06-30')
    expect(p.monthlyPace).toBeGreaterThan(250)
    expect(p.monthlyPace).toBeLessThan(320)
    expect(p.eta).not.toBeNull()
    expect(p.status).toBe('behind')
    expect(p.monthlyNeeded).toBeCloseTo(p.remaining / p.monthsLeft!)
    const holgado = goalProgress(goal({ deadline: '2030-01-01' }), ms, '2025-06-30')
    expect(holgado.status).toBe('on-track')
  })

  it('sin ritmo está parado; con lo conseguido, hecho', () => {
    expect(goalProgress(goal({ linkedCategoryIds: [] }), ms, '2025-06-30').status).toBe('stalled')
    const done = goalProgress(goal({ target: 2000 }), ms, '2025-06-30')
    expect(done.status).toBe('done')
    // Los 1.000 € iniciales ya son el 50 %; el 100 % llega tras recuperar la retirada de abril.
    expect(done.milestones.map((m) => m.reachedAt)).toEqual(['2025-01-01', '2025-01-01', '2025-02-28', '2025-04-28'])
  })

  it('recién creado: una aportación suelta no es un ritmo', () => {
    const g = goal({ startDate: '2025-06-20', initial: 0, linkedCategoryIds: [], contributions: [{ id: 'c', date: '2025-06-20', amount: 1200, note: '' }] })
    const p = goalProgress(g, ms, '2025-06-30')
    expect(p.saved).toBe(1200)
    expect(p.status).toBe('new')
    expect(p.monthlyPace).toBe(0)
    expect(p.eta).toBeNull()
  })

  it('el ritmo sale de la costumbre de ahorro aunque el objetivo sea nuevo; lo ahorrado, desde el inicio', () => {
    const p = goalProgress(goal({ startDate: '2025-06-20', initial: 0 }), ms, '2025-06-30')
    expect(p.saved).toBe(300)
    expect(p.status).not.toBe('new')
    expect(p.monthlyPace).toBeGreaterThan(250)
    expect(p.monthlyPace).toBeLessThan(320)
  })

  it('histórico mensual acumulado', () => {
    const h = goalProgress(goal(), ms, '2025-03-15').history
    expect(h).toEqual([
      { month: '2025-01', saved: 1300 },
      { month: '2025-02', saved: 1600 },
      { month: '2025-03', saved: 1600 },
    ])
  })

  it('colchón de emergencia sugerido', () => {
    const exp = ['01', '02', '03', '04', '05', '06'].map((m) => mov(`2025-${m}-15`, -1000, 'c'))
    expect(suggestedEmergencyFund(exp, '2025-06-30')).toBe(6000)
  })
})

describe('fugas', () => {
  const sample = buildSample(new Date(2026, 9, 18))
  const leaks = detectLeaks(sample.movements, sample.categories, '2026-10-18', { antMax: 5, dupDays: 2 })
  const ofType = (t: string) => leaks.filter((l) => l.type === t)

  it('encuentra en el ejemplo lo que se escondió a propósito', () => {
    expect(ofType('price').map((l) => l.title)).toEqual(['Spotify ha subido'])
    expect(ofType('price')[0].amount).toBeCloseTo(12)
    expect(ofType('duplicate')).toHaveLength(1)
    expect(ofType('duplicate')[0]).toMatchObject({ period: 'once', amount: 24.99 })
    expect(ofType('fees')).toHaveLength(1)
    expect(ofType('fees')[0].amount).toBeGreaterThan(60)
    expect(ofType('ant')).toHaveLength(1)
    expect(ofType('overlap').map((l) => l.title)).toEqual(['2 servicios de vídeo en streaming'])
  })

  it('las suscripciones son cargos pequeños: el alquiler no', () => {
    const subs = ofType('subscription').map((l) => l.title)
    expect(subs).toEqual(expect.arrayContaining(['Netflix', 'Spotify', 'iCloud+', 'Basic-Fit', 'Disney+']))
    expect(subs).not.toContain('Alquiler piso')
    // La luz cambia cada mes: es un recibo, no una cuota que se olvida.
    expect(subs).not.toContain('Iberdrola')
    expect(subs).toContain('Digi fibra + móvil')
  })

  it('el gasto hormiga no cuenta las cuotas pequeñas', () => {
    const [ant] = ofType('ant')
    expect(ant.evidence.some((m) => m.concept === 'iCloud+')).toBe(false)
  })

  it('los ids son estables entre análisis', () => {
    const again = detectLeaks(sample.movements, sample.categories, '2026-10-18', { antMax: 5, dupDays: 2 })
    expect(again.map((l) => l.id)).toEqual(leaks.map((l) => l.id))
  })

  it('sin clasificar cuando «Otros» pesa', () => {
    const cats = [cat('o', 'expense', 'Otros'), cat('s', 'expense', 'Súper')]
    const ms = [mov('2025-06-01', -200, 's', 'Mercadona'), mov('2025-06-02', -40, 'o', '???'), mov('2025-06-10', -25, 'o', 'cosas')]
    const [l] = detectLeaks(ms, cats, '2025-06-30', { antMax: 5, dupDays: 2 }).filter((x) => x.type === 'unclassified')
    expect(l.evidence).toHaveLength(2)
    expect(l.categoryIds).toEqual(['o'])
  })

  it('resumen: por revisar, decididas y lo que se ahorraría cancelando', () => {
    const subs = ofType('subscription')
    const netflix = subs.find((l) => l.title === 'Netflix')!
    const s = summarizeLeaks(leaks, [
      { id: netflix.id, status: 'cancel', decidedAt: 0, yearlyCost: netflix.amount },
      { id: 'fees', status: 'kept', decidedAt: 0, yearlyCost: 0 },
    ])
    expect(s.decided).toHaveLength(2)
    expect(s.open).toHaveLength(leaks.length - 2)
    expect(s.cancelYearly).toBeCloseTo(13.99 * 12)
    expect(s.openOnce).toBeCloseTo(24.99)
  })

  it('sin datos no hay fugas', () => {
    expect(detectLeaks([], [], '2026-10-18', { antMax: 5, dupDays: 2 })).toEqual([])
  })
})
