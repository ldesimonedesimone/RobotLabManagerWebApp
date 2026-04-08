import { describe, expect, it } from 'vitest'
import { buildActivityFillMap } from './activityFills'
import { transposeGroup } from './transpose'
import type { ScheduleGroup } from './model'

describe('transposeGroup', () => {
  it('maps pilot to resource label per time slot', () => {
    const p1 = 'pilot-1'
    const p2 = 'pilot-2'
    const g: ScheduleGroup = {
      id: 'g1',
      name: 'Test',
      robot_labels: ['R1'],
      task_labels: ['Break'],
      pilots: [
        { id: p1, name: 'Alice', color_hex: '#4285F4' },
        { id: p2, name: 'Bob', color_hex: '#EA4335' },
      ],
      grid: [
        [p1, p2],
        [p2, p1],
      ],
    }
    const labels = ['R1', 'Break']
    const fills = buildActivityFillMap(labels)
    const map = new Map(Object.entries(fills))
    const rows = transposeGroup(g, map, 2)
    expect(rows).toHaveLength(2)
    expect(rows[0].pilotName).toBe('Alice')
    expect(rows[0].cells).toEqual(['R1', 'Break'])
    expect(rows[1].pilotName).toBe('Bob')
    expect(rows[1].cells).toEqual(['Break', 'R1'])
  })
})
