import { LAB_SUPPORT_DATA } from './labSupportData'
import './labsupport.css'

type Series = {
  lab: string
  host: string
  color: string
  note: string | null
  counts: number[]
}

type Card = {
  lab: string
  host: string
  color: string
  note: string | null
  slowCount: number
  runHours: number
  topFault: { label: string; ttr: string; count: number } | null
}

type LabSupportData = {
  titleRange: string
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

function FaultChart({ data }: { data: LabSupportData }) {
  const n = data.weeks.length
  const xAt = (i: number) => ML + (i / Math.max(n - 1, 1)) * PLOT_W
  const yAt = (v: number) => MT + PLOT_H - (v / data.maxY) * PLOT_H

  const ticks: number[] = []
  for (let t = 0; t <= data.maxY; t += data.tickStep) ticks.push(t)

  return (
    <svg className="ls-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Weekly hardware faults over 90 seconds by lab">
      <text
        x={12}
        y={MT + PLOT_H / 2}
        textAnchor="middle"
        fontSize={11}
        fill={TXT}
        transform={`rotate(-90 12 ${MT + PLOT_H / 2})`}
      >
        {data.yAxisLabel}
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

      {data.weeks.map((wk, i) => (
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

      {data.series.map((s) => (
        <polyline
          key={`line-${s.lab}`}
          points={s.counts.map((v, i) => `${xAt(i)},${yAt(v)}`).join(' ')}
          fill="none"
          stroke={s.color}
          strokeWidth={2.2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}

      {data.series.map((s) =>
        s.counts.map((v, i) => (
          <circle
            key={`dot-${s.lab}-${i}`}
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
  return (
    <div className="ls-page">
      <header className="ls-head">
        <h1>
          Lab Support Summary <span className="ls-range">{data.titleRange}</span>
        </h1>
        <p className="ls-subtitle">{data.subtitle}</p>
      </header>

      <div className="ls-layout">
        <section className="ls-panel ls-chart-panel">
          <FaultChart data={data} />
          <div className="ls-legend">
            {data.series.map((s) => (
              <span className="ls-legend-item" key={`leg-${s.lab}`} title={s.note ?? undefined}>
                <span className="ls-legend-dot" style={{ background: s.color }} />
                {s.lab} <span className="ls-legend-host">({s.host})</span>
                {s.note ? <span className="ls-legend-star">*</span> : null}
              </span>
            ))}
          </div>
        </section>

        <section className="ls-cards">
          <div className="ls-cards-header">{data.titleRange} · per-robot summary</div>
          {data.cards.map((c) => (
            <article
              className={`ls-card${c.note ? ' removed' : ''}`}
              key={c.lab}
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
          ))}
        </section>
      </div>

      <footer className="ls-footer">
        {data.footer} · Snapshot generated {data.generatedAt}
      </footer>
    </div>
  )
}
