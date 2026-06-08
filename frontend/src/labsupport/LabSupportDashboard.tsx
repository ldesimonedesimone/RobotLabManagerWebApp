import { useMemo, useState } from 'react'
import { LAB_SUPPORT_DATA } from './labSupportData'
import './labsupport.css'

type FaultType = { key: string; label: string }

type Series = {
  lab: string
  host: string
  color: string
  note: string | null
  countsByType: Record<string, number[]>
  default: boolean
}

type Card = {
  lab: string
  host: string
  color: string
  note: string | null
  default: boolean
  runHours: number
  faultByType: Record<string, [number, number]>
}

type Utilization = {
  tzLabel: string
  days: string[]
  defaultStartHour: number
  defaultEndHour: number
  defaultSpanStart: string
  defaultSpanEnd: string
  buckets: Record<string, Record<string, Record<string, number[]>>>
  faultBuckets: Record<string, Record<string, Record<string, Record<string, number>>>>
}

type LabSupportData = {
  titleRange: string
  defaultHosts: string[]
  faultTypes: FaultType[]
  subtitle: string
  footer: string
  generatedAt: string
  yAxisLabel: string
  weeks: string[]
  maxY: number
  tickStep: number
  series: Series[]
  cards: Card[]
  utilization: Utilization
}

const DATA = LAB_SUPPORT_DATA as unknown as LabSupportData
const STORAGE_KEY = 'labSupport.selectedHosts'

const W = 720
const H = 360
const ML = 42
const MR = 16
const MT = 16
const MB = 34
const PLOT_W = W - ML - MR
const PLOT_H = H - MT - MB

const GRID = 'rgba(148, 163, 184, 0.14)'
const AXIS = 'rgba(148, 163, 184, 0.45)'
const TXT = '#94a3b8'

function axisScale(vals: number[]): { maxY: number; tickStep: number } {
  let maxY = vals.length ? Math.max(...vals) : 1
  if (maxY < 4) maxY = 4
  const tickStep = maxY <= 6 ? 1 : maxY <= 12 ? 2 : maxY <= 30 ? 5 : 10
  maxY = Math.ceil(maxY / tickStep) * tickStep
  return { maxY, tickStep }
}

const HOUR_LABELS = Array.from({ length: 25 }, (_, h) => `${String(h).padStart(2, '0')}:00`)

function dayOfWeek(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).getDay()
}

function fmtDayShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtHrs(seconds: number): string {
  return `${(seconds / 3600).toFixed(1)}h`
}

function fmtTTR(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  const h = Math.floor(s / 3600)
  const m = Math.round((s - h * 3600) / 60)
  return m ? `${h}h ${m}m` : `${h}h`
}

function sumCounts(countsByType: Record<string, number[]>, faults: Set<string>, n: number): number[] {
  const out = new Array(n).fill(0)
  for (const t of faults) {
    const arr = countsByType[t]
    if (arr) for (let i = 0; i < n; i += 1) out[i] += arr[i] ?? 0
  }
  return out
}

function loadSet(key: string, fallback: string[]): Set<string> {
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const arr = JSON.parse(raw) as string[]
      if (Array.isArray(arr)) return new Set(arr)
    }
  } catch {
    /* fall through to default */
  }
  return new Set(fallback)
}

const FAULT_STORAGE_KEY = 'labSupport.selectedFaults'

type ChartSeries = { host: string; color: string; counts: number[] }

