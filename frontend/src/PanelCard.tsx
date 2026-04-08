import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import type { Data, Layout } from 'plotly.js'

import { ChartErrorBoundary } from './ChartErrorBoundary'
import { postSeries, searchOperators } from './api'
import { Plot } from './plotlyPlot'
import {
  BUCKET_MODE_OPTIONS,
  BUCKET_OPTIONS_SECONDS,
  WORKFLOW_PRESETS,
  type WorkflowKey,
} from './constants'
import type { PanelConfig, SeriesResponse } from './types'

const PLOT_BG = '#111827'
const PLOT_TEXT = '#e2e8f0'

const COLORS = [
  '#7eb6ff',
  '#ffb86c',
  '#50fa7b',
  '#bd93f9',
  '#ff79c6',
  '#8be9fd',
  '#f1fa8c',
  '#6272a4',
  '#ff5555',
  '#94a3b8',
  '#34d399',
  '#f472b6',
]

type Props = {
  panel: PanelConfig
  onChange: (patch: Partial<PanelConfig>) => void
  onRemove: () => void
}

function toLocalInputValue(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  const y = d.getFullYear()
  const m = pad(d.getMonth() + 1)
  const day = pad(d.getDate())
  const h = pad(d.getHours())
  const min = pad(d.getMinutes())
  return `${y}-${m}-${day}T${h}:${min}`
}

function fromLocalInputValue(local: string): string {
  const d = new Date(local)
  if (Number.isNaN(d.getTime())) return new Date().toISOString()
  return d.toISOString()
}

