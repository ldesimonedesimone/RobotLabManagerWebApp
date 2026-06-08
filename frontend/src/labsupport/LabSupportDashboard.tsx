import { useMemo, useState } from 'react'
import { LAB_SUPPORT_DATA } from './labSupportData'
import './labsupport.css'

type Series = {
  lab: string
  host: string
  color: string
  note: string | null
  counts: number[]
  default: boolean
}

type Card = {
  lab: string
  host: string
  color: string
  note: string | null
  default: boolean
  slowCount: number
  runHours: number
  topFault: { label: string; ttr: string; count: number } | null
}

type LabSupportData = {
  titleRange: string
  defaultHosts: string[]
  subtitle: string
  footer: string
  generatedAt: string
  yAxisLabel: string
  weeks: string[]
  maxY: number
  tickStep: number
  series: Series[]
  cards: Card[]
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

function loadSelection(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const arr = JSON.parse(raw) as string[]
      if (Array.isArray(arr)) return new Set(arr)
    }
  } catch {
    /* fall through to default */
  }
  return new Set(DATA.defaultHosts)
}

function FaultChart({
  series,
  weeks,
  maxY,
  tickStep,
  yAxisLabel,
}: {
  series: Series[]
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
  const [selected, setSelected] = useState<Set<string>>(loadSelection)
  const [pickerOpen, setPickerOpen] = useState(false)

  const persist = (next: Set<string>) => {
    setSelected(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
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

  const selectAll = () => persist(new Set(data.series.map((s) => s.host)))
  const clearAll = () => persist(new Set())
  const resetLabs = () => persist(new Set(data.defaultHosts))

  const shownSeries = useMemo(
    () => data.series.filter((s) => selected.has(s.host)),
    [data.series, selected],
  )
  const shownCards = useMemo(
    () => data.cards.filter((c) => selected.has(c.host)),
    [data.cards, selected],
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
                  {c.topFault ? (
                    <div className="ls-top-fault">
                      <span className="ls-top-dot" style={{ background: c.color }} />
                      <span className="ls-top-type">{c.topFault.label}</span>
                      <span className="ls-top-ttr">
                        {c.topFault.ttr} TTR · ×{c.topFault.count}
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

      <footer className="ls-footer">
        {data.footer} · Snapshot generated {data.generatedAt}
      </footer>
    </div>
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
