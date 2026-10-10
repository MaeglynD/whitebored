import { memo, useLayoutEffect, useRef } from 'react'
import type { TLCursorProps } from 'tldraw'

/** Interpolate between presence packets locally, without increasing network traffic. */
export const CollaboratorCursor = memo(function CollaboratorCursor({
  point,
  zoom,
  color = '#6876d9',
  name,
  className,
}: TLCursorProps) {
  const element = useRef<HTMLDivElement>(null)
  const position = useRef<{ x: number; y: number } | null>(null)
  const target = useRef({ point, zoom })
  const frame = useRef(0)
  useLayoutEffect(() => {
    target.current = { point, zoom }
    cancelAnimationFrame(frame.current)
    if (!point || !element.current) {
      position.current = null
      return
    }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (
      !position.current ||
      reduced ||
      Math.hypot(position.current.x - point.x, position.current.y - point.y) * zoom > 1200
    )
      position.current = { ...point }
    let previous = performance.now()
    const tick = (now: number) => {
      const destination = target.current.point,
        current = position.current
      if (!destination || !current || !element.current) return
      const amount = 1 - Math.exp(-Math.min(now - previous, 64) / 35)
      previous = now
      current.x += (destination.x - current.x) * amount
      current.y += (destination.y - current.y) * amount
      const done =
        Math.hypot(destination.x - current.x, destination.y - current.y) * target.current.zoom <
        0.15
      if (done) {
        current.x = destination.x
        current.y = destination.y
      }
      element.current.style.transform = `translate(${current.x}px, ${current.y}px) scale(${1 / target.current.zoom})`
      if (!done) frame.current = requestAnimationFrame(tick)
    }
    tick(performance.now())
    return () => cancelAnimationFrame(frame.current)
  }, [point?.x, point?.y, zoom])
  if (!point) return null
  return (
    <div
      ref={element}
      className={`tl-collaborators__item whitebored-cursor ${className || ''}`}
      style={{ color }}
    >
      <svg width="20" height="24" viewBox="0 0 20 24" aria-hidden="true">
        <path
          d="M2 2 L17 13 L10 14 L7 21 Z"
          fill="currentColor"
          stroke="white"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      <span className="collaborator-name" style={{ background: color }}>
        {name?.trim() || 'Guest'}
      </span>
    </div>
  )
})
