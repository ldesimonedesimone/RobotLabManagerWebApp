export const WORKFLOW_PRESETS = [
  {
    key: 'bulk_shipping',
    shortTitle: 'Bulk shipping',
    defaultGoal: 36,
  },
  {
    key: 'tote',
    shortTitle: 'Tote',
    defaultGoal: 450,
  },
  {
    key: 'mailer_seal_mailer',
    shortTitle: 'Mailer — seal mailer',
    defaultGoal: 120,
  },
  {
    key: 'mailer_apply_label',
    shortTitle: 'Mailer — apply label',
    defaultGoal: 90,
  },
  {
    key: 'pick_scan_sort',
    shortTitle: 'Pick scan & sort',
    defaultGoal: 36,
  },
  {
    key: 'tower_stack',
    shortTitle: 'Tower Stack Unstack (rings)',
    defaultGoal: 120,
  },
] as const

export type WorkflowKey = (typeof WORKFLOW_PRESETS)[number]['key']

export const BUCKET_OPTIONS_SECONDS = [
  { label: '15m', value: 15 * 60 },
  { label: '30m', value: 30 * 60 },
  { label: '1h', value: 60 * 60 },
  { label: '2h', value: 2 * 60 * 60 },
  { label: '4h', value: 4 * 60 * 60 },
] as const

export const BUCKET_MODE_OPTIONS = [
  { label: 'Fixed width', value: 'fixed' as const },
  { label: '1 day (UTC)', value: 'utc_day' as const },
  { label: 'Full range (From–To)', value: 'panel_span' as const },
] as const

export const STORAGE_KEY = 'pilotDashboard.v1'
