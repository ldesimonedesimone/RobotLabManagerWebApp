import { useMemo, useState } from 'react'
import { API_BASE } from '../scheduleApi'
import './SurveyPage.css'

const SATISFACTION = ['Very satisfied', 'Satisfied', 'Neutral', 'Unsatisfied', 'Very unsatisfied'] as const
const MANAGEABLE = ['Very manageable', 'Manageable', 'Neutral', 'Unmanageable', 'Very unmanageable'] as const
const WELL = ['Very well', 'Well', 'Neutral', 'Poorly', 'Very poorly'] as const

type RatedQuestion = {
  id: string
  title: string
  options: readonly string[]
  commentPrompt: string | null
}

type TextQuestion = {
  id: string
  title: string
  textOnly: true
  placeholder?: string
}

type Question = RatedQuestion | TextQuestion

const QUESTIONS: Question[] = [
  {
    id: 'job_satisfaction',
    title: 'How satisfied are you with your job as an Ultra Pilot overall?',
    options: SATISFACTION,
    commentPrompt: null,
  },
  {
    id: 'teleop_experience',
    title: 'How satisfied are you with the teleoperation experience overall?',
    options: SATISFACTION,
    commentPrompt: 'Any specific comments?',
  },
  {
    id: 'ultra_app',
    title: 'How satisfied are you with the Ultra app overall?',
    options: SATISFACTION,
    commentPrompt: 'Any specific comments?',
  },
  {
    id: 'shift_schedule_breaks',
    title: 'How satisfied are you with shift scheduling and breaks while at work?',
    options: SATISFACTION,
    commentPrompt: 'Any specific comments?',
  },
  {
    id: 'leaderboard_badges',
    title: 'How satisfied are you with pilot leaderboard and badge functionality in the web app?',
    options: SATISFACTION,
    commentPrompt: 'Any specific comments?',
  },
  {
    id: 'office_equipment',
    title: 'How satisfied are you with the equipment in the office (chairs, computers, headsets, etc.)?',
    options: SATISFACTION,
    commentPrompt: 'Any specific comments?',
  },
  {
    id: 'training_program',
    title: 'How satisfied are you with pilot training program?',
    options: SATISFACTION,
    commentPrompt: 'Any specific comments?',
  },
  {
    id: 'physical_demand',
    title:
      'How manageable is the physical demand of operating (headset fatigue, eye strain, break frequency) during a typical shift?',
    options: MANAGEABLE,
    commentPrompt: 'What specifically could be improved?',
  },
  {
    id: 'ultra_growth_support',
    title: 'How well does Ultra support your growth and recognize your performance as a pilot?',
    options: WELL,
    commentPrompt: 'Anything specific that can be improved?',
  },
  {
    id: 'remotics_growth_support',
    title: 'How well does Remotics support your growth and recognize your performance as a pilot?',
    options: WELL,
    commentPrompt: 'Anything specific that can be improved?',
  },
  {
    id: 'anything_else',
    title: 'Anything else on your mind?',
    textOnly: true,
    placeholder: 'Open the floor: praise, frustrations, ideas, anything at all.',
  },
]

type AnswerEntry = { rating?: string; comment?: string }
type Answers = Record<string, AnswerEntry>

function isRated(q: Question): q is RatedQuestion {
  return !('textOnly' in q)
}

export default function SurveyPage() {
  const [pilotName, setPilotName] = useState('')
  const [answers, setAnswers] = useState<Answers>({})
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const hasAnyAnswer = useMemo(() => {
    return Object.values(answers).some(
      (a) => (a.rating && a.rating.trim()) || (a.comment && a.comment.trim()),
    )
  }, [answers])

  function setRating(qid: string, value: string) {
    setAnswers((prev) => ({ ...prev, [qid]: { ...prev[qid], rating: value } }))
  }

  function setComment(qid: string, value: string) {
    setAnswers((prev) => ({ ...prev, [qid]: { ...prev[qid], comment: value } }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!hasAnyAnswer || status === 'submitting') return
    setStatus('submitting')
    setErrorMsg('')
    try {
      const r = await fetch(`${API_BASE}/api/survey/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pilot_name: pilotName.trim() || null,
          answers,
        }),
      })
      if (!r.ok) {
        const t = await r.text()
        throw new Error(t || r.statusText)
      }
      setStatus('done')
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : String(err))
    }
  }

  function reset() {
    setPilotName('')
    setAnswers({})
    setStatus('idle')
    setErrorMsg('')
  }

  if (status === 'done') {
    return (
      <div className="survey-page">
        <div className="survey-card survey-done">
          <h1>Thanks for the feedback</h1>
          <p>
            Your responses were recorded. Honest input is how this place gets better — appreciated.
          </p>
          <button type="button" className="survey-btn" onClick={reset}>
            Submit another
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="survey-page">
      <form className="survey-card" onSubmit={handleSubmit}>
        <h1>Pilot survey</h1>
        <p className="survey-lead">
          Eleven short questions. Skip anything that doesn't apply. Name is optional —
          submit anonymously if you prefer.
        </p>

        <div className="survey-field">
          <label htmlFor="pilot-name" className="survey-field-label">
            Your name <span className="survey-optional">(optional)</span>
          </label>
          <input
            id="pilot-name"
            type="text"
            className="survey-input"
            value={pilotName}
            onChange={(e) => setPilotName(e.target.value)}
            placeholder="e.g. Sebastian"
            maxLength={120}
          />
        </div>

        {QUESTIONS.map((q, idx) => (
          <fieldset className="survey-q" key={q.id}>
            <legend className="survey-q-title">
              <span className="survey-q-num">{idx + 1}.</span> {q.title}
            </legend>

            {isRated(q) ? (
              <>
                <div className="survey-options">
                  {q.options.map((opt) => {
                    const selected = answers[q.id]?.rating === opt
                    return (
                      <label
                        key={opt}
                        className={`survey-option${selected ? ' selected' : ''}`}
                      >
                        <input
                          type="radio"
                          name={q.id}
                          value={opt}
                          checked={selected}
                          onChange={() => setRating(q.id, opt)}
                        />
                        <span>{opt}</span>
                      </label>
                    )
                  })}
                </div>
                {q.commentPrompt && (
                  <div className="survey-comment">
                    <label className="survey-comment-label" htmlFor={`${q.id}-comment`}>
                      {q.commentPrompt}
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
                placeholder={q.placeholder}
                value={answers[q.id]?.comment ?? ''}
                onChange={(e) => setComment(q.id, e.target.value)}
              />
            )}
          </fieldset>
        ))}

        {status === 'error' && (
          <div className="survey-error">Couldn't submit: {errorMsg || 'unknown error'}</div>
        )}

        <div className="survey-actions">
          <button type="submit" className="survey-btn" disabled={!hasAnyAnswer || status === 'submitting'}>
            {status === 'submitting' ? 'Submitting…' : 'Submit responses'}
          </button>
        </div>
      </form>
    </div>
  )
}
