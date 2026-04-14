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

  const { allRows, legendByKey } = useMemo(() => {
    const rows: {
      key: string
      groupName: string
      pilotName: string
      cells: string[]
      cellFills: string[]
    }[] = []
    const legend: Record<string, { label: string; fill: string }[]> = {}
    for (const g of doc.groups) {
      const labels = [...g.robot_labels, ...g.task_labels]
      const fills = buildActivityFillMap(labels)
      const map = new Map(Object.entries(fills))
      const trows = transposeGroup(g, map, tc)
      const groupLegend = labels.map((l) => ({ label: l, fill: fills[l] }))
      for (const pr of trows) {
        const key = `${g.id}:${pr.pilotId}`
        legend[key] = groupLegend
        rows.push({
          key,
          groupName: g.name,
          pilotName: pr.pilotName,
          cells: pr.cells,
          cellFills: pr.cellFills,
        })
      }
    }
    return { allRows: rows, legendByKey: legend }
  }, [doc.groups, doc.day_start, doc.day_end, tc])

  const visibleRows = useMemo(() => {
    if (filterKey) return allRows.filter((r) => r.key === filterKey)
    return allRows
  }, [allRows, filterKey])

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

    const slotsFrac = (mxMin - startMin) / 15
    const slotIdx = Math.floor(slotsFrac)
    const intraFrac = slotsFrac - slotIdx

    const ths = el.querySelectorAll<HTMLElement>('thead th')
    const cell = ths[slotIdx + 1]
    if (!cell) {
      setPlayheadLeft(null)
      return
    }

    const containerRect = el.getBoundingClientRect()
    const cellRect = cell.getBoundingClientRect()
    setPlayheadLeft(
      cellRect.left - containerRect.left + el.scrollLeft + intraFrac * cellRect.width,
    )
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
      <div className="sched-scroll sched-scroll-playhead" ref={scrollRef}>
        {playheadLeft != null && (
          <div className="sched-playhead" style={{ left: playheadLeft }} />
        )}
        <table
          className="sched-pilot-table"
          style={{ width: `calc(8rem + ${times.length} * 3.75rem)` }}
        >
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
                    style={{ background: row.cellFills[i] ?? '#151c28' }}
                  >
                    {lab}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filterKey && legendByKey[filterKey] && (
        <div className="sched-legend">
          {legendByKey[filterKey].map((item) => (
            <span key={item.label} className="sched-legend-item">
              <span
                className="sched-legend-swatch"
                style={{ background: item.fill }}
              />
              {item.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
