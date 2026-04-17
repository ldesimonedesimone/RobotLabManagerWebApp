import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { EditModeProvider, useEditMode } from './EditModeContext'
import './Layout.css'

function LockToggle() {
  const { isEditMode, unlock, lock } = useEditMode()
  const [showPrompt, setShowPrompt] = useState(false)
  const [pw, setPw] = useState('')
  const [error, setError] = useState(false)

  const handleUnlock = async () => {
    const ok = await unlock(pw)
    if (ok) {
      setShowPrompt(false)
      setPw('')
      setError(false)
    } else {
      setError(true)
    }
  }

  if (isEditMode) {
    return (
      <button type="button" className="lock-toggle lock-open" onClick={lock} title="Lock editing">
        🔓 Edit mode
      </button>
    )
  }

  if (showPrompt) {
    return (
      <span className="lock-prompt">
        <input
          type="password"
          className="lock-pw-input"
          value={pw}
          onChange={(e) => { setPw(e.target.value); setError(false) }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleUnlock() }}
          placeholder="Password"
          autoFocus
        />
        <button type="button" className="lock-pw-btn" onClick={handleUnlock}>Go</button>
        <button type="button" className="lock-pw-cancel" onClick={() => { setShowPrompt(false); setPw(''); setError(false) }}>✕</button>
        {error && <span className="lock-pw-err">Wrong password</span>}
      </span>
    )
  }

  return (
    <button type="button" className="lock-toggle lock-closed" onClick={() => setShowPrompt(true)} title="Unlock editing">
      🔒 View only
    </button>
  )
}

export default function Layout() {
  return (
    <EditModeProvider>
      <div className="shell">
        <nav className="shell-topbar">
          <LockToggle />
        </nav>
        <Outlet />
      </div>
    </EditModeProvider>
  )
}
