import { describe, expect, it } from 'vitest'
import {
  timeSlotCount,
  validateGroupCounts,
  type ScheduleGroup,
} from './model'

describe('timeSlotCount', () => {
  it('counts 15m slots from 06:00 to 16:00', () => {
    expect(timeSlotCount('06:00', '16:00')).toBe(40)
  })
})

describe('validateGroupCounts', () => {
  it('returns null when robots + tasks === pilots', () => {
    const g: ScheduleGroup = {
      id: 'g1',
      name: 'G',
      robot_labels: ['A', 'B'],
      task_labels: ['Break'],
      pilots: [
        { id: 'p1', name: 'P1', color_hex: '#4285F4' },
        { id: 'p2', name: 'P2', color_hex: '#EA4335' },
        { id: 'p3', name: 'P3', color_hex: '#FBBC04' },
      ],
      grid: [],
    }
    expect(validateGroupCounts(g)).toBeNull()
  })

  it('returns message when counts mismatch', () => {
    const g: ScheduleGroup = {
      id: 'g1',
      name: 'G',
      robot_labels: ['A'],
      task_labels: [],
      pilots: [
        { id: 'p1', name: 'P1', color_hex: '#4285F4' },
        { id: 'p2', name: 'P2', color_hex: '#EA4335' },
      ],
      grid: [],
    }
    expect(validateGroupCounts(g)).toContain('must equal')
  })
})
