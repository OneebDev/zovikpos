import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function ModalShell({
  isOpen,
  onClose,
  children,
  labelledBy,
  ariaLabel,
  closeOnBackdrop = true,
  closeOnEscape = true,
  className = '',
}) {
  const panelRef = useRef(null)
  const [isPresent, setIsPresent] = useState(isOpen)
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setIsPresent(true)
      setIsExiting(false)
      return undefined
    }
    if (!isPresent) return undefined

    setIsExiting(true)
    const exitTimer = window.setTimeout(() => {
      setIsPresent(false)
      setIsExiting(false)
    }, 200)
    return () => window.clearTimeout(exitTimer)
  }, [isOpen, isPresent])

  useEffect(() => {
    if (!isOpen) return undefined

    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const panel = panelRef.current
    const firstFocusable = panel?.querySelector(FOCUSABLE)
    ;(firstFocusable || panel)?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        if (!closeOnEscape) return
        event.preventDefault()
        onClose?.()
        return
      }

      if (event.key !== 'Tab' || !panel) return
      const focusable = [...panel.querySelectorAll(FOCUSABLE)]
      if (!focusable.length) {
        event.preventDefault()
        panel.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      if (previousFocus instanceof HTMLElement) previousFocus.focus()
    }
  }, [isOpen, onClose, closeOnEscape])

  if (!isPresent) return null

  return createPortal(
    <div
      className={`zovik-modal-backdrop${isExiting ? ' is-exiting' : ''}`}
      aria-hidden={isExiting || undefined}
      onMouseDown={(event) => {
        if (isOpen && closeOnBackdrop && event.target === event.currentTarget) onClose?.()
      }}
    >
      <section
        ref={panelRef}
        className={`zovik-modal-panel ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={ariaLabel}
        tabIndex={-1}
      >
        {children}
      </section>
    </div>,
    document.body,
  )
}

export default ModalShell
