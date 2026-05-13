import { useCallback, useEffect, useMemo, useState } from 'react'
import { API_BASE } from '../scheduleApi'
import { useEditMode } from '../EditModeContext'
import './SurveyResultsPage.css'

const SATISFACTION = ['Very satisfied', 'Satisfied', 'Neutral', 'Unsatisfied', 'Very unsatisfied'] as const
const MANAGEABLE = ['Very manageable', 'Manageable', 'Neutral', 'Unmanageable', 'Very unmanageable'] as const
const WELL = ['Very well', 'Well', 'Neutral', 'Poorly', 'Very poorly'] as const

type RatedQuestion = {
  id: string
  title: string
  options: readonly string[]
}

type TextQuestion = {
  id: string
  title: string
  textOnly: true
}

type Question = RatedQuestion | TextQuestion

const QUESTIONS: Question[] = [
  { id: 'job_satisfaction', title: 'Job as an Ultra Pilot, overall', options: SATISFACTION },
  { id: 'teleop_experience', title: 'Teleoperation experience overall', options: SATISFACTION },
  { id: 'ultra_app', title: 'Ultra app overall', options: SATISFACTION },
  { id: 'shift_schedule_breaks', title: 'Shift scheduling & breaks', options: SATISFACTION },
  { id: 'leaderboard_badges', title: 'Leaderboard & badge functionality', options: SATISFACTION },
  { id: 'office_equipment', title: 'Office equipment (chairs, computers, headsets)', options: SATISFACTION },
  { id: 'training_program', title: 'Pilot training program', options: SATISFACTION },
  { id: 'physical_demand', title: 'Physical demand during a typical shift', options: MANAGEABLE },
  { id: 'ultra_growth_support', title: 'Ultra support for growth & recognition', options: WELL },
  { id: 'remotics_growth_support', title: 'Remotics support for growth & recognition', options: WELL },
  { id: 'anything_else', title: 'Anything else on your mind?', textOnly: true },
]

// Color for each position in the 5-point scale (positive -> negative).
const SCALE_COLORS = ['#2e7d32', '#66bb6a', '#9e9e9e', '#ef5350', '#c62828']

type SurveyRow = {
  id: number
  inserted_at: string
  pilot_name: string | null
  answers: Record<string, { rating?: string; comment?: string }>
}

type WindowKey = '7d' | '30d' | '90d' | 'all'

const WINDOW_OPTIONS: { key: WindowKey; label: string; days: number | null }[] = [
  { key: '7d', label: 'Last 7 days', days: 7 },
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: '90d', label: 'Last 90 days', days: 90 },
  { key: 'all', label: 'All time', days: null },
]

function isRated(q: Question): q is RatedQuestion {
  return !('textOnly' in q)
}

