import { useCallback } from 'react'
import type { ScheduleGroup } from './model'
import { newId, resourceRowLabels, timeLabels } from './model'
import EditableText from './EditableText'
import './schedule.css'

type Props = {
  dayStart: string
  dayEnd: string
  group: ScheduleGroup
  activePilotId: string | null
  eraser: boolean
  onChange: (g: ScheduleGroup) => void
  onDelete: () => void
  onCopy: (g: ScheduleGroup) => void
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
  onCopy,
  onPickPilot,
  onPickEraser,
}: Props) {
  const labels = resourceRowLabels(group)
  const times = timeLabels(dayStart, dayEnd)

  const applyPaint = useCallback(
    (timeIdx: number, rowIdx: number) => {
      const value = eraser || !activePilotId ? null : activePilotId
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

  const onCellMouseEnter =
    (t: number, r: number) => (e: React.MouseEvent) => {
      if (e.buttons !== 1) return
      applyPaint(t, r)
    }

  const renameLabel = (rowIdx: number, newLabel: string) => {
    const isRobot = rowIdx < group.robot_labels.length
    if (isRobot) {
      const next = [...group.robot_labels]
      next[rowIdx] = newLabel
      onChange({ ...group, robot_labels: next })
    } else {
      const ti = rowIdx - group.robot_labels.length
      const next = [...group.task_labels]
      next[ti] = newLabel
      onChange({ ...group, task_labels: next })
    }
  }

  const renamePilot = (pilotId: string, newName: string) => {
    onChange({
      ...group,
      pilots: group.pilots.map((p) =>
        p.id === pilotId ? { ...p, name: newName } : p,
      ),
    })
  }

  return (
    <section className="sched-group">
      <div className="sched-group-head">
        <h3>
          <EditableText
            value={group.name}
            onChange={(n) => onChange({ ...group, name: n })}
          />
        </h3>
        <div className="sched-group-actions">
          <button
            type="button"
            className="sched-secondary"
            onClick={() => {
              const idMap = new Map<string, string>()
              const pilots = group.pilots.map((p) => {
                const pid = newId()
                idMap.set(p.id, pid)
                return { ...p, id: pid }
              })
              const grid = group.grid.map((slot) =>
                slot.map((cell) => (cell ? idMap.get(cell) ?? null : null)),
              )
              onCopy({ ...group, id: newId(), name: `${group.name} (copy)`, pilots, grid })
            }}
          >
            Copy group
          </button>
          <button type="button" className="sched-danger" onClick={onDelete}>
            Delete group
          </button>
        </div>
      </div>
      <div className="sched-legend">
        <span className="sched-legend-title">Pilots</span>
        <button
          type="button"
          className={
            eraser
              ? 'sched-swatch active sched-eraser'
              : 'sched-swatch sched-eraser'
          }
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
            <EditableText
              value={p.name}
              className="sched-swatch-label"
              onChange={(n) => renamePilot(p.id, n)}
              doubleClick
            />
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
                <th className="sched-row-h">
                  <EditableText
                    value={lab}
                    onChange={(n) => renameLabel(r, n)}
                  />
                </th>
                {times.map((_, t) => {
                  const pid = group.grid[t]?.[r] ?? null
                  const pilot = pid
                    ? group.pilots.find((x) => x.id === pid)
                    : null
                  const bg = pilot?.color_hex ?? '#151c28'
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
