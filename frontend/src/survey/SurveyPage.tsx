import { useEffect, useMemo, useRef, useState } from 'react'
import { API_BASE } from '../scheduleApi'
import { t, type Lang } from './strings'
import './SurveyPage.css'

type ScaleKey =
  | 'PILOT_ROLE'
  | 'SATISFACTION'
  | 'MANAGEABLE'
  | 'WELL'
  | 'HEADSET_APP'
  | 'LATENCY_WOW'
  | 'SCHEDULING'
  | 'COMFORT'
  | 'TRAINING'

type ScaleOption = { value: string; labelKey: string }

const SCALES: Record<ScaleKey, ScaleOption[]> = {
  PILOT_ROLE: [
    { value: 'Trainee Pilot', labelKey: 'role_trainee' },
    { value: 'Data Collection Pilot', labelKey: 'role_data_collection' },
    { value: 'Customer Pilot', labelKey: 'role_customer' },
  ],
  SATISFACTION: [
    { value: 'Very satisfied', labelKey: 'sat_vsat' },
    { value: 'Satisfied', labelKey: 'sat_sat' },
    { value: 'Neutral', labelKey: 'sat_neu' },
    { value: 'Unsatisfied', labelKey: 'sat_uns' },
    { value: 'Very unsatisfied', labelKey: 'sat_vuns' },
  ],
  MANAGEABLE: [
    { value: 'Very manageable', labelKey: 'man_vman' },
    { value: 'Manageable', labelKey: 'man_man' },
    { value: 'Neutral', labelKey: 'man_neu' },
    { value: 'Unmanageable', labelKey: 'man_unman' },
    { value: 'Very unmanageable', labelKey: 'man_vunman' },
  ],
  WELL: [
    { value: 'Very well', labelKey: 'well_vwell' },
    { value: 'Well', labelKey: 'well_well' },
    { value: 'Neutral', labelKey: 'well_neu' },
    { value: 'Poorly', labelKey: 'well_poor' },
    { value: 'Very poorly', labelKey: 'well_vpoor' },
  ],
  HEADSET_APP: [
    { value: 'Worked great', labelKey: 'hs_great' },
    { value: 'Worked well', labelKey: 'hs_well' },
    { value: 'Some issues', labelKey: 'hs_some' },
    { value: 'Lots of issues', labelKey: 'hs_lots' },
    { value: "Couldn't use it", labelKey: 'hs_unusable' },
  ],
  LATENCY_WOW: [
    { value: 'Better than last week', labelKey: 'lat_better' },
    { value: 'Same as last week', labelKey: 'lat_same' },
    { value: 'Worse than last week', labelKey: 'lat_worse' },
  ],
  SCHEDULING: [
    { value: 'Worked great', labelKey: 'sch_great' },
    { value: 'Worked well', labelKey: 'sch_well' },
    { value: 'Neutral', labelKey: 'sch_neu' },
    { value: 'Clunky', labelKey: 'sch_clunky' },
    { value: 'Broken', labelKey: 'sch_broken' },
  ],
  COMFORT: [
    { value: 'Very comfortable', labelKey: 'cmf_vcomf' },
    { value: 'Comfortable', labelKey: 'cmf_comf' },
    { value: 'Neutral', labelKey: 'cmf_neu' },
    { value: 'Uncomfortable', labelKey: 'cmf_uncomf' },
    { value: 'Very uncomfortable', labelKey: 'cmf_vuncomf' },
  ],
  TRAINING: [
    { value: 'Very well', labelKey: 'trn_vwell' },
    { value: 'Well', labelKey: 'trn_well' },
    { value: 'Neutral', labelKey: 'trn_neu' },
    { value: 'Poorly', labelKey: 'trn_poor' },
    { value: 'Very poorly', labelKey: 'trn_vpoor' },
    { value: "Doesn't apply to me", labelKey: 'trn_na' },
  ],
}

type RatedQuestion = {
  id: string
  titleKey: string
  scale: ScaleKey
  commentKey: string | null
  required?: boolean
}

type TextQuestion = {
  id: string
  titleKey: string
  textOnly: true
  placeholderKey: string
}

type Question = RatedQuestion | TextQuestion

