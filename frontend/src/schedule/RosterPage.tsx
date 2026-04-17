import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useEditMode } from '../EditModeContext'
import {
  addRosterOperator,
  deleteRosterOperator,
  getSchedule,
  listRoster,
  patchRosterOperator,
  type RosterOperator,
} from '../scheduleApi'
import type { ScheduleDocument } from './model'
import './schedule.css'

type ScheduleMap = Record<string, ScheduleDocument>

function pilotNamesInDoc(doc: ScheduleDocument): Set<string> {
  const names = new Set<string>()
  for (const g of doc.groups) {
    for (const p of g.pilots) names.add(p.name)
  }
  return names
}

const SHIFTS = [1, 2, 3] as const
const DAYS = ['today', 'tomorrow'] as const

export default function RosterPage() {
  const { isEditMode } = useEditMode()
  const [roster, setRoster] = useState<RosterOperator[]>([])
  const [schedules, setSchedules] = useState<ScheduleMap>({})
  const [newName, setNewName] = useState<Record<number, string>>({ 1: '', 2: '', 3: '' })
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const [ops, ...scheds] = await Promise.all([
      listRoster(),
      ...SHIFTS.flatMap((s) => DAYS.map((d) => getSchedule(s, d).catch(() => null))),
    ])
    setRoster(ops)
    const map: ScheduleMap = {}
    let i = 0
    for (const s of SHIFTS) {
      for (const d of DAYS) {
        const doc = scheds[i++]
        if (doc) map[`${s}-${d}`] = doc
      }
    }
    setSchedules(map)
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const presenceMap = useMemo(() => {
    const m: Record<string, Set<string>> = {}
    for (const [key, doc] of Object.entries(schedules)) {
      m[key] = pilotNamesInDoc(doc)
    }
    return m
  }, [schedules])

  const handleAdd = async (shift: number) => {
    const name = newName[shift]?.trim()
    if (!name) return
    try {
      const op = await addRosterOperator(name, shift)
      setRoster((prev) => [...prev, op])
      setNewName((prev) => ({ ...prev, [shift]: '' }))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to add pilot')
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Remove this pilot from the roster?')) return
    try {
      await deleteRosterOperator(id)
      setRoster((prev) => prev.filter((o) => o.id !== id))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed')
    }
  }

  const toggleAbsent = async (op: RosterOperator) => {
    try {
      const updated = await patchRosterOperator(op.id, { absent: !op.absent })
      setRoster((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed')
    }
  }

  if (loading) {
    return (
      <div className="sched-page">
        <Link to="/schedule" className="sched-home-link">← Home</Link>
        <p>Loading roster…</p>
      </div>
    )
  }

  return (
    <div className="sched-page">
      <header className="sched-editor-head">
        <Link to="/schedule" className="sched-home-link">← Home</Link>
        <h1>Pilot Roster</h1>
      </header>

      <div className="roster-shifts">
        {SHIFTS.map((shift) => {
          const ops = roster.filter((o) => o.shift === shift)
          return (
            <section key={shift} className="roster-shift-card">
              <h2 className="roster-shift-title">Shift {shift}</h2>
              <table className="roster-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th className="roster-th-center" title="Today">Today</th>
                    <th className="roster-th-center" title="Tomorrow">Tmrw</th>
                    <th className="roster-th-center">Absent</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {ops.map((op) => {
                    const inToday = presenceMap[`${shift}-today`]?.has(op.name) ?? false
                    const inTomorrow = presenceMap[`${shift}-tomorrow`]?.has(op.name) ?? false
                    return (
                      <tr key={op.id} className={op.absent ? 'roster-row roster-absent' : 'roster-row'}>
                        <td className="roster-name">{op.name}</td>
                        <td className="roster-check-cell">
                          {inToday && <span className="roster-check" title="In today's schedule">✓</span>}
                        </td>
                        <td className="roster-check-cell">
                          {inTomorrow && <span className="roster-check" title="In tomorrow's schedule">✓</span>}
                        </td>
                        <td className="roster-check-cell">
                          <input
                            type="checkbox"
                            checked={op.absent}
                            onChange={() => toggleAbsent(op)}
                            className="roster-absent-cb"
                            title="Mark absent"
                            disabled={!isEditMode}
                          />
                        </td>
                        <td>
                          {isEditMode && (
                            <button
                              type="button"
                              className="roster-remove-btn"
                              onClick={() => handleDelete(op.id)}
                              title="Remove from roster"
                            >
                              ×
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {ops.length === 0 && (
                    <tr><td colSpan={5} className="roster-empty">No pilots yet</td></tr>
                  )}
                </tbody>
              </table>
              {isEditMode && (
                <div className="roster-add-row">
                  <input
                    placeholder="New pilot name"
                    value={newName[shift] ?? ''}
                    onChange={(e) => setNewName((p) => ({ ...p, [shift]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(shift) }}
                    className="sched-input roster-add-input"
                  />
                  <button type="button" className="sched-primary roster-add-btn" onClick={() => handleAdd(shift)}>
                    Add
                  </button>
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
