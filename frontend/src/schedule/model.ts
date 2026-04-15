export type SchedulePilot = {
  id: string
  name: string
  color_hex: string
}

export type ScheduleGroup = {
  id: string
  name: string
  robot_labels: string[]
  task_labels: string[]
  pilots: SchedulePilot[]
  grid: (string | null)[][]
}

export type ScheduleDocument = {
  version: number
  slot_key: string
  day_start: string
  day_end: string
  groups: ScheduleGroup[]
}

export const SCHEDULE_VERSION = 1
export const DEFAULT_DAY_START = '06:00'
export const DEFAULT_DAY_END = '16:00'

export const TIME_OPTIONS_15: string[] = (() => {
  const opts: string[] = []
  for (let m = 0; m < 24 * 60; m += 15) {
    const h = Math.floor(m / 60)
    const mm = m % 60
    opts.push(`${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`)
  }
  return opts
})()

export function parseHm(s: string): number {
  const parts = s.trim().split(':')
  if (parts.length !== 2) throw new Error(`invalid time format: "${s}"`)
  const h = Number(parts[0])
  const m = Number(parts[1])
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59)
    throw new Error(`invalid time: "${s}"`)
  return h * 60 + m
}

export function timeSlotCount(
  dayStart: string = DEFAULT_DAY_START,
  dayEnd: string = DEFAULT_DAY_END,
): number {
  const t0 = parseHm(dayStart)
  const t1 = parseHm(dayEnd)
  if (t1 <= t0) throw new Error('day end must be after day start')
  if ((t1 - t0) % 15 !== 0) throw new Error('time range must be a multiple of 15 minutes')
  return (t1 - t0) / 15
}

export function timeLabels(
  dayStart: string,
  dayEnd: string,
): string[] {
  const n = timeSlotCount(dayStart, dayEnd)
  const t0 = parseHm(dayStart)
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const m = t0 + i * 15
    const h = Math.floor(m / 60)
    const mm = m % 60
    out.push(`${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`)
  }
  return out
}

export function resourceRowLabels(g: ScheduleGroup): string[] {
  return [...g.robot_labels, ...g.task_labels]
}

export function validateGroupCounts(g: ScheduleGroup): string | null {
  const nRows = g.robot_labels.length + g.task_labels.length
  const nPilots = g.pilots.length
  if (nRows !== nPilots) {
    return `Robots (${g.robot_labels.length}) + tasks (${g.task_labels.length}) must equal pilots (${nPilots})`
  }
  return null
}

export function emptyGrid(
  dayStart: string,
  dayEnd: string,
  nRows: number,
): (string | null)[][] {
  const n = timeSlotCount(dayStart, dayEnd)
  return Array.from({ length: n }, () =>
    Array.from({ length: nRows }, () => null),
  )
}

export function resizeGrid(
  oldGrid: (string | null)[][],
  oldStart: string,
  oldEnd: string,
  newStart: string,
  newEnd: string,
  nRows: number,
): (string | null)[][] {
  const oldT0 = parseHm(oldStart)
  const newT0 = parseHm(newStart)
  const newSlots = timeSlotCount(newStart, newEnd)
  const oldSlots = timeSlotCount(oldStart, oldEnd)

  const result: (string | null)[][] = []
  for (let i = 0; i < newSlots; i++) {
    const absMinute = newT0 + i * 15
    const oldIdx = (absMinute - oldT0) / 15
    if (oldIdx >= 0 && oldIdx < oldSlots && Number.isInteger(oldIdx) && oldGrid[oldIdx]) {
      result.push(oldGrid[oldIdx].slice())
    } else {
      result.push(Array.from({ length: nRows }, () => null))
    }
  }
  return result
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

const PILOT_PALETTE = [
  '#4285F4',
  '#EA4335',
  '#FBBC04',
  '#34A853',
  '#8E24AA',
  '#FF6D01',
  '#00897B',
  '#5E35B1',
  '#FFA726',
  '#3949AB',
  '#D81B60',
  '#1B5E20',
  '#546E7A',
  '#F06292',
  '#AED581',
  '#CE93D8',
  '#4DD0E1',
  '#A1887F',
  '#90A4AE',
  '#FFD54F',
]

export function pilotColorForIndex(i: number): string {
  return PILOT_PALETTE[i % PILOT_PALETTE.length]
}

// ---------------------------------------------------------------------------
// Generated grids (on-the-fly)
// ---------------------------------------------------------------------------

export type GeneratedGrid = {
  grid: (number | null)[][]
  algorithm: string
  n_slots: number
  n_pilots: number
  n_robots: number
  n_tasks: number
}

export function applyGeneratedGrid(
  gen: GeneratedGrid,
  pilots: SchedulePilot[],
  dayStart: string,
  dayEnd: string,
  templateStartTime: string,
): (string | null)[][] {
  const nSlots = timeSlotCount(dayStart, dayEnd)
  const nRows = pilots.length
  const grid: (string | null)[][] = Array.from({ length: nSlots }, () =>
    Array.from({ length: nRows }, () => null),
  )

  const schedStart = parseHm(dayStart)
  const tplStart = parseHm(templateStartTime)

  for (let t = 0; t < nSlots; t++) {
    const absMinute = schedStart + t * 15
    const tplIdx = (absMinute - tplStart) / 15
    if (tplIdx < 0 || tplIdx >= gen.grid.length || !Number.isInteger(tplIdx))
      continue
    const tplSlot = gen.grid[tplIdx]
    for (let r = 0; r < nRows; r++) {
      const pilotIdx = tplSlot?.[r]
      if (pilotIdx != null && pilotIdx >= 0 && pilotIdx < pilots.length) {
        grid[t][r] = pilots[pilotIdx].id
      }
    }
  }

  return grid
}

// ---------------------------------------------------------------------------
// Templates (DB-stored, legacy)
// ---------------------------------------------------------------------------

export type TemplateInfo = {
  id: number
  name: string
  n_pilots: number
  n_robots: number
  n_tasks: number
  n_slots: number
}

export type TemplateDetail = TemplateInfo & {
  grid: (number | null)[][]
}

export function applyTemplate(
  tpl: TemplateDetail,
  pilots: SchedulePilot[],
  dayStart: string,
  dayEnd: string,
  templateStartTime: string,
): (string | null)[][] {
  const nSlots = timeSlotCount(dayStart, dayEnd)
  const nRows = pilots.length
  const grid: (string | null)[][] = Array.from({ length: nSlots }, () =>
    Array.from({ length: nRows }, () => null),
  )

  const schedStart = parseHm(dayStart)
  const tplStart = parseHm(templateStartTime)

  for (let t = 0; t < nSlots; t++) {
    const absMinute = schedStart + t * 15
    const tplIdx = (absMinute - tplStart) / 15
    if (tplIdx < 0 || tplIdx >= tpl.grid.length || !Number.isInteger(tplIdx))
      continue
    const tplSlot = tpl.grid[tplIdx]
    for (let r = 0; r < nRows; r++) {
      const pilotIdx = tplSlot?.[r]
      if (pilotIdx != null && pilotIdx >= 0 && pilotIdx < pilots.length) {
        grid[t][r] = pilots[pilotIdx].id
      }
    }
  }

  return grid
}
