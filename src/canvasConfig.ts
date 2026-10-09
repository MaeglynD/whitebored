import { DEFAULT_THEME, DrawShapeUtil, defaultShapeUtils } from 'tldraw'
import { getAssetUrlsByImport } from '@tldraw/assets/imports.vite'
import { palette } from './ink'
export const assetUrls = getAssetUrlsByImport()
export const normalTheme = structuredClone(DEFAULT_THEME)
normalTheme.colors.light.background = '#f8f9fc'
normalTheme.colors.light.negativeSpace = '#f8f9fc'
normalTheme.colors.dark.background = '#17191f'
normalTheme.colors.dark.negativeSpace = '#17191f'
for (const color of palette) {
  normalTheme.colors.light[color.key].solid = color.light
  normalTheme.colors.dark[color.key].solid = color.dark
}
export const legacyTheme = structuredClone(DEFAULT_THEME)
legacyTheme.fonts.sans = { ...legacyTheme.fonts.sans, fontFamily: 'Arial, sans-serif', faces: [] }
legacyTheme.fonts.serif = { ...legacyTheme.fonts.serif, fontFamily: 'Georgia, serif', faces: [] }
legacyTheme.fonts.mono = { ...legacyTheme.fonts.mono, fontFamily: 'Consolas, monospace', faces: [] }
for (const mode of ['light', 'dark'] as const) {
  legacyTheme.colors[mode].background = '#14171b'
  legacyTheme.colors[mode].negativeSpace = '#14171b'
  const colors = {
    white: '#ffffff',
    red: '#ff6b6b',
    orange: '#ffb84d',
    yellow: '#ffe066',
    green: '#69db7c',
    'light-blue': '#66d9e8',
    blue: '#74a0ff',
    violet: '#da8cff',
    'light-red': '#f783ac',
    grey: '#868e96',
  }
  for (const [color, hex] of Object.entries(colors))
    Object.assign(legacyTheme.colors[mode][color as keyof typeof colors], { solid: hex, fill: hex })
}
// Legacy documents retain their original dark canvas, while light-mode previews stay legible.
legacyTheme.colors.light.background = normalTheme.colors.light.background
legacyTheme.colors.light.negativeSpace = normalTheme.colors.light.negativeSpace
legacyTheme.colors.light.white.solid = normalTheme.colors.light.black.solid
export const shapeUtils = [
  DrawShapeUtil.configure({
    getCustomDisplayValues(_editor, shape) {
      const width = shape.meta.folioWidth
      return typeof width === 'number' && width >= 0.25 && width <= 6 ? { strokeWidth: width } : {}
    },
  }),
]
export const storeShapeUtils = [
  ...defaultShapeUtils.filter((util) => util.type !== 'draw'),
  ...shapeUtils,
]
