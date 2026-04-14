import { useEffect, useMemo, useState } from 'react'
import { getTemplateDetail, type RosterOperator } from '../scheduleApi'
import type { ScheduleDocument, ScheduleGroup, TemplateInfo } from './model'
import {
  TIME_OPTIONS_15,
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
  rosterOperators: RosterOperator[]
  todayPilots: Set<string>
  tomorrowPilots: Set<string>
  open: boolean
  onClose: () => void
  onCreate: (g: ScheduleGroup) => void
}

export default function AddGroupModal({
  doc,
  templates,
  rosterOperators,
  todayPilots,
  tomorrowPilots,
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

  const [useRoster, setUseRoster] = useState(rosterOperators.length > 0)
  const [selectedRosterIds, setSelectedRosterIds] = useState<Set<number>>(new Set())
  const [useTemplate, setUseTemplate] = useState(false)
  const [selectedTplId, setSelectedTplId] = useState<number | null>(null)
  const [tplStartTime, setTplStartTime] = useState(doc.day_start)

  useEffect(() => {
    setTplStartTime(doc.day_start)
  }, [doc.day_start])

  const counts = useMemo(() => {
    const r = parseLines(robots).length
    const t = parseLines(tasks).length
    const p = useRoster ? selectedRosterIds.size : parseLines(pilots).length
    return { robots: r, tasks: t, pilots: p }
  }, [robots, tasks, pilots, useRoster, selectedRosterIds])

  const matchingTemplates = useMemo(
    () => templates.filter((t) => t.n_pilots === counts.pilots),
    [templates, counts.pilots],
  )

  function resetForm() {
    setName('New group')
    setRobots('Robot A\nRobot B')
    setTasks('Break')
    setPilots('Pat\nAlex\nSam')
    setErr(null)
    setUseRoster(rosterOperators.length > 0)
    setSelectedRosterIds(new Set())
    setUseTemplate(false)
    setSelectedTplId(null)
    setTplStartTime(doc.day_start)
  }

  if (!open) return null

  async function submit() {
    setErr(null)
    const robot_labels = parseLines(robots)
    const task_labels = parseLines(tasks)
    const pilotNames = useRoster
      ? rosterOperators.filter((o) => selectedRosterIds.has(o.id)).map((o) => o.name)
      : parseLines(pilots)
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
    resetForm()
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
        <div className="sched-pilots-section">
          <div className="sched-pilots-toggle">
            <span className="sched-pilots-label">Pilots</span>
            {rosterOperators.length > 0 && (
              <button
                type="button"
                className="sched-toggle-link"
                onClick={() => setUseRoster(!useRoster)}
              >
                {useRoster ? 'Manual entry instead' : 'Pick from roster'}
              </button>
            )}
          </div>
          {useRoster ? (
            <div className="sched-roster-pick">
              {rosterOperators.filter((o) => !o.absent).length === 0 ? (
                <p className="sched-muted">No available operators on roster for this shift.</p>
              ) : (
                rosterOperators.filter((o) => !o.absent).map((op) => (
                  <label key={op.id} className="sched-checkbox-row sched-roster-cb">
                    <input
                      type="checkbox"
                      checked={selectedRosterIds.has(op.id)}
                      onChange={() => {
                        setSelectedRosterIds((prev) => {
                          const next = new Set(prev)
                          if (next.has(op.id)) next.delete(op.id)
                          else next.add(op.id)
                          return next
                        })
                      }}
                    />
                    <span className="sched-roster-name">{op.name}</span>
                    {todayPilots.has(op.name) && (
                      <span className="sched-roster-badge" title="In today's schedule">T</span>
                    )}
                    {tomorrowPilots.has(op.name) && (
                      <span className="sched-roster-badge sched-roster-badge-tmrw" title="In tomorrow's schedule">Tm</span>
                    )}
                  </label>
                ))
              )}
              <p className="sched-muted" style={{ marginTop: '0.25rem' }}>
                {selectedRosterIds.size} selected
              </p>
            </div>
          ) : (
            <label>
              Names (one per line or comma-separated)
              <textarea
                value={pilots}
                onChange={(e) => setPilots(e.target.value)}
                rows={4}
                className="sched-textarea"
              />
            </label>
          )}
        </div>

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
                    <select
                      value={tplStartTime}
                      onChange={(e) => setTplStartTime(e.target.value)}
                      className="sched-time-input"
                    >
                      {TIME_OPTIONS_15.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
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
          <button type="button" onClick={() => { onClose(); resetForm() }} disabled={submitting}>
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
