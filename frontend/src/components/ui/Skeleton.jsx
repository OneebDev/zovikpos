function Skeleton({ className = '', width, height, ...props }) {
  return (
    <span
      {...props}
      aria-hidden="true"
      className={`skeleton zovik-skeleton ${className}`.trim()}
      style={{ width, height, ...props.style }}
    />
  )
}

export default Skeleton
