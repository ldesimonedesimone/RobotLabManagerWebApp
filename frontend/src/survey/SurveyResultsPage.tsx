import { useCallback, useEffect, useMemo, useState } from 'react'
import { API_BASE } from '../scheduleApi'
import './SurveyResultsPage.css'

const SATISFACTION = ['Very satisfied', 'Satisfied', 'Neutral', 'Unsatisfied', 'Very unsatisfied'] as const
const MANAGEABLE = ['Very manageable', 'Manageable', 'Neutral', 'Unmanageable', 'Very unmanageable'] as const
const WELL = ['Very well', 'Well', 'Neutral', 'Poorly', 'Very poorly'] as const
const EXTENT = ['Definitely', 'Mostly', 'Neutral', 'Not really', 'Not at all'] as const
const HEADSET_APP = ['Worked great', 'Worked well', 'Some issues', 'Lots of issues', "Couldn't use it"] as const
const LATENCY_WOW = ['Better than last week', 'Same as last week', 'Worse than last week'] as const
const SCHEDULING = ['Worked great', 'Worked well', 'Neutral', 'Clunky', 'Broken'] as const
const COMFORT = ['Very comfortable', 'Comfortable', 'Neutral', 'Uncomfortable', 'Very uncomfortable'] as const
const TRAINING = ['Very well', 'Well', 'Neutral', 'Poorly', 'Very poorly', "Doesn't apply to me"] as const
const PILOT_ROLE = ['Trainee Pilot', 'Data Collection Pilot', 'Customer Pilot'] as const

type RatedQuestion = {
  id: string
  title: string
  options: readonly string[]
  legacy?: boolean
}

type TextQuestion = {
  id: string
  title: string
  textOnly: true
  legacy?: boolean
}

type Question = RatedQuestion | TextQuestion

const QUESTIONS: Question[] = [
  { id: 'pilot_role', title: 'Pilot role', options: PILOT_ROLE },
  { id: 'job_satisfaction', title: 'Job as a robot pilot, overall', options: SATISFACTION },
  { id: 'teleop_experience', title: 'Teleoperation experience overall', options: SATISFACTION },
  { id: 'headset_app', title: 'Headset app this week', options: HEADSET_APP },
  { id: 'latency_wow', title: 'Latency vs. last week', options: LATENCY_WOW },
  { id: 'shift_schedule', title: 'Shift scheduling tool/process this week', options: SCHEDULING },
  { id: 'leaderboard_badges', title: 'Pilot performance features (badges, data viewer, etc.)', options: SATISFACTION },
  { id: 'comfort_overall', title: 'Comfort piloting overall (equipment to UI)', options: COMFORT },
  { id: 'training_program', title: 'Training program preparation', options: TRAINING },
  { id: 'physical_demand', title: 'Physical demand during a typical shift', options: MANAGEABLE },
  { id: 'growth_support', title: 'Growth supported & performance recognized?', options: EXTENT },
  { id: 'anything_else', title: 'Anything else on your mind?', textOnly: true },
]

const LEGACY_QUESTIONS: Question[] = [
  { id: 'ultra_app', title: 'Ultra app overall (legacy)', options: SATISFACTION, legacy: true },
  { id: 'shift_schedule_breaks', title: 'Shift scheduling & breaks (legacy)', options: SATISFACTION, legacy: true },
  { id: 'office_equipment', title: 'Office equipment (legacy)', options: SATISFACTION, legacy: true },
  { id: 'ultra_growth_support', title: 'Ultra growth & recognition (legacy)', options: WELL, legacy: true },
  { id: 'remotics_growth_support', title: 'Remotics growth & recognition (legacy)', options: WELL, legacy: true },
]

const SCALE_COLORS_5 = ['#2e7d32', '#66bb6a', '#9e9e9e', '#ef5350', '#c62828']
const SCALE_COLORS_6 = ['#2e7d32', '#66bb6a', '#9e9e9e', '#ef5350', '#c62828', '#475569']
const SCALE_COLORS_3 = ['#2e7d32', '#9e9e9e', '#c62828']
const SCALE_COLORS_ROLE = ['#3b82f6', '#10b981', '#f59e0b']

function colorsFor(options: readonly string[]): string[] {
  if (options === PILOT_ROLE) return SCALE_COLORS_ROLE
  if (options.length === 3) return SCALE_COLORS_3
  if (options.length === 6) return SCALE_COLORS_6
  return SCALE_COLORS_5
}

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

type RoleFilter = 'all' | 'Trainee Pilot' | 'Data Collection Pilot' | 'Customer Pilot'

const ROLE_FILTERS: { key: RoleFilter; label: string }[] = [
  { key: 'all', label: 'All roles' },
  { key: 'Trainee Pilot', label: 'Trainees' },
  { key: 'Data Collection Pilot', label: 'Data collection' },
  { key: 'Customer Pilot', label: 'Customer' },
]

