import type { ScheduleGroup } from './model'
import { resourceRowLabels } from './model'

export type PilotViewCell = {
  label: string
  fillHex: string
}

export type PilotViewRow = {
  groupId: string
  groupName: string
  pilotId: string
  pilotName: string
  cells: string[]
  cellFills: string[]
}

export function activityAtSlot(
  g: ScheduleGroup,
  pilotId: string,
  timeIndex: number,
): number | null {
  const row = g.grid[timeIndex]
  if (!row) return null
  for (let r = 0; r < row.length; r++) {
    if (row[r] === pilotId) return r
  }
  return null
}

export function transposeGroup(
  g: ScheduleGroup,
  labelToFill: Map<string, string>,
  timeCount: number,
): PilotViewRow[] {
  const labels = resourceRowLabels(g)
  const defaultFill = '#FFFFFF'
  const rows: PilotViewRow[] = []
  for (const p of g.pilots) {
    const cells: string[] = []
    const cellFills: string[] = []
    for (let t = 0; t < timeCount; t++) {
      const ri = activityAtSlot(g, p.id, t)
      let lab = ''
      let fill = defaultFill
      if (ri !== null && labels[ri] !== undefined) {
        lab = labels[ri]
        fill = labelToFill.get(lab) ?? defaultFill
      }
      cells.push(lab)
      cellFills.push(fill)
    }
    rows.push({
      groupId: g.id,
      groupName: g.name,
      pilotId: p.id,
      pilotName: p.name,
      cells,
      cellFills,
    })
  }
  return rows
}
