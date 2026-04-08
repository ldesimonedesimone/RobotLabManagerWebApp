import { useCallback, useEffect, useState } from 'react'

import { PanelCard } from './PanelCard'
import { STORAGE_KEY, WORKFLOW_PRESETS, type WorkflowKey } from './constants'
import type { DashboardPersisted, PanelConfig } from './types'
import './App.css'

function newId(): string {
  return crypto.randomUUID()
}

function isoRangeFromDays(days: number): { start_iso: string; end_iso: string } {
  const end = new Date()
  const start = new Date(end.getTime() - days * 86400000)
  return { start_iso: start.toISOString(), end_iso: end.toISOString() }
}

function defaultPanel(defaultDays: number): PanelConfig {
  const { start_iso, end_iso } = isoRangeFromDays(defaultDays)
  const wf = WORKFLOW_PRESETS[0]
  return {
    id: newId(),
    workflow_key: wf.key as WorkflowKey,
    teleoperator_ids: [],
    start_iso,
    end_iso,
    goal_seconds: wf.defaultGoal,
    trim_longest_pct: 0,
    trim_shortest_pct: 0,
    aggregate: 'raw',
    outcome: 'all',
    bucket_mode: 'fixed',
    bucket_seconds: 2 * 60 * 60,
    bucket_stat: 'mean_median',
    show_mean: true,
    show_median: true,
  }
}

function loadState(): DashboardPersisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { default_days: 30, panels: [defaultPanel(30)] }
    }
    const p = JSON.parse(raw) as DashboardPersisted
    if (!p || !Array.isArray(p.panels)) {
      return { default_days: 30, panels: [defaultPanel(30)] }
    }
    const days =
      typeof p.default_days === 'number' && p.default_days > 0 ? p.default_days : 30
    const mapped: PanelConfig[] = p.panels.map((x) => ({
      ...defaultPanel(days),
      ...x,
      id: typeof x.id === 'string' ? x.id : newId(),
      workflow_key: (String(x.workflow_key ?? '') === 'mailer'
        ? 'mailer_seal_mailer'
        : (x.workflow_key ?? 'bulk_shipping')) as WorkflowKey,
      teleoperator_ids: Array.isArray(x.teleoperator_ids)
        ? x.teleoperator_ids.slice(0, 12)
        : [],
      goal_seconds: Number(x.goal_seconds) || 36,
      trim_longest_pct: Math.min(99, Math.max(0, Number(x.trim_longest_pct) || 0)),
      trim_shortest_pct: Math.min(99, Math.max(0, Number(x.trim_shortest_pct) || 0)),
      aggregate: x.aggregate === 'bucket' ? 'bucket' : 'raw',
      outcome:
        x.outcome === 'failed_only'
          ? 'failed_only'
          : x.outcome === 'success_only'
            ? 'success_only'
            : 'all',
      bucket_mode:
        x.bucket_mode === 'utc_day' || x.bucket_mode === 'panel_span'
          ? x.bucket_mode
          : 'fixed',
      bucket_seconds: Number(x.bucket_seconds) || 7200,
      bucket_stat: x.bucket_stat === 'box' ? 'box' : 'mean_median',
      show_mean: x.show_mean !== false,
      show_median: x.show_median !== false,
    }))
    return {
      default_days: days,
      panels: mapped.length > 0 ? mapped : [defaultPanel(days)],
    }
  } catch {
    return { default_days: 30, panels: [defaultPanel(30)] }
  }
}

export default function PilotDashboard() {
  const initial = loadState()
  const [defaultDays, setDefaultDays] = useState(initial.default_days)
  const [panels, setPanels] = useState<PanelConfig[]>(initial.panels)

  useEffect(() => {
    const payload: DashboardPersisted = {
      default_days: defaultDays,
      panels,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  }, [panels, defaultDays])

  const updatePanel = useCallback((id: string, patch: Partial<PanelConfig>) => {
    setPanels((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    )
  }, [])

  const removePanel = useCallback((id: string) => {
    setPanels((prev) => prev.filter((p) => p.id !== id))
  }, [])

  const addPanel = useCallback(() => {
    setPanels((prev) => [...prev, defaultPanel(defaultDays)])
  }, [defaultDays])

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <h1>Pilot data</h1>
          <p className="muted">Workflow duration viewer</p>
        </div>
        <div className="top-actions">
          <label className="inline-field">
            <span>Default range for new panels (days)</span>
            <input
              type="number"
              min={1}
              max={365}
              value={defaultDays}
              onChange={(e) => setDefaultDays(Number(e.target.value) || 30)}
            />
          </label>
          <button type="button" className="btn primary" onClick={addPanel}>
            Add panel
          </button>
        </div>
      </header>

      <main className="panels">
        {panels.map((p) => (
          <PanelCard
            key={p.id}
            panel={p}
            onChange={(patch) => updatePanel(p.id, patch)}
            onRemove={() => removePanel(p.id)}
          />
        ))}
      </main>
    </div>
  )
}