function formatRelative(iso: string): string {
  const d = new Date(iso)
  const diffMs = Date.now() - d.getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 14) return `${days}d ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function SurveyResultsPage() {
  const { isEditMode } = useEditMode()
  const [windowKey, setWindowKey] = useState<WindowKey>('30d')
  const [rows, setRows] = useState<SurveyRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const startIso = useMemo(() => {
    const opt = WINDOW_OPTIONS.find((o) => o.key === windowKey)
    if (!opt || opt.days === null) return null
    return new Date(Date.now() - opt.days * 86400000).toISOString()
  }, [windowKey])

  const fetchRows = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const qs = new URLSearchParams()
      if (startIso) qs.set('start_iso', startIso)
      const r = await fetch(`${API_BASE}/api/survey/responses?${qs.toString()}`)
      if (!r.ok) throw new Error(await r.text())
      const data = (await r.json()) as SurveyRow[]
      setRows(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [startIso])

  useEffect(() => {
    if (!isEditMode) return
    fetchRows()
  }, [fetchRows, isEditMode])

  const stats = useMemo(() => {
    const total = rows.length
    const namedPilots = new Set(
      rows.map((r) => (r.pilot_name || '').trim()).filter((n) => n),
    )
    const anonymous = rows.filter((r) => !(r.pilot_name || '').trim()).length
    const latest = rows[0]?.inserted_at
    return { total, uniquePilots: namedPilots.size, anonymous, latest }
  }, [rows])

  const perQuestion = useMemo(() => {
    return QUESTIONS.map((q) => {
      const ratings: Record<string, number> = {}
      const comments: { row: SurveyRow; comment: string }[] = []
      let totalAnswered = 0

      for (const row of rows) {
        const ans = row.answers[q.id]
        if (!ans) continue
        if (isRated(q) && ans.rating) {
          ratings[ans.rating] = (ratings[ans.rating] || 0) + 1
          totalAnswered++
        } else if (!isRated(q)) {
          totalAnswered++
        }
        if (ans.comment) {
          comments.push({ row, comment: ans.comment })
        }
      }

      const distribution = isRated(q)
        ? q.options.map((opt) => ({
            label: opt,
            count: ratings[opt] || 0,
            pct: totalAnswered ? ((ratings[opt] || 0) / totalAnswered) * 100 : 0,
          }))
        : []

      return { q, totalAnswered, distribution, comments }
    })
  }, [rows])

  if (!isEditMode) {
    return (
      <div className="survey-results-page">
        <div className="survey-results-locked">
          <h1>Survey results are locked</h1>
          <p>
            Responses may contain candid feedback. Unlock edit mode in the top-right
            corner to view aggregated results.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="survey-results-page">
      <header className="survey-results-header">
        <div>
          <h1>Pilot survey results</h1>
          <p className="survey-results-sub">
            Aggregated responses from the pilot feedback form.
          </p>
        </div>
        <div className="survey-window-picker">
          {WINDOW_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={`survey-window-btn${windowKey === opt.key ? ' active' : ''}`}
              onClick={() => setWindowKey(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </header>

      {error && <div className="survey-error">Couldn't load: {error}</div>}
      {loading && rows.length === 0 && <div className="survey-loading">Loading…</div>}

      <section className="survey-stats">
        <div className="stat-card">
          <div className="stat-num">{stats.total}</div>
          <div className="stat-label">responses</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{stats.uniquePilots}</div>
          <div className="stat-label">named pilots</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{stats.anonymous}</div>
          <div className="stat-label">anonymous</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{stats.latest ? formatRelative(stats.latest) : '—'}</div>
          <div className="stat-label">most recent</div>
        </div>
      </section>

      {rows.length === 0 && !loading && !error && (
        <div className="survey-empty">
          No responses in this window. Try widening the time range, or seed demo data
          with <code>python3 backend/seed_survey.py</code>.
        </div>
      )}

      <section className="survey-questions">
        {perQuestion.map(({ q, totalAnswered, distribution, comments }) => {
          const isOpen = !!expanded[q.id]
          return (
            <article key={q.id} className="qcard">
              <header className="qcard-head">
                <div className="qcard-title">{q.title}</div>
                <div className="qcard-meta">
                  {totalAnswered} {totalAnswered === 1 ? 'response' : 'responses'}
                  {comments.length > 0 && (
                    <>
                      {' · '}
                      <button
                        type="button"
                        className="qcard-comments-btn"
                        onClick={() =>
                          setExpanded((prev) => ({ ...prev, [q.id]: !prev[q.id] }))
                        }
                      >
                        {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
                        {' '}
                        {isOpen ? '▲' : '▼'}
                      </button>
                    </>
                  )}
                </div>
              </header>

              {isRated(q) && totalAnswered > 0 && (
                <>
                  <div className="qcard-bar">
                    {distribution.map((seg, i) => (
                      <div
                        key={seg.label}
                        className="qcard-bar-seg"
                        style={{
                          width: `${seg.pct}%`,
                          background: SCALE_COLORS[i],
                        }}
                        title={`${seg.label}: ${seg.count} (${seg.pct.toFixed(0)}%)`}
                      >
                        {seg.pct >= 8 && <span>{seg.pct.toFixed(0)}%</span>}
                      </div>
                    ))}
                  </div>
                  <div className="qcard-legend">
                    {distribution.map((seg, i) => (
                      <span key={seg.label} className="qcard-legend-item">
                        <span
                          className="qcard-legend-dot"
                          style={{ background: SCALE_COLORS[i] }}
                        />
                        <span className="qcard-legend-label">{seg.label}</span>
                        <span className="qcard-legend-count">{seg.count}</span>
                      </span>
                    ))}
                  </div>
                </>
              )}

              {!isRated(q) && (
                <div className="qcard-textonly">
                  Open-ended question · {comments.length}{' '}
                  {comments.length === 1 ? 'response' : 'responses'}
                  {comments.length > 0 && (
                    <button
                      type="button"
                      className="qcard-comments-btn inline"
                      onClick={() =>
                        setExpanded((prev) => ({ ...prev, [q.id]: !prev[q.id] }))
                      }
                    >
                      {isOpen ? 'Hide ▲' : 'Show ▼'}
                    </button>
                  )}
                </div>
              )}

              {isOpen && comments.length > 0 && (
                <ul className="qcard-comments">
                  {comments.map(({ row, comment }, i) => (
                    <li key={`${row.id}-${i}`} className="qcard-comment">
                      <div className="qcard-comment-meta">
                        <span className="qcard-comment-pilot">
                          {row.pilot_name?.trim() || 'Anonymous'}
                        </span>
                        <span className="qcard-comment-date">
                          {formatDate(row.inserted_at)}
                        </span>
                      </div>
                      <div className="qcard-comment-body">{comment}</div>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          )
        })}
      </section>
    </div>
  )
}