function FaultChart({
  series,
  weeks,
  maxY,
  tickStep,
  yAxisLabel,
}: {
  series: ChartSeries[]
  weeks: string[]
  maxY: number
  tickStep: number
  yAxisLabel: string
}) {
  const n = weeks.length
  const xAt = (i: number) => ML + (i / Math.max(n - 1, 1)) * PLOT_W
  const yAt = (v: number) => MT + PLOT_H - (v / maxY) * PLOT_H

  const ticks: number[] = []
  for (let t = 0; t <= maxY; t += tickStep) ticks.push(t)

  return (
    <svg className="ls-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Weekly hardware faults over 90 seconds by robot">
      <text
        x={12}
        y={MT + PLOT_H / 2}
        textAnchor="middle"
        fontSize={11}
        fill={TXT}
        transform={`rotate(-90 12 ${MT + PLOT_H / 2})`}
      >
        {yAxisLabel}
      </text>

      {ticks.map((t) => (
        <g key={t}>
          <line x1={ML} y1={yAt(t)} x2={ML + PLOT_W} y2={yAt(t)} stroke={GRID} strokeWidth={1} />
          <text x={ML - 8} y={yAt(t) + 4} textAnchor="end" fontSize={11} fill={TXT}>
            {t}
          </text>
        </g>
      ))}

      <line x1={ML} y1={MT} x2={ML} y2={MT + PLOT_H} stroke={AXIS} strokeWidth={0.8} />
      <line x1={ML} y1={MT + PLOT_H} x2={ML + PLOT_W} y2={MT + PLOT_H} stroke={AXIS} strokeWidth={0.8} />

      {weeks.map((wk, i) => (
        <text
          key={wk}
          x={xAt(i)}
          y={MT + PLOT_H + 18}
          textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
          fontSize={11}
          fill={TXT}
        >
          {wk}
        </text>
      ))}

      {series.map((s) => (
        <polyline
          key={`line-${s.host}`}
          points={s.counts.map((v, i) => `${xAt(i)},${yAt(v)}`).join(' ')}
          fill="none"
          stroke={s.color}
          strokeWidth={2.2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}

      {series.map((s) =>
        s.counts.map((v, i) => (
          <circle
            key={`dot-${s.host}-${i}`}
            cx={xAt(i)}
            cy={yAt(v)}
            r={3.4}
            fill={s.color}
            stroke="#111827"
            strokeWidth={1.2}
          />
        )),
      )}
    </svg>
  )
}

export default function LabSupportDashboard() {
  const data = DATA
  const nWeeks = data.weeks.length
  const allFaultKeys = useMemo(() => data.faultTypes.map((f) => f.key), [data.faultTypes])
  const faultLabel = useMemo(
    () => new Map(data.faultTypes.map((f) => [f.key, f.label])),
    [data.faultTypes],
  )

  const [selected, setSelected] = useState<Set<string>>(() => loadSet(STORAGE_KEY, DATA.defaultHosts))
  const [selectedFaults, setSelectedFaults] = useState<Set<string>>(() =>
    loadSet(FAULT_STORAGE_KEY, DATA.faultTypes.map((f) => f.key)),
  )
  const [pickerOpen, setPickerOpen] = useState(false)

  const persist = (next: Set<string>) => {
    setSelected(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
    } catch {
      /* ignore quota/availability errors */
    }
  }

  const persistFaults = (next: Set<string>) => {
    setSelectedFaults(next)
    try {
      localStorage.setItem(FAULT_STORAGE_KEY, JSON.stringify([...next]))
    } catch {
      /* ignore quota/availability errors */
    }
  }

  const toggle = (host: string) => {
    const next = new Set(selected)
    if (next.has(host)) next.delete(host)
    else next.add(host)
    persist(next)
  }

  const toggleFault = (key: string) => {
    const next = new Set(selectedFaults)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    persistFaults(next)
  }

  const selectAll = () => persist(new Set(data.series.map((s) => s.host)))
  const clearAll = () => persist(new Set())
  const resetLabs = () => persist(new Set(data.defaultHosts))

  const shownSeries = useMemo(
    () =>
      data.series
        .filter((s) => selected.has(s.host))
        .map((s) => ({ ...s, counts: sumCounts(s.countsByType, selectedFaults, nWeeks) })),
    [data.series, selected, selectedFaults, nWeeks],
  )
  const countsByHost = useMemo(
    () => new Map(data.series.map((s) => [s.host, s.countsByType])),
    [data.series],
  )
  const shownCards = useMemo(
    () =>
      data.cards
        .filter((c) => selected.has(c.host))
        .map((c) => {
          const counts = sumCounts(countsByHost.get(c.host) ?? {}, selectedFaults, nWeeks)
          const slowCount = counts[nWeeks - 1] ?? 0
          let top: { label: string; ttr: number; count: number } | null = null
          for (const t of selectedFaults) {
            const e = c.faultByType[t]
            if (e && (top === null || e[0] > top.ttr)) {
              top = { label: faultLabel.get(t) ?? t, ttr: e[0], count: e[1] }
            }
          }
          return { ...c, slowCount, top }
        }),
    [data.cards, countsByHost, selected, selectedFaults, nWeeks, faultLabel],
  )
  const { maxY, tickStep } = useMemo(
    () => axisScale(shownSeries.flatMap((s) => s.counts)),
    [shownSeries],
  )

  const labBots = data.series.filter((s) => s.default)
  const otherBots = data.series.filter((s) => !s.default)

  return (
    <div className="ls-page">
      <header className="ls-head">
        <h1>
          Lab Support Summary <span className="ls-range">{data.titleRange}</span>
        </h1>
        <p className="ls-subtitle">{data.subtitle}</p>
      </header>

      <div className="ls-toolbar">
        <button
          type="button"
          className={`ls-picker-toggle${pickerOpen ? ' open' : ''}`}
          onClick={() => setPickerOpen((v) => !v)}
        >
          Choose robots {pickerOpen ? '▴' : '▾'}
        </button>
        <span className="ls-count">
          Showing {shownSeries.length} of {data.series.length} robots
        </span>
        <div className="ls-toolbar-actions">
          <button type="button" className="ls-mini-btn" onClick={resetLabs}>
            Labs only
          </button>
          <button type="button" className="ls-mini-btn" onClick={selectAll}>
            Select all
          </button>
          <button type="button" className="ls-mini-btn" onClick={clearAll}>
            Clear
          </button>
        </div>
      </div>

      {pickerOpen ? (
        <div className="ls-picker">
          <div className="ls-picker-group">
            <div className="ls-picker-label">Lab robots</div>
            <div className="ls-chip-grid">
              {labBots.map((s) => (
                <BotChip key={s.host} s={s} on={selected.has(s.host)} onToggle={toggle} />
              ))}
            </div>
          </div>
          <div className="ls-picker-group">
            <div className="ls-picker-label">Rest of fleet</div>
            <div className="ls-chip-grid">
              {otherBots.map((s) => (
                <BotChip key={s.host} s={s} on={selected.has(s.host)} onToggle={toggle} />
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="ls-fault-bar">
        <span className="ls-fault-bar-label">Fault types</span>
        <div className="ls-fault-chips">
          {data.faultTypes.map((f) => (
            <button
              type="button"
              key={f.key}
              className={`ls-fault-chip${selectedFaults.has(f.key) ? ' on' : ''}`}
              onClick={() => toggleFault(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="ls-toolbar-actions">
          <button type="button" className="ls-mini-btn" onClick={() => persistFaults(new Set(allFaultKeys))}>
            All
          </button>
          <button type="button" className="ls-mini-btn" onClick={() => persistFaults(new Set())}>
            None
          </button>
        </div>
      </div>

      <div className="ls-layout">
        <section className="ls-panel ls-chart-panel">
          {shownSeries.length === 0 ? (
            <div className="ls-empty-chart">No robots selected — use “Choose robots”.</div>
          ) : (
            <>
              <FaultChart
                series={shownSeries}
                weeks={data.weeks}
                maxY={maxY}
                tickStep={tickStep}
                yAxisLabel={data.yAxisLabel}
              />
              <div className="ls-legend">
                {shownSeries.map((s) => (
                  <span className="ls-legend-item" key={`leg-${s.host}`} title={s.note ?? undefined}>
                    <span className="ls-legend-dot" style={{ background: s.color }} />
                    {s.lab} <span className="ls-legend-host">({s.host})</span>
                    {s.note ? <span className="ls-legend-star">*</span> : null}
                  </span>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="ls-cards">
          <div className="ls-cards-header">{data.titleRange} · per-robot summary</div>
          {shownCards.length === 0 ? (
            <div className="ls-empty">No robots selected.</div>
          ) : (
            shownCards.map((c) => (
              <article
                className={`ls-card${c.note ? ' removed' : ''}`}
                key={c.host}
                style={{ borderLeftColor: c.color }}
              >
                <div className="ls-card-head">
                  <div className="ls-card-title">
                    <div className="ls-card-lab">{c.lab}</div>
                    <div className="ls-card-slug">{c.host}</div>
                  </div>
                  <div className="ls-card-badges">
                    {c.note ? <span className="ls-badge note">{c.note}</span> : null}
                    <span className={`ls-badge slow${c.slowCount >= 20 ? ' high' : ''}`}>
                      {c.slowCount} &gt;90s faults
                    </span>
                    <span className="ls-badge runtime">{c.runHours.toFixed(1)}h run time</span>
                  </div>
                </div>
                <div className="ls-card-body">
                  {c.top ? (
                    <div className="ls-top-fault">
                      <span className="ls-top-dot" style={{ background: c.color }} />
                      <span className="ls-top-type">{c.top.label}</span>
                      <span className="ls-top-ttr">
                        {fmtTTR(c.top.ttr)} TTR · ×{c.top.count}
                      </span>
                    </div>
                  ) : (
                    <div className="ls-empty">No cleared faults this week</div>
                  )}
                </div>
              </article>
            ))
          )}
        </section>
      </div>

      <UtilizationPanel
        util={data.utilization}
        series={data.series}
        selected={selected}
        selectedFaults={selectedFaults}
      />

      <footer className="ls-footer">
        {data.footer} · Snapshot generated {data.generatedAt}
      </footer>
    </div>
  )
}

type Breakdown = {
  host: string
  lab: string
  color: string
  active: number
  runningOther: number
  faultDown: number
  idleDown: number
  windowSecs: number
  util: number
}

function UtilizationPanel({
  util,
  series,
  selected,
  selectedFaults,
}: {
  util: Utilization
  series: Series[]
  selected: Set<string>
  selectedFaults: Set<string>
}) {
  const days = util.days
  const [startHour, setStartHour] = useState(util.defaultStartHour)
  const [endHour, setEndHour] = useState(util.defaultEndHour)
  const [spanStart, setSpanStart] = useState(
    days.includes(util.defaultSpanStart) ? util.defaultSpanStart : days[0],
  )
  const [spanEnd, setSpanEnd] = useState(
    days.includes(util.defaultSpanEnd) ? util.defaultSpanEnd : days[days.length - 1],
  )
  const [weekdaysOnly, setWeekdaysOnly] = useState(true)

  const lo = spanStart <= spanEnd ? spanStart : spanEnd
  const hi = spanStart <= spanEnd ? spanEnd : spanStart

  const activeDays = useMemo(
    () =>
      days.filter((d) => d >= lo && d <= hi && (!weekdaysOnly || (dayOfWeek(d) >= 1 && dayOfWeek(d) <= 5))),
    [days, lo, hi, weekdaysOnly],
  )

  const hoursPerDay = Math.max(0, endHour - startHour)
  const windowSecs = activeDays.length * hoursPerDay * 3600

  const lookup = useMemo(() => new Map(series.map((s) => [s.host, s])), [series])

  const rows = useMemo<Breakdown[]>(() => {
    const out: Breakdown[] = []
    for (const host of selected) {
      const meta = lookup.get(host)
      if (!meta) continue
      const byDay = util.buckets[host] ?? {}
      const faultByDay = util.faultBuckets[host] ?? {}
      let active = 0
      let running = 0
      let fd = 0
      for (const d of activeDays) {
        const byHour = byDay[d]
        const faultHour = faultByDay[d]
        for (let h = startHour; h < endHour; h += 1) {
          const cell = byHour?.[String(h)]
          if (cell) {
            active += cell[0]
            running += cell[1]
          }
          const fcell = faultHour?.[String(h)]
          if (fcell) {
            for (const t of selectedFaults) fd += fcell[t] ?? 0
          }
        }
      }
      const notRunning = Math.max(0, windowSecs - running)
      const faultDown = Math.min(fd, notRunning)
      const idleDown = Math.max(0, notRunning - faultDown)
      const runningOther = Math.max(0, running - active)
      out.push({
        host,
        lab: meta.lab,
        color: meta.color,
        active,
        runningOther,
        faultDown,
        idleDown,
        windowSecs,
        util: windowSecs > 0 ? (active / windowSecs) * 100 : 0,
      })
    }
    out.sort((a, b) => b.util - a.util)
    return out
  }, [selected, selectedFaults, lookup, util.buckets, util.faultBuckets, activeDays, startHour, endHour, windowSecs])

  const fleetUtil =
    rows.length > 0 && windowSecs > 0
      ? (rows.reduce((s, r) => s + r.active, 0) / (rows.length * windowSecs)) * 100
      : 0

  return (
    <section className="ls-util">
      <div className="ls-util-head">
        <h2>Robot utilization</h2>
        <p className="ls-util-sub">
          Active control time (teleop + autonomous policy) ÷ daily window. Interventions and
          idle-on time are excluded from the numerator. “Down — hardware fault” reflects the
          fault types selected above.
        </p>
      </div>

      <div className="ls-util-controls">
        <label className="ls-ctl">
          <span>Daily window ({util.tzLabel})</span>
          <span className="ls-ctl-row">
            <select value={startHour} onChange={(e) => setStartHour(Number(e.target.value))}>
              {HOUR_LABELS.slice(0, 24).map((l, h) => (
                <option key={h} value={h}>
                  {l}
                </option>
              ))}
            </select>
            <span className="ls-ctl-sep">→</span>
            <select value={endHour} onChange={(e) => setEndHour(Number(e.target.value))}>
              {HOUR_LABELS.map((l, h) => (
                <option key={h} value={h} disabled={h <= startHour}>
                  {l}
                </option>
              ))}
            </select>
          </span>
        </label>

        <label className="ls-ctl">
          <span>Date span</span>
          <span className="ls-ctl-row">
            <select value={spanStart} onChange={(e) => setSpanStart(e.target.value)}>
              {days.map((d) => (
                <option key={d} value={d}>
                  {fmtDayShort(d)}
                </option>
              ))}
            </select>
            <span className="ls-ctl-sep">→</span>
            <select value={spanEnd} onChange={(e) => setSpanEnd(e.target.value)}>
              {days.map((d) => (
                <option key={d} value={d}>
                  {fmtDayShort(d)}
                </option>
              ))}
            </select>
          </span>
        </label>

        <label className="ls-ctl ls-ctl-check">
          <input
            type="checkbox"
            checked={weekdaysOnly}
            onChange={(e) => setWeekdaysOnly(e.target.checked)}
          />
          <span>Weekdays only</span>
        </label>

        <div className="ls-util-summary">
          <div className="ls-util-big">{fleetUtil.toFixed(0)}%</div>
          <div className="ls-util-small">
            avg over {rows.length} robot{rows.length === 1 ? '' : 's'} · {activeDays.length} day
            {activeDays.length === 1 ? '' : 's'} · {hoursPerDay}h/day
          </div>
        </div>
      </div>

      <div className="ls-util-legend">
        <span><i style={{ background: '#22c55e' }} />Active control (teleop + autonomous)</span>
        <span><i style={{ background: '#64748b' }} />Intervention / idle-on</span>
        <span><i style={{ background: '#ef4444' }} />Down — hardware fault</span>
        <span><i style={{ background: '#f59e0b' }} />Down — idle, no fault (pilot)</span>
      </div>

      {rows.length === 0 || windowSecs === 0 ? (
        <div className="ls-empty">
          {windowSecs === 0 ? 'Empty window — widen the hours or date span.' : 'No robots selected.'}
        </div>
      ) : (
        <div className="ls-util-bars">
          {rows.map((r) => {
            const pct = (v: number) => (r.windowSecs > 0 ? (v / r.windowSecs) * 100 : 0)
            return (
              <div className="ls-util-row" key={r.host}>
                <div className="ls-util-label">
                  <span className="ls-legend-dot" style={{ background: r.color }} />
                  {r.lab} <span className="ls-legend-host">({r.host})</span>
                </div>
                <div className="ls-util-bar" title={
                  `Active ${fmtHrs(r.active)} · other-running ${fmtHrs(r.runningOther)} · ` +
                  `fault-down ${fmtHrs(r.faultDown)} · idle-down ${fmtHrs(r.idleDown)}`
                }>
                  <div className="ls-seg" style={{ width: `${pct(r.active)}%`, background: '#22c55e' }} />
                  <div className="ls-seg" style={{ width: `${pct(r.runningOther)}%`, background: '#64748b' }} />
                  <div className="ls-seg" style={{ width: `${pct(r.faultDown)}%`, background: '#ef4444' }} />
                  <div className="ls-seg" style={{ width: `${pct(r.idleDown)}%`, background: '#f59e0b' }} />
                </div>
                <div className="ls-util-pct">{r.util.toFixed(0)}%</div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function BotChip({
  s,
  on,
  onToggle,
}: {
  s: Series
  on: boolean
  onToggle: (host: string) => void
}) {
  return (
    <button
      type="button"
      className={`ls-chip${on ? ' on' : ''}`}
      onClick={() => onToggle(s.host)}
      title={`${s.lab} (${s.host})`}
    >
      <span className="ls-chip-dot" style={{ background: on ? s.color : 'transparent', borderColor: s.color }} />
      <span className="ls-chip-label">{s.lab}</span>
      <span className="ls-chip-host">{s.host}</span>
    </button>
  )
}
