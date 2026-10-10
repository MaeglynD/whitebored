export interface Preferences {
  theme: 'light' | 'dark'
  wheel: 'pan' | 'zoom'
  grid: boolean
  snapping: boolean
  penOnly: boolean
  zoomSpeed: number
  zoomEase: number
}
export const defaults: Preferences = {
  theme: 'light',
  wheel: 'pan',
  grid: false,
  snapping: false,
  penOnly: false,
  zoomSpeed: 5,
  zoomEase: 60,
}
export function readPreferences(): Preferences {
  try {
    const prefs = { ...defaults, ...JSON.parse(localStorage.getItem('folio-preferences') || '{}') }
    prefs.zoomSpeed = Number.isFinite(prefs.zoomSpeed)
      ? Math.max(1.2, Math.min(12, prefs.zoomSpeed))
      : 5
    prefs.zoomEase = Number.isFinite(prefs.zoomEase)
      ? Math.max(0, Math.min(200, prefs.zoomEase))
      : 60
    return prefs
  } catch {
    return defaults
  }
}