const QUESTIONS: Question[] = [
  { id: 'pilot_role', titleKey: 'q_pilot_role', scale: 'PILOT_ROLE', commentKey: null, required: true },
  { id: 'job_satisfaction', titleKey: 'q_job_satisfaction', scale: 'SATISFACTION', commentKey: 'comment_any' },
  { id: 'teleop_experience', titleKey: 'q_teleop_experience', scale: 'SATISFACTION', commentKey: 'comment_any' },
  { id: 'headset_app', titleKey: 'q_headset_app', scale: 'HEADSET_APP', commentKey: 'comment_any' },
  { id: 'latency_wow', titleKey: 'q_latency_wow', scale: 'LATENCY_WOW', commentKey: 'comment_latency' },
  { id: 'shift_schedule', titleKey: 'q_shift_schedule', scale: 'SCHEDULING', commentKey: 'comment_any' },
  { id: 'leaderboard_badges', titleKey: 'q_leaderboard_badges', scale: 'SATISFACTION', commentKey: 'comment_any' },
  { id: 'comfort_overall', titleKey: 'q_comfort_overall', scale: 'COMFORT', commentKey: 'comment_any' },
  { id: 'training_program', titleKey: 'q_training_program', scale: 'TRAINING', commentKey: 'comment_any' },
  { id: 'physical_demand', titleKey: 'q_physical_demand', scale: 'MANAGEABLE', commentKey: 'comment_improve' },
  { id: 'growth_support', titleKey: 'q_growth_support', scale: 'WELL', commentKey: 'comment_anything_improve' },
  { id: 'anything_else', titleKey: 'q_anything_else', textOnly: true, placeholderKey: 'q_anything_else_placeholder' },
]

type AnswerEntry = { rating?: string; comment?: string }
type Answers = Record<string, AnswerEntry>

function isRated(q: Question): q is RatedQuestion {
  return !('textOnly' in q)
}

const LANG_STORAGE_KEY = 'survey.lang'
const CONFETTI_PIECES = 18

// RGB triplets used as `--answer-rgb` CSS variable for per-answer glow/label/check tints.
const ANSWER_COLORS: string[] = [
  '0, 212, 170',   // teal
  '94, 234, 212',  // mint
  '251, 191, 36',  // amber
  '244, 114, 182', // pink
  '167, 139, 250', // violet
  '96, 165, 250',  // blue
  '74, 222, 128',  // green
  '248, 113, 113', // coral
]

function pickAnswerColor(prev: string | undefined): string {
  if (ANSWER_COLORS.length <= 1) return ANSWER_COLORS[0]
  let next = ANSWER_COLORS[Math.floor(Math.random() * ANSWER_COLORS.length)]
  if (next === prev) {
    // avoid back-to-back same color
    next = ANSWER_COLORS[(ANSWER_COLORS.indexOf(next) + 1) % ANSWER_COLORS.length]
  }
  return next
}

