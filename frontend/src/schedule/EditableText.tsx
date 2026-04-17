import { useEffect, useRef, useState } from 'react'

type Props = {
  value: string
  onChange: (v: string) => void
  className?: string
  doubleClick?: boolean
  disabled?: boolean
}

export default function EditableText({
  value,
  onChange,
  className,
  doubleClick,
  disabled,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDraft(value)
  }, [value])

  useEffect(() => {
    if (editing) ref.current?.select()
  }, [editing])

  if (!editing) {
    const handler = (e: React.MouseEvent) => {
      if (disabled) return
      e.stopPropagation()
      setEditing(true)
    }
    return (
      <span
        className={`sched-editable ${className ?? ''}`}
        {...(doubleClick ? { onDoubleClick: handler } : { onClick: handler })}
        title={doubleClick ? 'Double-click to rename' : 'Click to rename'}
      >
        {value}
      </span>
    )
  }

  return (
    <input
      ref={ref}
      className={`sched-editable-input ${className ?? ''}`}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => {
        setEditing(false)
        const t = draft.trim()
        if (t && t !== value) onChange(t)
        else setDraft(value)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setDraft(value)
          setEditing(false)
        }
      }}
    />
  )
}
