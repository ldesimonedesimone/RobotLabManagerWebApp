import { useState } from 'react'
import type { ScheduleDocument, ScheduleGroup } from './model'
import {
  emptyGrid,
  newId,
  pilotColorForIndex,
  validateGroupCounts,
} from './model'
import './schedule.css'

function parseLines(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

type Props = {
  doc: ScheduleDocument
  open: boolean
  onClose: () => void
  onCreate: (g: ScheduleGroup) => void
}

export default function AddGroupModal({ doc, open, onClose, onCreate }: Props) {
  const [name, setName] = useState('New group')
  const [robots, setRobots] = useState('Robot A\nRobot B')
  const [tasks, setTasks] = useState('Break')
  const [pilots, setPilots] = useState('Pat\nAlex\nSam')
  const [err, setErr] = useState<string | null>(null)

  if (!open) return null

  function submit() {
    setErr(null)
    const robot_labels = parseLines(robots)
    const task_labels = parseLines(tasks)
    const pilotNames = parseLines(pilots)
    const g: ScheduleGroup = {
      id: newId(),
      name: name.trim() || 'Untitled group',
      robot_labels,
      task_labels,
      pilots: pilotNames.map((n, i) => ({
        id: newId(),
        name: n,
        color_hex: pilotColorForIndex(i),
      })),
      grid: [],
    }
    g.grid = emptyGrid(
      doc.day_start,
      doc.day_end,
      robot_labels.length + task_labels.length,
    )
    const v = validateGroupCounts(g)
    if (v) {
      setErr(v)
      return
    }
    onCreate(g)
    onClose()
    setName('New group')
    setErr(null)
  }

  return (
    <div className="sched-modal-overlay" role="dialog" aria-modal>
      <div className="sched-modal">
        <h3>Add group</h3>
        <p className="sched-modal-hint">
          One entry per line (or comma-separated). Robots + tasks must equal
          number of pilots.
        </p>
        <label>
          Group name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="sched-input"
          />
        </label>
        <label>
          Robot rows
          <textarea
            value={robots}
            onChange={(e) => setRobots(e.target.value)}
            rows={4}
            className="sched-textarea"
          />
        </label>
        <label>
          Task rows (Break, Monitor, …)
          <textarea
            value={tasks}
            onChange={(e) => setTasks(e.target.value)}
            rows={3}
            className="sched-textarea"
          />
        </label>
        <label>
          Pilots (names, in order)
          <textarea
            value={pilots}
            onChange={(e) => setPilots(e.target.value)}
            rows={4}
            className="sched-textarea"
          />
        </label>
        {err ? <p className="sched-error">{err}</p> : null}
        <div className="sched-modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="sched-primary" onClick={submit}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}
