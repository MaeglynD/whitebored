export const shortLinkPattern = /^[A-Za-z0-9_-]{22}$/
const legacyId = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'

/** A new link is a single, cryptographically random 128-bit bearer capability. */
export function parseSharePath(path: string) {
  const short = path.match(/^\/?(?:#\/)?s\/([A-Za-z0-9_-]{22})\/?$/)
  if (short) return { id: short[1], editKey: short[1], title: 'Shared board' }
  const legacy = path.match(new RegExp(`^/?(?:#/)?s/(${legacyId})/([A-Za-z0-9_-]{43})/?$`, 'i'))
  return legacy ? { id: legacy[1], editKey: legacy[2], title: 'Shared board' } : null
}

export function sharePath(link: { id: string; editKey: string }) {
  return shortLinkPattern.test(link.id) && link.id === link.editKey
    ? `/s/${link.id}`
    : `/s/${link.id}/${link.editKey}`
}

export function navigateWorkspace(path = '/', replace = false) {
  if (location.protocol === 'folio:') {
    // The installed app retains its existing origin and filesystem protocol.
    path = path === '/' ? '/' : `/#${path}`
  }
  if (!window.dispatchEvent(new Event('whitebored-before-navigate', { cancelable: true }))) return
  history[replace ? 'replaceState' : 'pushState'](null, '', path)
  window.dispatchEvent(new Event('whitebored-navigate'))
}