export default function SurveyPage() {
  const [lang, setLang] = useState<Lang>(() => {
    const stored = (typeof window !== 'undefined' && localStorage.getItem(LANG_STORAGE_KEY)) || 'en'
    return stored === 'es' ? 'es' : 'en'
  })
  const [answers, setAnswers] = useState<Answers>({})
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [justAnswered, setJustAnswered] = useState<Record<string, number>>({})
  const [answerColor, setAnswerColor] = useState<Record<string, string>>({})
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    localStorage.setItem(LANG_STORAGE_KEY, lang)
  }, [lang])

  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach((id) => clearTimeout(id))
    }
  }, [])

  const ratedAnswered = useMemo(() => {
    return QUESTIONS.filter((q) => isRated(q) && answers[q.id]?.rating).length
  }, [answers])

  const ratedTotal = useMemo(() => QUESTIONS.filter(isRated).length, [])

  const progressPct = ratedTotal ? Math.round((ratedAnswered / ratedTotal) * 100) : 0

  const hasRole = !!answers['pilot_role']?.rating
  const hasAnyOther = useMemo(() => {
    return Object.entries(answers).some(
      ([qid, a]) => qid !== 'pilot_role' && ((a.rating && a.rating.trim()) || (a.comment && a.comment.trim())),
    )
  }, [answers])
  const canSubmit = hasRole && hasAnyOther

  function setRating(qid: string, value: string) {
    setAnswers((prev) => ({ ...prev, [qid]: { ...prev[qid], rating: value } }))
    setAnswerColor((prev) => ({ ...prev, [qid]: pickAnswerColor(prev[qid]) }))
    setJustAnswered((prev) => ({ ...prev, [qid]: (prev[qid] || 0) + 1 }))
    if (timersRef.current[qid]) clearTimeout(timersRef.current[qid])
    timersRef.current[qid] = setTimeout(() => {
      setJustAnswered((prev) => {
        const next = { ...prev }
        delete next[qid]
        return next
      })
    }, 750)
  }

  function setComment(qid: string, value: string) {
    setAnswers((prev) => ({ ...prev, [qid]: { ...prev[qid], comment: value } }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || status === 'submitting') return
    setStatus('submitting')
    setErrorMsg('')
    try {
      const r = await fetch(`${API_BASE}/api/survey/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pilot_name: null, answers }),
      })
      if (!r.ok) {
        const body = await r.text()
        throw new Error(body || r.statusText)
      }
      setStatus('done')
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : String(err))
    }
  }

  function reset() {
    setAnswers({})
    setStatus('idle')
    setErrorMsg('')
    setJustAnswered({})
  }

  if (status === 'done') {
    return (
      <div className="survey-page">
        <div className="survey-card survey-done">
          <div className="confetti" aria-hidden="true">
            {Array.from({ length: CONFETTI_PIECES }).map((_, i) => (
              <span key={i} className={`confetti-piece c${i % 6}`} style={{ ['--i' as string]: i }} />
            ))}
          </div>
          <h1>{t(lang, 'thanks_title')}</h1>
          <p>{t(lang, 'thanks_body')}</p>
          <button type="button" className="survey-btn" onClick={reset}>
            {t(lang, 'submit_another')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="survey-page">
      <form className="survey-card" onSubmit={handleSubmit}>
        <header className="survey-header">
          <h1>{t(lang, 'page_title')}</h1>
          <div className="lang-toggle" role="group" aria-label={t(lang, 'lang_toggle_aria')}>
            <button
              type="button"
              className={`lang-btn${lang === 'en' ? ' active' : ''}`}
              onClick={() => setLang('en')}
            >
              {t(lang, 'lang_en')}
            </button>
            <button
              type="button"
              className={`lang-btn${lang === 'es' ? ' active' : ''}`}
              onClick={() => setLang('es')}
            >
              {t(lang, 'lang_es')}
            </button>
          </div>
        </header>

        <p className="survey-lead">{t(lang, 'page_lead')}</p>

        <div className="survey-progress" aria-hidden="true">
          <div className="survey-progress-bar" style={{ width: `${progressPct}%` }} />
          <div className="survey-progress-text">
            {ratedAnswered} / {ratedTotal} {t(lang, 'progress')}
          </div>
        </div>

        {QUESTIONS.map((q, idx) => {
          const pulse = justAnswered[q.id] || 0
          const rgb = answerColor[q.id]
          const fsStyle = rgb ? ({ ['--answer-rgb' as string]: rgb } as React.CSSProperties) : undefined
          return (
            <fieldset
              className={`survey-q${pulse ? ' just-answered' : ''}`}
              key={q.id}
              style={fsStyle}
            >
              <legend className="survey-q-title">
                <span className="survey-q-num">{idx + 1}.</span> {t(lang, q.titleKey)}
                {isRated(q) && q.required && <span className="survey-required"> *</span>}
              </legend>

              {isRated(q) ? (
                <>
                  <div className="survey-options">
                    {SCALES[q.scale].map((opt) => {
                      const selected = answers[q.id]?.rating === opt.value
                      return (
                        <label
                          key={opt.value}
                          className={`survey-option${selected ? ' selected' : ''}`}
                        >
                          <input
                            type="radio"
                            name={q.id}
                            value={opt.value}
                            checked={selected}
                            onChange={() => setRating(q.id, opt.value)}
                          />
                          <span className="survey-option-label" key={selected ? `s-${pulse}` : 'u'}>
                            {t(lang, opt.labelKey)}
                          </span>
                          {selected && (
                            <svg
                              className="survey-check"
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                              key={`check-${pulse}`}
                            >
                              <path d="M5 12l4 4 10-10" />
                            </svg>
                          )}
                        </label>
                      )
                    })}
                  </div>
                  {q.commentKey && (
                    <div className="survey-comment">
                      <label className="survey-comment-label" htmlFor={`${q.id}-comment`}>
                        {t(lang, q.commentKey)}
                      </label>
                      <textarea
                        id={`${q.id}-comment`}
                        className="survey-textarea"
                        rows={3}
                        maxLength={4000}
                        value={answers[q.id]?.comment ?? ''}
                        onChange={(e) => setComment(q.id, e.target.value)}
                      />
                    </div>
                  )}
                </>
              ) : (
                <textarea
                  className="survey-textarea"
                  rows={5}
                  maxLength={4000}
                  placeholder={t(lang, q.placeholderKey)}
                  value={answers[q.id]?.comment ?? ''}
                  onChange={(e) => setComment(q.id, e.target.value)}
                />
              )}
            </fieldset>
          )
        })}

        {status === 'error' && (
          <div className="survey-error">
            {t(lang, 'error_prefix')} {errorMsg || t(lang, 'unknown_error')}
          </div>
        )}

        <div className="survey-actions">
          {!hasRole && (
            <div className="survey-submit-hint">{t(lang, 'submit_disabled_role')}</div>
          )}
          <button
            type="submit"
            className="survey-btn"
            disabled={!canSubmit || status === 'submitting'}
          >
            {status === 'submitting' ? t(lang, 'submitting') : t(lang, 'submit')}
          </button>
        </div>
      </form>
    </div>
  )
}
