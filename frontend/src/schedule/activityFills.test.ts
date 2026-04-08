import { describe, expect, it } from 'vitest'
import { buildActivityFillMap, ensureDistinctLabelFills } from './activityFills'

describe('buildActivityFillMap', () => {
  it('assigns hex per label', () => {
    const m = buildActivityFillMap(['A', 'B'])
    expect(m.A).toMatch(/^#[0-9A-Fa-f]{6}$/)
    expect(m.B).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })
})

describe('ensureDistinctLabelFills', () => {
  it('nudges duplicate hexes', () => {
    const out = ensureDistinctLabelFills({ a: '#4285f4', b: '#4285f4' })
    expect(out.a).not.toBe(out.b)
  })
})
