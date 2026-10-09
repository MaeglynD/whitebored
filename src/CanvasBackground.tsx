import { createContext, useContext } from 'react'
import { DefaultBackground, DefaultGrid, useEditor, useValue } from 'tldraw'

export const GridVisibility = createContext(false)

/** Showing reference dots must not silently turn on grid snapping. */
export function CanvasBackground() {
  const editor = useEditor()
  const visible = useContext(GridVisibility)
  const camera = useValue('grid camera', () => editor.getCamera(), [editor])
  const size = useValue('grid spacing', () => editor.getDocumentSettings().gridSize, [editor])
  return (
    <>
      <DefaultBackground />
      {visible && <DefaultGrid {...camera} size={size} />}
    </>
  )
}
