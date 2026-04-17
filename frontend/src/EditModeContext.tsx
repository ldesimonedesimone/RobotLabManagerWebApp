import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { API_BASE } from './scheduleApi'

type EditModeCtx = {
  isEditMode: boolean
  unlock: (password: string) => Promise<boolean>
  lock: () => void
}

const EditModeContext = createContext<EditModeCtx>({
  isEditMode: false,
  unlock: async () => false,
  lock: () => {},
})

export function EditModeProvider({ children }: { children: ReactNode }) {
  const [isEditMode, setIsEditMode] = useState(false)

  const unlock = useCallback(async (password: string): Promise<boolean> => {
    try {
      const r = await fetch(`${API_BASE}/api/auth/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!r.ok) return false
      const data = (await r.json()) as { ok: boolean }
      if (data.ok) setIsEditMode(true)
      return data.ok
    } catch {
      return false
    }
  }, [])

  const lock = useCallback(() => setIsEditMode(false), [])

  return (
    <EditModeContext.Provider value={{ isEditMode, unlock, lock }}>
      {children}
    </EditModeContext.Provider>
  )
}

export function useEditMode() {
  return useContext(EditModeContext)
}
