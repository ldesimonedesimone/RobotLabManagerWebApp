import type { SeriesResponse } from './types'
import type { GridModel } from './weekbyweek/types'

const API_BASE = import.meta.env.VITE_API_BASE ?? ''

async function readErrorBody(r: Response): Promise<string> {
  const t = await r.text()
  try {
    const j = JSON.parse(t) as { detail?: unknown }
    if (typeof j.detail === 'string') return j.detail
    if (Array.isArray(j.detail)) {
      return j.detail
        .map((x) => (typeof x === 'object' && x && 'msg' in x ? String((x as { msg: string }).msg) : String(x)))
        .join('; ')
    }
  } catch {
    /* plain text */
  }
  return t || r.statusText
}

export async function searchOperators(q: string): Promise<
  { id: number; name: string }[]
> {
  const r = await fetch(
    `${API_BASE}/api/operators?q=${encodeURIComponent(q)}&limit=50`,
  )
  if (!r.ok) throw new Error(await readErrorBody(r))
  return r.json()
}

export async function postSeries(body: {
  workflow_key: string
  teleoperator_ids: number[]
  start_iso: string
  end_iso: string
  bucket_mode: 'fixed' | 'utc_day' | 'panel_span'
  bucket_seconds: number | null
  trim_longest_pct: number
  trim_shortest_pct: number
  aggregate: 'raw' | 'bucket'
  outcome: 'all' | 'success_only' | 'failed_only'
  bucket_stat: 'mean_median' | 'box'
}): Promise<SeriesResponse> {
  const r = await fetch(`${API_BASE}/api/series`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    throw new Error(await readErrorBody(r))
  }
  return r.json()
}

export type WeekByWeekState = {
  model: GridModel
  pinEnd: string[]
  sheetMode: 'flow' | 'end'
  settings: {
    days_in_week: 5 | 6 | 7
    percent_usable: number
    uptime_percent: number
    hours_shift_1: number
    hours_shift_2: number
    hours_shift_3: number
  }
}

type WeekByWeekEnvelope = {
  state: WeekByWeekState | null
  updated_at: string | null
}

export async function getWeekByWeekState(): Promise<WeekByWeekEnvelope> {
  const r = await fetch(`${API_BASE}/api/weekbyweek`)
  if (!r.ok) throw new Error(await readErrorBody(r))
  return r.json()
}

export async function putWeekByWeekState(state: WeekByWeekState): Promise<WeekByWeekEnvelope> {
  const r = await fetch(`${API_BASE}/api/weekbyweek`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  })
  if (!r.ok) throw new Error(await readErrorBody(r))
  return r.json()
}
