import { forwardRef } from 'react'

const Button = forwardRef(function Button({
  variant = 'primary',
  loading = false,
  disabled = false,
  type = 'button',
  className = '',
  children,
  ...props
}, ref) {
  const buttonClass = `zovik-button zovik-button--${variant} ${className}`.trim()

  return (
    <button
      {...props}
      ref={ref}
      type={type}
      className={buttonClass}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      <span className={`zovik-button__content${loading ? ' zovik-button__content--hidden' : ''}`}>
        {children}
      </span>
      {loading && (
        <span className="zovik-button__loader" aria-hidden="true">
          <span className="zovik-button__spinner" />
        </span>
      )}
    </button>
  )
})

export default Button
