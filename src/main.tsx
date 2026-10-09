import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './workspace.css'

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
          Reopen Folio
        </button>
      </main>
    ) : (
      this.props.children
    )
  }
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)
