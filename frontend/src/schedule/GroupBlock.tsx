import { useCallback } from 'react'
import type { ScheduleGroup } from './model'
import { resourceRowLabels, timeLabels } from './model'
import './schedule.css'

type Props = {
  dayStart: string
  dayEnd: string
  group: ScheduleGroup
  activePilotId: string | null
  eraser: boolean
  onChange: (g: ScheduleGroup) => void
  onDelete: () => void
  onPickPilot: (id: string) => void
  onPickEraser: () => void
}

export default function GroupBlock({
  dayStart,
  dayEnd,
  group,
  activePilotId,
  eraser,
  onChange,
  onDelete,
  onPickPilot,
  onPickEraser,
}: Props) {
  const labels = resourceRowLabels(group)
  const times = timeLabels(dayStart, dayEnd)

  const applyPaint = useCallback(
    (timeIdx: number, rowIdx: number) => {
      const value =
        eraser || !activePilotId ? null : activePilotId
      const next = group.grid.map((row) => row.slice())
      if (!next[timeIdx]) return
      const copy = [...next[timeIdx]]
      copy[rowIdx] = value
      next[timeIdx] = copy
      onChange({ ...group, grid: next })
    },
    [group, activePilotId, eraser, onChange],
  )

  const onCellMouseDown = (t: number, r: number) => (e: React.MouseEvent) => {
    e.preventDefault()
    if (e.button !== 0) return
    applyPaint(t, r)
  }

  const onCellMouseEnter = (t: number, r: number) => (e: React.MouseEvent) => {
    if (e.buttons !== 1) return
    applyPaint(t, r)
  }

  return (
    <section className="sched-group">
      <div className="sched-group-head">
        <h3>{group.name}</h3>
        <button type="button" className="sched-danger" onClick={onDelete}>
          Delete group
        </button>
      </div>
      <div className="sched-legend">
        <span className="sched-legend-title">Pilots</span>
        <button
          type="button"
          className={eraser ? 'sched-swatch active sched-eraser' : 'sched-swatch sched-eraser'}
          onClick={onPickEraser}
          title="Eraser"
        >
          Clear
        </button>
        {group.pilots.map((p) => (
          <button
            key={p.id}
            type="button"
            className={
              activePilotId === p.id && !eraser
                ? 'sched-swatch active'
                : 'sched-swatch'
            }
            style={{ background: p.color_hex }}
            title={p.name}
            onClick={() => onPickPilot(p.id)}
          >
            <span className="sched-swatch-label">{p.name}</span>
          </button>
        ))}
      </div>
      <div className="sched-scroll">
        <table className="sched-grid-table">
          <thead>
            <tr>
              <th className="sched-corner" />
              {times.map((tm) => (
                <th key={tm} className="sched-time-h">
                  {tm}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {labels.map((lab, r) => (
              <tr key={r}>
                <th className="sched-row-h">{lab}</th>
                {times.map((_, t) => {
                  const pid = group.grid[t]?.[r] ?? null
                  const pilot = pid
                    ? group.pilots.find((x) => x.id === pid)
                    : null
                  const bg = pilot?.color_hex ?? '#ffffff'
                  return (
                    <td
                      key={t}
                      className="sched-cell"
                      style={{ background: bg }}
                      onMouseDown={onCellMouseDown(t, r)}
                      onMouseEnter={onCellMouseEnter(t, r)}
                    />
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