const LEGACY_OPEN_KEY = 'surveyResults.legacyOpen'
const UNLOCK_SESSION_KEY = 'surveyResults.unlocked'
const UNLOCK_PW_KEY = 'surveyResults.unlockPw'
// pilot_role drives the role-filter chips and the form's submit gate; it is
// not exposed in the deactivate-questions toolbar to avoid breaking the form.
const NON_DEACTIVATABLE_IDS = new Set(['pilot_role'])

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

// Heuristic Spanish detection: common short-word hit rate. No API required.
const ES_HINTS = new Set([
  'el', 'la', 'los', 'las', 'de', 'del', 'que', 'no', 'y', 'en', 'es', 'un', 'una',
  'por', 'con', 'para', 'esta', 'esto', 'muy', 'pero', 'mas', 'soy', 'estoy', 'tambien',
  'tener', 'hacer', 'si', 'sí', 'también', 'está', 'más', 'día', 'días', 'semana',
  'trabajo', 'turno', 'piloto', 'cómodo', 'comodo', 'mejor', 'peor', 'mismo', 'misma',
  'horario', 'descanso', 'descansos', 'lentitud', 'latencia', 'entrenamiento', 'oficina',
  'casco', 'app', 'no', 'sin', 'porque', 'cuando', 'todo', 'nada', 'algo',
])

function looksSpanish(text: string): boolean {
  const words = text.toLowerCase().match(/[a-záéíóúñü]+/gi) ?? []
  if (words.length < 4) return false
  const hits = words.filter((w) => ES_HINTS.has(w)).length
  return hits / words.length >= 0.18
}

function translateUrl(text: string): string {
  return `https://translate.google.com/?sl=es&tl=en&op=translate&text=${encodeURIComponent(text)}`
}

