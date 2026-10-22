function Chip({ variant = 'default', className = '', children, ...props }) {
  const chipClass = `zovik-chip zovik-chip--${variant} ${className}`.trim()
  return <span {...props} className={chipClass}>{children}</span>
}

export function Badge(props) {
  return <Chip {...props} />
}

export default Chip