export function PanelCard({ panel, onChange, onRemove }: Props) {
  const [q, setQ] = useState('')
  const [operatorHits, setOperatorHits] = useState<
    { id: number; name: string }[]
  >([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchErr, setSearchErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [data, setData] = useState<SeriesResponse | null>(null)

  const preset = WORKFLOW_PRESETS.find((w) => w.key === panel.workflow_key)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!q.trim()) {
        setOperatorHits([])
        setSearchErr(null)
        setSearchLoading(false)
        return
      }
      setSearchLoading(true)
      setSearchErr(null)
      try {
        const rows = await searchOperators(q.trim())
        if (!cancelled) {
          setOperatorHits(rows)
        }
      } catch (e) {
        if (!cancelled) {
          setOperatorHits([])
          setSearchErr(e instanceof Error ? e.message : String(e))
        }
      } finally {
        if (!cancelled) setSearchLoading(false)
      }
    }
    const t = window.setTimeout(run, 120)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [q])

  const requestBody = useMemo(
    () => ({
      workflow_key: panel.workflow_key,
      teleoperator_ids: panel.teleoperator_ids,
      start_iso: panel.start_iso,
      end_iso: panel.end_iso,
      trim_longest_pct: panel.trim_longest_pct,
      trim_shortest_pct: panel.trim_shortest_pct,
      aggregate: panel.aggregate,
      outcome: panel.outcome,
      bucket_stat: panel.bucket_stat,
      bucket_mode: panel.bucket_mode,
      bucket_seconds:
        panel.aggregate === 'bucket' && panel.bucket_mode === 'fixed'
          ? panel.bucket_seconds
          : null,
    }),
    [
      panel.workflow_key,
      panel.teleoperator_ids,
      panel.start_iso,
      panel.end_iso,
      panel.trim_longest_pct,
      panel.trim_shortest_pct,
      panel.aggregate,
      panel.outcome,
      panel.bucket_stat,
      panel.bucket_mode,
      panel.bucket_seconds,
    ],
  )

  useEffect(() => {
    if (panel.teleoperator_ids.length === 0) {
      setData(null)
      setErr(null)
      return
    }
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setErr(null)
      try {
        const res = await postSeries(requestBody)
        if (!cancelled) setData(res)
      } catch (e) {
        if (!cancelled) {
          setData(null)
          setErr(e instanceof Error ? e.message : String(e))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    const t = window.setTimeout(load, 250)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [requestBody, panel.teleoperator_ids.length])

  const plot = useMemo(() => {
    if (!data || data.operators.length === 0) return { data: [] as Data[], layout: {} as Partial<Layout> }
    const traces: Data[] = []
    if (data.aggregate === 'raw') {
      data.operators.forEach((op, i) => {
        const pts = op.points as {
          t: string
          duration_s: number
          item_count?: number | null
        }[]
        if (pts.length === 0) return
        const xs = pts.map((p) => p.t)
        const ys = pts.map((p) => p.duration_s)
        if (!ys.every((v) => Number.isFinite(v))) return
        const counts = pts.map((p) =>
          p.item_count != null && Number.isFinite(p.item_count)
            ? p.item_count
            : null,
        )
        const hasColor =
          panel.workflow_key === 'bulk_shipping' &&
          counts.some((c) => c != null && c > 0)
        traces.push({
          type: 'scatter',
          mode: 'markers',
          name: op.name,
          x: xs,
          y: ys,
          marker: hasColor
            ? {
                size: 6,
                opacity: 0.75,
                color: counts.map((c) => (c != null && c > 0 ? c : 0)),
                colorscale: 'Viridis',
                showscale: i === 0,
                colorbar:
                  i === 0
                    ? { title: { text: 'items' }, len: 0.5, thickness: 12 }
                    : undefined,
              }
            : { size: 4, opacity: 0.65, color: COLORS[i % COLORS.length] },
        })
      })
    } else if (data.bucket_stat === 'box') {
      data.operators.forEach((op, i) => {
        const pts = op.points as { bucket_start: string; values_s: number[] }[]
        if (pts.length === 0) return
        const color = COLORS[i % COLORS.length]
        const bx = pts.flatMap((p) =>
          p.values_s.map((v) => ({
            bucket: p.bucket_start,
            y: v,
          })),
        )
        if (bx.length === 0) return
        traces.push({
          type: 'box',
          name: op.name,
          x: bx.map((b) => b.bucket),
          y: bx.map((b) => b.y),
          marker: { color },
          line: { color },
        })
      })
    } else {
      data.operators.forEach((op, i) => {
        const pts = op.points as {
          bucket_start: string
          mean_s: number
          median_s: number
        }[]
        if (pts.length === 0) return
        const xs = pts.map((p) => p.bucket_start)
        const color = COLORS[i % COLORS.length]
        if (panel.show_mean) {
          const ys = pts.map((p) => p.mean_s)
          if (ys.every((v) => Number.isFinite(v))) {
            traces.push({
              type: 'scatter',
              mode: 'lines+markers',
              name: `${op.name} (mean)`,
              x: xs,
              y: ys,
              line: { color, width: 2 },
              marker: { size: 4, color },
            })
          }
        }
        if (panel.show_median) {
          const ys = pts.map((p) => p.median_s)
          if (ys.every((v) => Number.isFinite(v))) {
            traces.push({
              type: 'scatter',
              mode: 'lines+markers',
              name: `${op.name} (median)`,
              x: xs,
              y: ys,
              line: { color, width: 2, dash: 'dash' },
              marker: { size: 4, color },
            })
          }
        }
      })
    }
    const shapes: Partial<Layout['shapes']> = []
    const g = panel.goal_seconds
    if (Number.isFinite(g)) {
      shapes.push({
        type: 'line',
        x0: 0,
        x1: 1,
        xref: 'paper',
        y0: g,
        y1: g,
        yref: 'y',
        line: { color: '#ff5555', width: 1, dash: 'dot' },
      })
    }
    const layout: Partial<Layout> = {
      paper_bgcolor: PLOT_BG,
      plot_bgcolor: PLOT_BG,
      font: { color: PLOT_TEXT, family: 'system-ui, sans-serif', size: 11 },
      margin: { l: 48, r: 8, t: 8, b: 40 },
      showlegend: true,
      legend: { orientation: 'h', yanchor: 'bottom', y: 1.02, x: 0 },
      xaxis: {
        gridcolor: 'rgba(148,163,184,0.15)',
        zeroline: false,
        type: 'date',
      },
      yaxis: {
        title: { text: 'seconds' },
        gridcolor: 'rgba(148,163,184,0.15)',
        zeroline: false,
      },
      shapes: shapes as Layout['shapes'],
    }
    return { data: traces, layout }
  }, [
    data,
    panel.goal_seconds,
    panel.show_mean,
    panel.show_median,
    panel.workflow_key,
  ])

  const chartBoundaryKey = useMemo(() => {
    if (!data) return 'empty'
    return `${data.workflow_key}-${data.operators
      .map(
        (o) =>
          `${o.teleoperator_id}:${Array.isArray(o.points) ? o.points.length : 0}`,
      )
      .join('|')}`
  }, [data])

  const addOperator = (id: number) => {
    if (panel.teleoperator_ids.includes(id)) return
    if (panel.teleoperator_ids.length >= 12) return
    onChange({ teleoperator_ids: [...panel.teleoperator_ids, id] })
    setQ('')
    setOperatorHits([])
    setSearchErr(null)
  }

  const addByTypedId = () => {
    const trimmed = q.trim()
    if (!/^\d+$/.test(trimmed)) return
    const id = parseInt(trimmed, 10)
    if (!Number.isFinite(id)) return
    addOperator(id)
  }

  const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (/^\d+$/.test(q.trim())) {
      addByTypedId()
      return
    }
    if (operatorHits.length === 1) {
      addOperator(operatorHits[0].id)
    }
  }

  const removeOperator = (id: number) => {
    onChange({
      teleoperator_ids: panel.teleoperator_ids.filter((x) => x !== id),
    })
  }

  return (
    <section className="panel">
      <header className="panel-head">
        <h2 className="panel-title">{preset?.shortTitle ?? panel.workflow_key}</h2>
        <button type="button" className="btn ghost" onClick={onRemove}>
          Remove
        </button>
      </header>

      <label className="field workflow-row">
        <span>Workflow metric</span>
        <select
          className="workflow-select"
          value={panel.workflow_key}
          aria-label="Workflow metric"
          onChange={(e) => {
            const key = e.target.value as WorkflowKey
            const p = WORKFLOW_PRESETS.find((w) => w.key === key)
            onChange({
              workflow_key: key,
              goal_seconds: p?.defaultGoal ?? panel.goal_seconds,
            })
          }}
        >
          {WORKFLOW_PRESETS.map((w) => (
            <option key={w.key} value={w.key}>
              {w.shortTitle}
            </option>
          ))}
        </select>
      </label>

      <div className="panel-grid">

        <label className="field">
          <span>From</span>
          <input
            type="datetime-local"
            value={toLocalInputValue(panel.start_iso)}
            onChange={(e) =>
              onChange({ start_iso: fromLocalInputValue(e.target.value) })
            }
          />
        </label>

        <label className="field">
          <span>To</span>
          <input
            type="datetime-local"
            value={toLocalInputValue(panel.end_iso)}
            onChange={(e) =>
              onChange({ end_iso: fromLocalInputValue(e.target.value) })
            }
          />
        </label>

        <div className="field quick">
          <span>Quick</span>
          <div className="quick-btns">
            <button
              type="button"
              className="btn tiny"
              onClick={() => {
                const end = new Date()
                const start = new Date(end.getTime() - 7 * 86400000)
                onChange({
                  start_iso: start.toISOString(),
                  end_iso: end.toISOString(),
                })
              }}
            >
              7d
            </button>
            <button
              type="button"
              className="btn tiny"
              onClick={() => {
                const end = new Date()
                const start = new Date(end.getTime() - 30 * 86400000)
                onChange({
                  start_iso: start.toISOString(),
                  end_iso: end.toISOString(),
                })
              }}
            >
              30d
            </button>
          </div>
        </div>

        <label className="field">
          <span>Goal (s)</span>
          <input
            type="number"
            step="any"
            value={panel.goal_seconds}
            onChange={(e) =>
              onChange({ goal_seconds: Number(e.target.value) || 0 })
            }
          />
        </label>

        <label className="field">
          <span>Trim longest %</span>
          <input
            type="number"
            min={0}
            max={99.9}
            step="any"
            value={panel.trim_longest_pct}
            onChange={(e) =>
              onChange({ trim_longest_pct: Number(e.target.value) || 0 })
            }
          />
        </label>

        <label className="field">
          <span>Trim shortest %</span>
          <input
            type="number"
            min={0}
            max={99.9}
            step="any"
            value={panel.trim_shortest_pct}
            onChange={(e) =>
              onChange({ trim_shortest_pct: Number(e.target.value) || 0 })
            }
          />
        </label>

        <label className="field">
          <span>Series</span>
          <select
            value={panel.aggregate}
            onChange={(e) =>
              onChange({
                aggregate: e.target.value as 'raw' | 'bucket',
              })
            }
          >
            <option value="raw">Raw points</option>
            <option value="bucket">Time buckets</option>
          </select>
        </label>

        <label className="field">
          <span>Outcome</span>
          <select
            value={panel.outcome}
            onChange={(e) =>
              onChange({
                outcome: e.target.value as
                  | 'all'
                  | 'success_only'
                  | 'failed_only',
              })
            }
          >
            <option value="all">All runs</option>
            <option value="success_only">Success only</option>
            <option value="failed_only">Failed only</option>
          </select>
        </label>

        <label className="field">
          <span>Bucket mode</span>
          <select
            disabled={panel.aggregate !== 'bucket'}
            value={panel.bucket_mode}
            onChange={(e) =>
              onChange({
                bucket_mode: e.target.value as
                  | 'fixed'
                  | 'utc_day'
                  | 'panel_span',
              })
            }
          >
            {BUCKET_MODE_OPTIONS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Bucket width</span>
          <select
            disabled={
              panel.aggregate !== 'bucket' || panel.bucket_mode !== 'fixed'
            }
            value={panel.bucket_seconds}
            onChange={(e) =>
              onChange({ bucket_seconds: Number(e.target.value) })
            }
          >
            {BUCKET_OPTIONS_SECONDS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Bucket chart</span>
          <select
            disabled={panel.aggregate !== 'bucket'}
            value={panel.bucket_stat}
            onChange={(e) =>
              onChange({
                bucket_stat: e.target.value as 'mean_median' | 'box',
              })
            }
          >
            <option value="mean_median">Mean / median</option>
            <option value="box">Box (whisker)</option>
          </select>
        </label>

        <div className="field check-row">
          <span>Show (bucket)</span>
          <label className="inline">
            <input
              type="checkbox"
              checked={panel.show_mean}
              disabled={
                panel.aggregate !== 'bucket' || panel.bucket_stat === 'box'
              }
              onChange={(e) => onChange({ show_mean: e.target.checked })}
            />
            Mean
          </label>
          <label className="inline">
            <input
              type="checkbox"
              checked={panel.show_median}
              disabled={
                panel.aggregate !== 'bucket' || panel.bucket_stat === 'box'
              }
              onChange={(e) => onChange({ show_median: e.target.checked })}
            />
            Median
          </label>
        </div>
      </div>

      <div className="operator-block">
        <span className="label">Operators (max 12)</span>
        <div className="tags">
          {panel.teleoperator_ids.map((id) => (
            <button
              key={id}
              type="button"
              className="tag"
              onClick={() => removeOperator(id)}
              title="Remove"
            >
              {id} ×
            </button>
          ))}
        </div>
        <div className="operator-search">
          <div className="operator-search-row">
            <input
              type="search"
              autoComplete="off"
              placeholder="Type name or id — results narrow as you type"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onSearchKeyDown}
            />
            <button
              type="button"
              className="btn primary add-id-btn"
              disabled={
                !/^\d+$/.test(q.trim()) ||
                panel.teleoperator_ids.includes(parseInt(q.trim(), 10)) ||
                panel.teleoperator_ids.length >= 12
              }
              title="Add the numeric id in the box (e.g. 101)"
              onClick={addByTypedId}
            >
              Add by ID
            </button>
          </div>
          {searchLoading && (
            <p className="search-hint">Searching…</p>
          )}
          {searchErr && (
            <p className="search-err">{searchErr}</p>
          )}
          {!searchLoading && !searchErr && q.trim() && operatorHits.length === 0 && (
            <p className="search-hint">No name matches — use &quot;Add by ID&quot; if you know the id.</p>
          )}
          {operatorHits.length > 0 && (
            <ul className="hits">
              {operatorHits.map((r) => (
                <li key={r.id}>
                  <div className="hit-row">
                    <span className="hit-name">{r.name}</span>
                    <span className="hit-id muted">{r.id}</span>
                    <button
                      type="button"
                      className="btn tiny hit-add"
                      disabled={
                        panel.teleoperator_ids.includes(r.id) ||
                        panel.teleoperator_ids.length >= 12
                      }
                      onClick={() => addOperator(r.id)}
                    >
                      Add
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {data && data.operators.length > 0 && panel.teleoperator_ids.length > 0 && (
        <div className="teleop-readout">
          <span className="label">Teleop time (panel range, HUMAN running)</span>
          <p className="teleop-line">
            {data.operators
              .map(
                (o) =>
                  `${o.name}: ${(o.teleop_hours_h ?? 0).toFixed(2)} h`,
              )
              .join(' · ')}
          </p>
        </div>
      )}

      <div className="chart-wrap">
        {loading && <div className="overlay">Loading…</div>}
        {err && <div className="error">{err}</div>}
        {!loading && !err && plot.data.length === 0 && panel.teleoperator_ids.length > 0 && (
          <div className="empty">No points in range.</div>
        )}
        {panel.teleoperator_ids.length === 0 && (
          <div className="empty">Add at least one operator.</div>
        )}
        {plot.data.length > 0 && (
          <ChartErrorBoundary key={chartBoundaryKey}>
            <Plot
              data={plot.data}
              layout={plot.layout}
              config={{ responsive: true, displayModeBar: true }}
              style={{ width: '100%', minHeight: '360px' }}
            />
          </ChartErrorBoundary>
        )}
      </div>
    </section>
  )
}
