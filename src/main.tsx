import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { lazy, Suspense, useEffect, useState } from 'react'
import { parseSharedLink } from './sharing'
import './workspace.css'

const SharedWorkspace = lazy(() =>
  import('./SharedWorkspace').then((module) => ({ default: module.SharedWorkspace })),
)
function WorkspaceRouter() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const changed = () => {
      if (!window.dispatchEvent(new Event('whitebored-before-navigate', { cancelable: true }))) {
        history.replaceState(null, '', location.pathname + location.search + hash)
        return
      }
      setHash(location.hash)
    }
    window.addEventListener('hashchange', changed)
    return () => window.removeEventListener('hashchange', changed)
  }, [hash])
  const link = parseSharedLink(hash)
  return link ? (
    <Suspense fallback={<main className="launch">Opening shared board…</main>}>
      <SharedWorkspace key={hash} link={link} />
    </Suspense>
  ) : (
    <App />
  )
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: string }> {
  state = { error: '' }
  static getDerivedStateFromError(error: Error) {
    return { error: error.message }
  }
  render() {
    return this.state.error ? (
      <main className="fatal">
        <h1>Something interrupted your workspace.</h1>
        <p>{this.state.error}</p>
        <p>Your saved boards are still on this device.</p>
        <button className="primary" onClick={() => location.reload()}>
          Reopen Whitebored
        </button>
      </main>
    ) : (
      this.props.children
    )
  }
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <WorkspaceRouter />
  </ErrorBoundary>,
)
