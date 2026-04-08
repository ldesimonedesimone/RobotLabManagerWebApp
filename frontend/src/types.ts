import type { WorkflowKey } from './constants'

export type OutcomeFilter = 'all' | 'success_only' | 'failed_only'

export type BucketStat = 'mean_median' | 'box'

export type BucketMode = 'fixed' | 'utc_day' | 'panel_span'

export interface PanelConfig {
  id: string
  workflow_key: WorkflowKey
  teleoperator_ids: number[]
  start_iso: string
  end_iso: string
  goal_seconds: number
  trim_longest_pct: number
  trim_shortest_pct: number
  aggregate: 'raw' | 'bucket'
  outcome: OutcomeFilter
  bucket_mode: BucketMode
  bucket_seconds: number
  bucket_stat: BucketStat
  show_mean: boolean
  show_median: boolean
}

export interface DashboardPersisted {
  default_days: number
  panels: PanelConfig[]
}

export interface OperatorRow {
  id: number
  name: string
}

export interface SeriesResponse {
  workflow_key: string
  title: string
  goal_seconds: number | null
  aggregate: string
  outcome: string
  bucket_stat: string | null
  bucket_mode: string | null
  operators: {
    teleoperator_id: number
    name: string
    teleop_hours_h?: number
    points:
      | { t: string; duration_s: number; item_count?: number | null }[]
      | { bucket_start: string; mean_s: number; median_s: number }[]
      | { bucket_start: string; values_s: number[] }[]
  }[]
}
