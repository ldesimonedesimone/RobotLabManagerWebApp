import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './Layout'
import PilotDashboard from './PilotDashboard'
import ScheduleEditor from './schedule/ScheduleEditor'
import ScheduleHome from './schedule/ScheduleHome'
import WeekbyWeekFlow from './weekbyweek/WeekbyWeekFlow'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/schedule" replace />} />
          <Route path="/pilot" element={<PilotDashboard />} />
          <Route path="/weekbyweekflow" element={<WeekbyWeekFlow />} />
          <Route path="/schedule" element={<ScheduleHome />} />
          <Route path="/schedule/shift/:shift/:day" element={<ScheduleEditor />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
