import { Link } from 'react-router-dom'
import './schedule.css'

function SlotButton({
  shift,
  day,
  label,
}: {
  shift: number
  day: 'today' | 'tomorrow'
  label: string
}) {
  return (
    <Link
      className="sched-home-btn"
      to={`/schedule/shift/${shift}/${day}`}
    >
      {label}
    </Link>
  )
}

export default function ScheduleHome() {
  return (
    <div className="sched-page sched-home">
      <h1 className="sched-title">Schedule builder</h1>
      <p className="sched-lead">
        Pick a shift and day. Each slot has its own saved schedule.
      </p>
      <div className="sched-home-grid">
        <section className="sched-shift-block">
          <h2>Shift 1</h2>
          <div className="sched-home-btns">
            <SlotButton shift={1} day="today" label="Today" />
            <SlotButton shift={1} day="tomorrow" label="Tomorrow" />
          </div>
        </section>
        <section className="sched-shift-block">
          <h2>Shift 2</h2>
          <div className="sched-home-btns">
            <SlotButton shift={2} day="today" label="Today" />
            <SlotButton shift={2} day="tomorrow" label="Tomorrow" />
          </div>
        </section>
        <section className="sched-shift-block">
          <h2>Shift 3</h2>
          <div className="sched-home-btns">
            <SlotButton shift={3} day="today" label="Today" />
            <SlotButton shift={3} day="tomorrow" label="Tomorrow" />
          </div>
        </section>
      </div>
    </div>
  )
}
