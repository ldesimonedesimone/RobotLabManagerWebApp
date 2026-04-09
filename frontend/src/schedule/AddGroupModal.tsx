import { useMemo, useState } from 'react'
import { getTemplateDetail } from '../scheduleApi'
import type { ScheduleDocument, ScheduleGroup, TemplateInfo } from './model'
import {
  applyTemplate,
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
  templates: TemplateInfo[]
  open: boolean
  onClose: () => void
  onCreate: (g: ScheduleGroup) => void
}

export default function AddGroupModal({
  doc,
  templates,
  open,
  onClose,
  onCreate,
}: Props) {
  const [name, setName] = useState('New group')
  const [robots, setRobots] = useState('Robot A\nRobot B')
  const [tasks, setTasks] = useState('Break')
  const [pilots, setPilots] = useState('Pat\nAlex\nSam')
  const [err, setErr] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [useTemplate, setUseTemplate] = useState(false)
  const [selectedTplId, setSelectedTplId] = useState<number | null>(null)
  const [tplStartTime, setTplStartTime] = useState(doc.day_start)

  const counts = useMemo(() => {
    const r = parseLines(robots).length
    const t = parseLines(tasks).length
    const p = parseLines(pilots).length
    return { robots: r, tasks: t, pilots: p }
  }, [robots, tasks, pilots])

  const matchingTemplates = useMemo(
    () => templates.filter((t) => t.n_pilots === counts.pilots),
    [templates, counts.pilots],
  )

  if (!open) return null

  async function submit() {
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
    const v = validateGroupCounts(g)
    if (v) {
      setErr(v)
      return
    }

    if (useTemplate && selectedTplId != null) {
      setSubmitting(true)
      try {
        const tpl = await getTemplateDetail(selectedTplId)
        g.grid = applyTemplate(tpl, g.pilots, doc.day_start, doc.day_end, tplStartTime)
      } catch (e) {
        setErr(`Template load failed: ${e instanceof Error ? e.message : e}`)
        setSubmitting(false)
        return
      }
      setSubmitting(false)
    } else {
      g.grid = emptyGrid(doc.day_start, doc.day_end, robot_labels.length + task_labels.length)
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

        <div className="sched-template-section">
          <label className="sched-checkbox-row">
            <input
              type="checkbox"
              checked={useTemplate}
              onChange={(e) => setUseTemplate(e.target.checked)}
            />
            Apply a rotation template
          </label>

          {useTemplate && (
            <div className="sched-template-opts">
              {matchingTemplates.length === 0 ? (
                <p className="sched-muted">
                  No templates for {counts.pilots} pilots. Load one via{' '}
                  <code>parse_templates.py</code>.
                </p>
              ) : (
                <>
                  <label>
                    Template
                    <select
                      className="sched-select"
                      value={selectedTplId ?? ''}
                      onChange={(e) =>
                        setSelectedTplId(
                          e.target.value ? Number(e.target.value) : null,
                        )
                      }
                    >
                      <option value="">— choose —</option>
                      {matchingTemplates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.n_robots}R {t.n_tasks}T, {t.n_slots}{' '}
                          slots)
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="sched-time-label">
                    Template starts at
                    <input
                      type="time"
                      step={900}
                      value={tplStartTime}
                      onChange={(e) => setTplStartTime(e.target.value)}
                      className="sched-time-input"
                    />
                  </label>
                  <p className="sched-muted">
                    Template slots outside the schedule window ({doc.day_start}–
                    {doc.day_end}) are clipped.
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        {err ? <p className="sched-error">{err}</p> : null}
        <div className="sched-modal-actions">
          <button type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            className="sched-primary"
            onClick={submit}
            disabled={submitting}
          >
            {submitting ? 'Loading…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
