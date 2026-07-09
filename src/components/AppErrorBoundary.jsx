import { Component } from 'react'

export default class AppErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  clearLocalCache = () => {
    if (!window.confirm('Clear local TradeMarker cache in this browser? Remote GitHub data will not be deleted.')) return
    try {
      Object.keys(localStorage)
        .filter((key) => key.startsWith('trademarker.'))
        .forEach((key) => localStorage.removeItem(key))
    } catch {}
    window.location.href = `${window.location.pathname}${window.location.search}#/settings`
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children
    const message = this.state.error?.message || 'TradeMarker could not finish loading.'
    return (
      <main className="app-crash">
        <section className="panel">
          <p className="eyebrow">TradeMarker</p>
          <h1>Unable to load the app</h1>
          <p>{message}</p>
          <div className="app-crash-actions">
            <button type="button" onClick={() => window.location.reload()}>Reload</button>
            <button type="button" className="secondary" onClick={this.clearLocalCache}>Clear local cache</button>
          </div>
        </section>
      </main>
    )
  }
}
