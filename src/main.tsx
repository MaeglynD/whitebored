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
  const [path, setPath] = useState(location.hash || location.pathname)
  useEffect(() => {
    const changed = () => {
      if (!window.dispatchEvent(new Event('whitebored-before-navigate', { cancelable: true }))) {
        history.replaceState(null, '', path.startsWith('#') ? '/' + path : path)
        return
      }
      setPath(location.hash || location.pathname)
    }
    window.addEventListener('hashchange', changed)
    window.addEventListener('popstate', changed)
    window.addEventListener('whitebored-navigate', changed)
    return () => {
      window.removeEventListener('hashchange', changed)
      window.removeEventListener('popstate', changed)
      window.removeEventListener('whitebored-navigate', changed)
    }
  }, [path])
  const link = parseSharedLink(path)
  return link ? (
    <Suspense fallback={<main className="launch">Opening shared board…</main>}>
      <SharedWorkspace key={link.id} link={link} />
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
