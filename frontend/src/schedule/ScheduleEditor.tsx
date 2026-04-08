import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getSchedule, putSchedule } from '../scheduleApi'
import type { ScheduleDocument, ScheduleGroup } from './model'
import { SCHEDULE_VERSION } from './model'
import AddGroupModal from './AddGroupModal'
import GroupBlock from './GroupBlock'
import PilotViewPanel from './PilotViewPanel'
import './schedule.css'

type Brush = { pilotId: string | null; eraser: boolean }

export default function ScheduleEditor() {
  const { shift: shiftStr, day: dayStr } = useParams<{
    shift: string
    day: string
  }>()
  const shift = Number(shiftStr)
  const day = dayStr === 'tomorrow' ? 'tomorrow' : 'today'

  const [doc, setDoc] = useState<ScheduleDocument | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle')
  const [modalOpen, setModalOpen] = useState(false)
  const [brushes, setBrushes] = useState<Record<string, Brush>>({})

  const skipFirstSave = useRef(true)

  useEffect(() => {
    if (shiftStr !== '1' && shiftStr !== '2' && shiftStr !== '3') {
      setErr('Invalid shift')
      return
    }
    if (day !== 'today' && day !== 'tomorrow') {
      setErr('Invalid day')
      return
    }
    setErr(null)
    getSchedule(shift, day)
      .then((d) => {
        setErr(null)
        setDoc({
          ...d,
          version: d.version ?? SCHEDULE_VERSION,
        })
        skipFirstSave.current = true
      })
      .catch((e: Error) => setErr(e.message))
  }, [shift, day, shiftStr, dayStr])

  useEffect(() => {
    if (!doc) return
    if (skipFirstSave.current) {
      skipFirstSave.current = false
      return
    }
    const t = window.setTimeout(() => {
      setSaveState('saving')
      putSchedule(shift, day, doc)
        .then(() => {
          setSaveState('saved')
          window.setTimeout(() => setSaveState('idle'), 2000)
        })
        .catch(() => setSaveState('error'))
    }, 450)
    return () => window.clearTimeout(t)
  }, [doc, shift, day])

  const updateGroup = useCallback((id: string, g: ScheduleGroup) => {
    setDoc((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        groups: prev.groups.map((x) => (x.id === id ? g : x)),
      }
    })
  }, [])

  const removeGroup = useCallback((id: string) => {
    setDoc((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        groups: prev.groups.filter((x) => x.id !== id),
      }
    })
    setBrushes((b) => {
      const next = { ...b }
      delete next[id]
      return next
    })
  }, [])

  const addGroup = useCallback((g: ScheduleGroup) => {
    setDoc((prev) => (prev ? { ...prev, groups: [...prev.groups, g] } : prev))
  }, [])

  if (err && !doc) {
    return (
      <div className="sched-page">
        <Link to="/schedule">← Home</Link>
        <p className="sched-error">{err}</p>
      </div>
    )
  }

  if (!doc) {
    return (
      <div className="sched-page">
        <Link to="/schedule">← Home</Link>
        <p>Loading…</p>
      </div>
    )
  }

  return (
    <div className="sched-page sched-editor">
      <header className="sched-editor-head">
        <Link to="/schedule" className="sched-home-link">
          ← Home
        </Link>
        <h1>
          Shift {shift} — {day === 'today' ? 'Today' : 'Tomorrow'}
        </h1>
        <span className="sched-save">
          {saveState === 'saving' && 'Saving…'}
          {saveState === 'saved' && 'Saved'}
          {saveState === 'error' && 'Save failed'}
        </span>
      </header>

      <div className="sched-editor-grid">
        <section className="sched-section sched-robot-section">
          <h2>Robot view</h2>
          <button
            type="button"
            className="sched-primary"
            onClick={() => setModalOpen(true)}
          >
            Add group
          </button>
          {doc.groups.map((g) => (
            <GroupBlock
              key={g.id}
              dayStart={doc.day_start}
              dayEnd={doc.day_end}
              group={g}
              activePilotId={brushes[g.id]?.pilotId ?? null}
              eraser={brushes[g.id]?.eraser ?? false}
              onChange={(ng) => updateGroup(g.id, ng)}
              onDelete={() => removeGroup(g.id)}
              onPickPilot={(id) =>
                setBrushes((s) => ({
                  ...s,
                  [g.id]: { pilotId: id, eraser: false },
                }))
              }
              onPickEraser={() =>
                setBrushes((s) => ({
                  ...s,
                  [g.id]: { pilotId: null, eraser: true },
                }))
              }
            />
          ))}
        </section>

        <section className="sched-section">
          <h2>Pilot view</h2>
          <PilotViewPanel doc={doc} />
        </section>
      </div>

      <AddGroupModal
        doc={doc}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreate={addGroup}
      />
    </div>
  )
}
