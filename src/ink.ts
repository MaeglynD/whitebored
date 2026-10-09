import {
  DefaultColorStyle,
  DefaultSizeStyle,
  type Editor,
  type TLDrawShape,
  type TLDefaultColorStyle,
} from 'tldraw'
export const palette = [
  { key: 'black', name: 'Ink', light: '#292e39', dark: '#e8ebf1' },
  { key: 'grey', name: 'Slate', light: '#9299aa', dark: '#9299aa' },
  { key: 'red', name: 'Coral', light: '#dc626d', dark: '#f08088' },
  { key: 'orange', name: 'Amber', light: '#c9903c', dark: '#eab46a' },
  { key: 'yellow', name: 'Yellow', light: '#c6ad3f', dark: '#edcf6d' },
  { key: 'green', name: 'Jade', light: '#319982', dark: '#72cbb4' },
  { key: 'light-blue', name: 'Sky', light: '#4fabc6', dark: '#77cce5' },
  { key: 'blue', name: 'Blue', light: '#5275da', dark: '#90aafb' },
  { key: 'violet', name: 'Violet', light: '#9671cd', dark: '#bc9dea' },
  { key: 'light-red', name: 'Rose', light: '#c678a8', dark: '#e6a7d1' },
] as const
export const widths = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6]
export interface Ink {
  color: TLDefaultColorStyle
  width: number
  opacity: number
  textSize: 's' | 'm' | 'l' | 'xl'
}
export function readInk(): Ink {
  const ink: Ink = { color: 'black', width: 1.5, opacity: 100, textSize: 'm' }
  try {
    const saved = JSON.parse(localStorage.getItem('folio-ink-v2') || '{}')
    if (palette.some((c) => c.key === saved.color)) ink.color = saved.color
    if (widths.includes(saved.width)) ink.width = saved.width
    if (Number.isFinite(saved.opacity)) ink.opacity = Math.max(10, Math.min(100, saved.opacity))
    if (['s', 'm', 'l', 'xl'].includes(saved.textSize)) ink.textSize = saved.textSize
  } catch {
    /* optional preferences */
  }
  return ink
}
export function applyInk(editor: Editor, ink: Ink, field?: keyof Ink) {
  editor.run(() => {
    if (!field || field === 'color') {
      editor.setStyleForNextShapes(DefaultColorStyle, ink.color)
      if (field) editor.setStyleForSelectedShapes(DefaultColorStyle, ink.color)
    }
    if (!field || field === 'opacity') {
      editor.setOpacityForNextShapes(ink.opacity / 100)
      if (field) editor.setOpacityForSelectedShapes(ink.opacity / 100)
    }
    if (!field || field === 'textSize') {
      editor.setStyleForNextShapes(DefaultSizeStyle, ink.textSize)
      if (field) editor.setStyleForSelectedShapes(DefaultSizeStyle, ink.textSize)
    }
    if (field === 'width') {
      const shapes = [...editor.getShapeAndDescendantIds(editor.getSelectedShapeIds())]
        .map((id) => editor.getShape(id))
        .filter((s): s is TLDrawShape => s?.type === 'draw')
      editor.updateShapes(
        shapes.map((s) => ({ id: s.id, type: s.type, meta: { ...s.meta, folioWidth: ink.width } })),
      )
    }
  })
}
