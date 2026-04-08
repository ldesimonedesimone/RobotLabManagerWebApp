import { NavLink, Outlet } from 'react-router-dom'
import './Layout.css'

export default function Layout() {
  return (
    <div className="shell">
      <nav className="shell-nav" aria-label="Primary">
        <NavLink
          to="/pilot"
          className={({ isActive }) => (isActive ? 'shell-link active' : 'shell-link')}
          end
        >
          Pilot data
        </NavLink>
        <NavLink
          to="/weekly"
          className={({ isActive }) => (isActive ? 'shell-link active' : 'shell-link')}
        >
          Week-by-week flow
        </NavLink>
        <NavLink
          to="/schedule"
          className={({ isActive }) => (isActive ? 'shell-link active' : 'shell-link')}
        >
          Schedule builder
        </NavLink>
      </nav>
      <Outlet />
    </div>
  )
}