export default function SurveyResultsPage() {
  const [unlocked, setUnlocked] = useState<boolean>(() => {
    return sessionStorage.getItem(UNLOCK_SESSION_KEY) === '1'
  })
  const [pwInput, setPwInput] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwSubmitting, setPwSubmitting] = useState(false)
  const [windowKey, setWindowKey] = useState<WindowKey>('30d')
  const [rows, setRows] = useState<SurveyRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [deactivated, setDeactivated] = useState<Set<string>>(new Set())
  const [savingConfig, setSavingConfig] = useState(false)
  const [configError, setConfigError] = useState('')
  const [legacyOpen, setLegacyOpen] = useState<boolean>(() => {
    return localStorage.getItem(LEGACY_OPEN_KEY) === '1'
  })

  useEffect(() => {
    localStorage.setItem(LEGACY_OPEN_KEY, legacyOpen ? '1' : '0')
  }, [legacyOpen])

  const fetchConfig = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/survey/config`)
      if (!r.ok) return
      const data = (await r.json()) as { deactivated_question_ids?: string[] }
      const ids = Array.isArray(data.deactivated_question_ids) ? data.deactivated_question_ids : []
      setDeactivated(new Set(ids))
    } catch {
      // Fail open — don't break the dashboard if config endpoint is down.
    }
  }, [])

  useEffect(() => {
    if (!unlocked) return
    fetchConfig()
  }, [fetchConfig, unlocked])

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
    if (!unlocked) return
    fetchRows()
  }, [fetchRows, unlocked])

  async function attemptUnlock(e: React.FormEvent) {
    e.preventDefault()
    if (!pwInput || pwSubmitting) return
    setPwSubmitting(true)
    setPwError('')
    try {
      const r = await fetch(`${API_BASE}/api/auth/unlock-survey-results`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwInput }),
      })
      if (!r.ok) throw new Error(await r.text())
      const data = (await r.json()) as { ok: boolean }
      if (!data.ok) {
        setPwError('Incorrect password.')
        return
      }
      sessionStorage.setItem(UNLOCK_SESSION_KEY, '1')
      sessionStorage.setItem(UNLOCK_PW_KEY, pwInput)
      setUnlocked(true)
      setPwInput('')
    } catch (err) {
      setPwError(err instanceof Error ? err.message : String(err))
    } finally {
      setPwSubmitting(false)
    }
  }

  function relock() {
    sessionStorage.removeItem(UNLOCK_SESSION_KEY)
    sessionStorage.removeItem(UNLOCK_PW_KEY)
    setUnlocked(false)
    setRows([])
  }

  async function persistDeactivated(next: Set<string>) {
    const pw = sessionStorage.getItem(UNLOCK_PW_KEY)
    if (!pw) {
      setConfigError('Session expired. Please relock and re-enter the password.')
      return
    }
    setSavingConfig(true)
    setConfigError('')
    try {
      const r = await fetch(`${API_BASE}/api/survey/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: pw,
          deactivated_question_ids: [...next],
        }),
      })
      if (!r.ok) {
        const detail = await r.text()
        throw new Error(detail || `HTTP ${r.status}`)
      }
      const data = (await r.json()) as { deactivated_question_ids?: string[] }
      const ids = Array.isArray(data.deactivated_question_ids) ? data.deactivated_question_ids : []
      setDeactivated(new Set(ids))
    } catch (e) {
      setConfigError(e instanceof Error ? e.message : String(e))
      // Roll back optimistic UI by refetching.
      fetchConfig()
    } finally {
      setSavingConfig(false)
    }
  }

  const filteredRows = useMemo(() => {
    if (roleFilter === 'all') return rows
    return rows.filter((r) => r.answers['pilot_role']?.rating === roleFilter)
  }, [rows, roleFilter])

  const stats = useMemo(() => {
    const total = filteredRows.length
    const latest = filteredRows[0]?.inserted_at
    const roleCounts: Record<string, number> = {}
    let spanishCount = 0
    let totalComments = 0
    for (const row of filteredRows) {
      const role = row.answers['pilot_role']?.rating
      if (role) roleCounts[role] = (roleCounts[role] || 0) + 1
      for (const ans of Object.values(row.answers)) {
        if (ans.comment) {
          totalComments++
          if (looksSpanish(ans.comment)) spanishCount++
        }
      }
    }
    return {
      total,
      latest,
      trainees: roleCounts['Trainee Pilot'] || 0,
      dataCollection: roleCounts['Data Collection Pilot'] || 0,
      customer: roleCounts['Customer Pilot'] || 0,
      spanishCount,
      totalComments,
    }
  }, [filteredRows])

  const allQuestions = useMemo(() => {
    return [...QUESTIONS, ...LEGACY_QUESTIONS]
  }, [])

  const perQuestion = useMemo(() => {
    return allQuestions.map((q) => {
      const ratings: Record<string, number> = {}
      const comments: { row: SurveyRow; comment: string }[] = []
      let totalAnswered = 0

      for (const row of filteredRows) {
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
  }, [allQuestions, filteredRows])

  function toggleDeactivated(id: string) {
    if (NON_DEACTIVATABLE_IDS.has(id)) return
    const next = new Set(deactivated)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setDeactivated(next)
    persistDeactivated(next)
  }

  function activateAll() {
    const next = new Set<string>()
    setDeactivated(next)
    persistDeactivated(next)
  }

  if (!unlocked) {
    return (
      <div className="survey-results-page">
        <form className="survey-results-locked" onSubmit={attemptUnlock}>
          <h1>Survey results are locked</h1>
          <p>
            Responses may contain candid feedback. Enter the survey results password to view
            aggregated results.
          </p>
          <input
            type="password"
            className="survey-results-pw"
            placeholder="Password"
            value={pwInput}
            onChange={(e) => setPwInput(e.target.value)}
            autoFocus
          />
          {pwError && <div className="survey-results-pw-error">{pwError}</div>}
          <button
            type="submit"
            className="survey-results-pw-btn"
            disabled={!pwInput || pwSubmitting}
          >
            {pwSubmitting ? 'Checking…' : 'Unlock'}
          </button>
        </form>
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
        <div className="survey-results-header-right">
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
          <button type="button" className="survey-relock-btn" onClick={relock} title="Lock this view">
            Lock
          </button>
        </div>
      </header>

      {error && <div className="survey-error">Couldn't load: {error}</div>}
      {loading && rows.length === 0 && <div className="survey-loading">Loading…</div>}

      <div className="role-filter">
        <span className="role-filter-label">Filter:</span>
        {ROLE_FILTERS.map((rf) => (
          <button
            key={rf.key}
            type="button"
            className={`role-chip${roleFilter === rf.key ? ' active' : ''}`}
            onClick={() => setRoleFilter(rf.key)}
          >
            {rf.label}
          </button>
        ))}
      </div>

      <section className="survey-stats">
        <div className="stat-card">
          <div className="stat-num">{stats.total}</div>
          <div className="stat-label">responses</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{stats.trainees}</div>
          <div className="stat-label">trainees</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{stats.dataCollection}</div>
          <div className="stat-label">data collection</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{stats.customer}</div>
          <div className="stat-label">customer</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{stats.latest ? formatRelative(stats.latest) : '—'}</div>
          <div className="stat-label">most recent</div>
        </div>
      </section>

      <section className="visibility-panel">
        <div className="visibility-head">
          <span className="visibility-title">Questions on the pilot form</span>
          <span className="visibility-meta">
            {QUESTIONS.filter((q) => !NON_DEACTIVATABLE_IDS.has(q.id) && !deactivated.has(q.id)).length}
            {' / '}
            {QUESTIONS.filter((q) => !NON_DEACTIVATABLE_IDS.has(q.id)).length} active
            {savingConfig && <span className="visibility-saving"> · saving…</span>}
          </span>
          {deactivated.size > 0 && (
            <button
              type="button"
              className="visibility-reset"
              onClick={activateAll}
              disabled={savingConfig}
            >
              Activate all
            </button>
          )}
        </div>
        <div className="visibility-hint">
          Click a pill to remove that question from the survey form. Pilots will not see deactivated
          questions; existing responses remain visible below.
        </div>
        {configError && <div className="visibility-error">{configError}</div>}
        <div className="visibility-pills">
          {QUESTIONS.filter((q) => !NON_DEACTIVATABLE_IDS.has(q.id)).map((q) => {
            const active = !deactivated.has(q.id)
            return (
              <button
                key={q.id}
                type="button"
                className={`vis-pill${active ? ' active' : ''}`}
                onClick={() => toggleDeactivated(q.id)}
                disabled={savingConfig}
                title={active ? 'Click to remove from form' : 'Click to add back to form'}
              >
                {q.title}
              </button>
            )
          })}
        </div>
      </section>

      {filteredRows.length === 0 && !loading && !error && (
        <div className="survey-empty">
          No responses in this window. Try widening the time range or changing the role filter, or seed demo data
          with <code>python3 backend/seed_survey.py</code>.
        </div>
      )}

      <section className="survey-questions">
        {perQuestion
          .filter(({ q }) => !q.legacy)
          .map(({ q, totalAnswered, distribution, comments }) =>
            renderQuestionCard(
              q,
              totalAnswered,
              distribution,
              comments,
              expanded,
              setExpanded,
              deactivated.has(q.id),
            ),
          )}
      </section>

      {LEGACY_QUESTIONS.some((q) => perQuestion.find((p) => p.q.id === q.id && p.totalAnswered > 0)) && (
        <section className="legacy-section">
          <button
            type="button"
            className="legacy-toggle"
            onClick={() => setLegacyOpen((v) => !v)}
          >
            <span>{legacyOpen ? '▼' : '▶'}</span> Legacy questions (historical responses only)
          </button>
          {legacyOpen && (
            <div className="survey-questions legacy-questions">
              {perQuestion
                .filter(({ q }) => q.legacy)
                .map(({ q, totalAnswered, distribution, comments }) =>
                  renderQuestionCard(
                    q,
                    totalAnswered,
                    distribution,
                    comments,
                    expanded,
                    setExpanded,
                    deactivated.has(q.id),
                  ),
                )}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function renderQuestionCard(
  q: Question,
  totalAnswered: number,
  distribution: { label: string; count: number; pct: number }[],
  comments: { row: SurveyRow; comment: string }[],
  expanded: Record<string, boolean>,
  setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>,
  isDeactivated: boolean,
) {
  const isOpen = !!expanded[q.id]
  const colors = isRated(q) ? colorsFor(q.options) : SCALE_COLORS_5
  const classNames = ['qcard']
  if (q.legacy) classNames.push('qcard-legacy')
  if (isDeactivated) classNames.push('qcard-deactivated')
  return (
    <article key={q.id} className={classNames.join(' ')}>
      <header className="qcard-head">
        <div className="qcard-title">
          {q.title}
          {isDeactivated && <span className="qcard-deactivated-badge">Hidden from form</span>}
        </div>
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
                {comments.length} {comments.length === 1 ? 'comment' : 'comments'} {isOpen ? '▲' : '▼'}
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
                  background: colors[i] || SCALE_COLORS_5[Math.min(i, SCALE_COLORS_5.length - 1)],
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
                  style={{ background: colors[i] || SCALE_COLORS_5[Math.min(i, SCALE_COLORS_5.length - 1)] }}
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
          {comments.map(({ row, comment }, i) => {
            const spanish = looksSpanish(comment)
            return (
              <li key={`${row.id}-${i}`} className="qcard-comment">
                <div className="qcard-comment-meta">
                  <span className="qcard-comment-pilot">
                    {row.pilot_name?.trim() || 'Anonymous'}
                  </span>
                  <span className="qcard-comment-right">
                    {spanish && (
                      <>
                        <a
                          className="translate-pill"
                          href={translateUrl(comment)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open in Google Translate"
                        >
                          Translate (es→en)
                        </a>
                        <span className="translated-note">(may be translated)</span>
                      </>
                    )}
                    <span className="qcard-comment-date">
                      {formatDate(row.inserted_at)}
                    </span>
                  </span>
                </div>
                <div className="qcard-comment-body">{comment}</div>
              </li>
            )
          })}
        </ul>
      )}
    </article>
  )
}
