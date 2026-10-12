import { useSyncExternalStore } from 'react'

// Keep this query in sync with the mobile workspace styles.
const query = '(max-width: 760px), (pointer: coarse) and (max-height: 500px)'
const subscribe = (onChange: () => void) => {
  const media = window.matchMedia(query)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

export function useMobileLayout() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}
