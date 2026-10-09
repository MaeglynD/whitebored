import { useEffect, useRef, useState } from 'react'
import type { Board } from './storage'
import { hasCurrentPreviews, queuePreview } from './previews'

export function BoardThumbnail({ board, theme }: { board: Board; theme: 'light' | 'dark' }) {
  const element = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [failed, setFailed] = useState('')
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      root: element.current?.closest('.boards-scroll'),
      rootMargin: '160px',
    })
    if (element.current) observer.observe(element.current)
    return () => observer.disconnect()
  }, [])
  const cached = hasCurrentPreviews(board)
  useEffect(() => {
    if (!visible || cached) return
    let live = true
    setFailed('')
    const timer = setTimeout(() => {
      void queuePreview(board).catch((error) => {
        if (live) setFailed(error instanceof Error ? error.message : 'Preview unavailable')
      })
    }, 500)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [visible, cached, board.id, board.revision, board.session?.currentPageId])
  const image = board.previews?.[theme]
  return (
    <div ref={element} className="board-thumbnail" data-theme={theme} title={failed || undefined}>
      {image ? (
        <img src={image} alt="" loading="lazy" />
      ) : (
        <div className="blank-preview">
          {cached ? <span /> : <small>{failed ? 'Preview unavailable' : 'Loading preview…'}</small>}
        </div>
      )}
    </div>
  )
}
