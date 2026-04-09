import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ScheduleDocument } from './model'
import { parseHm, timeLabels, timeSlotCount } from './model'
import { buildActivityFillMap } from './activityFills'
import { transposeGroup } from './transpose'
import './schedule.css'

function getMexicoCityMinutes(): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(new Date())
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return h * 60 + m
}

type Props = {
  doc: ScheduleDocument
  filterKey?: string
}

export default function PilotViewPanel({ doc, filterKey }: Props) {
  const times = timeLabels(doc.day_start, doc.day_end)
  const tc = timeSlotCount(doc.day_start, doc.day_end)

  const { allRows, options } = useMemo(() => {
    const rows: {
      key: string
      groupName: string
      pilotName: string
      cells: string[]
      cellFills: string[]
    }[] = []
    const opts: { value: string; label: string }[] = [
      { value: '', label: 'All pilots' },
    ]
    for (const g of doc.groups) {
      const labels = [...g.robot_labels, ...g.task_labels]
      const fills = buildActivityFillMap(labels)
      const map = new Map(Object.entries(fills))
      const trows = transposeGroup(g, map, tc)
      for (const pr of trows) {
        const key = `${g.id}:${pr.pilotId}`
        opts.push({
          value: key,
          label: `${g.name} — ${pr.pilotName}`,
        })
        rows.push({
          key,
          groupName: g.name,
          pilotName: pr.pilotName,
          cells: pr.cells,
          cellFills: pr.cellFills,
        })
      }
    }
    return { allRows: rows, options: opts }
  }, [doc.groups, doc.day_start, doc.day_end, tc])

  const [dropdownFilter, setDropdownFilter] = useState('')

  const visibleRows = useMemo(() => {
    if (filterKey) return allRows.filter((r) => r.key === filterKey)
    if (!dropdownFilter) return allRows
    return allRows.filter((r) => r.key === dropdownFilter)
  }, [allRows, filterKey, dropdownFilter])

  // Playhead — Mexico City time
  const scrollRef = useRef<HTMLDivElement>(null)
  const [playheadLeft, setPlayheadLeft] = useState<number | null>(null)

  const measurePlayhead = useCallback(() => {
    const el = scrollRef.current
    if (!el) {
      setPlayheadLeft(null)
      return
    }

    const mxMin = getMexicoCityMinutes()
    const startMin = parseHm(doc.day_start)
    const endMin = parseHm(doc.day_end)

    if (mxMin < startMin || mxMin > endMin) {
      setPlayheadLeft(null)
      return
    }

    const ths = el.querySelectorAll<HTMLElement>('thead th')
    if (ths.length < 2) {
      setPlayheadLeft(null)
      return
    }

    const firstTime = ths[1]
    const lastTime = ths[ths.length - 1]
    const containerRect = el.getBoundingClientRect()
    const leftEdge =
      firstTime.getBoundingClientRect().left - containerRect.left + el.scrollLeft
    const rightEdge =
      lastTime.getBoundingClientRect().right - containerRect.left + el.scrollLeft

    const frac = (mxMin - startMin) / (endMin - startMin)
    setPlayheadLeft(leftEdge + frac * (rightEdge - leftEdge))
  }, [doc.day_start, doc.day_end])

  useEffect(() => {
    measurePlayhead()
    const id = setInterval(measurePlayhead, 30_000)
    window.addEventListener('resize', measurePlayhead)
    return () => {
      clearInterval(id)
      window.removeEventListener('resize', measurePlayhead)
    }
  }, [measurePlayhead])

  if (doc.groups.length === 0) {
    return (
      <p className="sched-muted">
        Add a group in Robot view to see pilot schedules.
      </p>
    )
  }

  return (
    <div className="sched-pilot-panel">
      {!filterKey && (
        <div className="sched-pilot-toolbar">
          <label>
            Focus pilot
            <select
              value={dropdownFilter}
              onChange={(e) => setDropdownFilter(e.target.value)}
              className="sched-select"
            >
              {options.map((o) => (
                <option key={o.value || 'all'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <p className="sched-muted sched-readonly-note">
        Read-only — derived from Robot view.
      </p>
      <div className="sched-scroll sched-scroll-playhead" ref={scrollRef}>
        {playheadLeft != null && (
          <div className="sched-playhead" style={{ left: playheadLeft }} />
        )}
        <table className="sched-pilot-table">
          <thead>
            <tr>
              <th className="sched-corner">Group / Pilot</th>
              {times.map((tm) => (
                <th key={tm} className="sched-time-h">
                  {tm}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.key}>
                <th className="sched-row-h">
                  {row.groupName}
                  <br />
                  <span className="sched-pilot-name">{row.pilotName}</span>
                </th>
                {row.cells.map((lab, i) => (
                  <td
                    key={i}
                    className="sched-pilot-cell"
                    style={{ background: row.cellFills[i] ?? '#ffffff' }}
                  >
                    {lab}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
