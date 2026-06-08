import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './Layout'
import PilotDashboard from './PilotDashboard'
import ScheduleEditor from './schedule/ScheduleEditor'
import ScheduleHome from './schedule/ScheduleHome'
import RosterPage from './schedule/RosterPage'
import WeekbyWeekFlow from './weekbyweek/WeekbyWeekFlow'
import SurveyPage from './survey/SurveyPage'
import SurveyResultsPage from './survey/SurveyResultsPage'
import LabSupportDashboard from './labsupport/LabSupportDashboard'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/schedule" replace />} />
          <Route path="/pilot" element={<PilotDashboard />} />
          <Route path="/weekbyweekflow" element={<WeekbyWeekFlow />} />
          <Route path="/schedule" element={<ScheduleHome />} />
          <Route path="/schedule/roster" element={<RosterPage />} />
          <Route path="/schedule/shift/:shift/:day" element={<ScheduleEditor />} />
          <Route path="/survey" element={<SurveyPage />} />
          <Route path="/survey/results" element={<SurveyResultsPage />} />
          <Route path="/lab-support" element={<LabSupportDashboard />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
