import { Component } from 'react'
import { useI18n } from '../i18n'

class OrderPlanErrorBoundaryInner extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidUpdate(previousProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const { language, onRetry } = this.props
    const isZh = language === 'zh'
    return (
      <div className="panel order-plan-error-panel">
        <p className="eyebrow">{isZh ? '挂单 JSON 检查' : 'Order JSON check'}</p>
        <h2>{isZh ? '这份挂单计划里可能有不兼容字段' : 'This order plan has an incompatible field'}</h2>
        <p>
          {isZh
            ? 'TradeMarker 已拦截这次渲染错误，所以你还能继续操作。通常是 JSON 里某个文本字段生成成了对象/数组，或 currency 不是 USD/CAD 这类三字母代码。'
            : 'TradeMarker caught the rendering error so the page stays usable. This is usually caused by a text field generated as an object/array, or a non-standard currency value.'}
        </p>
        <pre>{error.message || String(error)}</pre>
        <div className="sync-actions">
          <button type="button" onClick={onRetry}>{isZh ? '重新加载计划' : 'Reload plan'}</button>
          <a className="settings-link" href="#/ai">{isZh ? '重新生成 JSON' : 'Regenerate JSON'}</a>
          <a className="settings-link secondary-link" href="#/settings">{isZh ? '检查同步设置' : 'Check sync settings'}</a>
        </div>
      </div>
    )
  }
}

export default function OrderPlanErrorBoundary({ children, resetKey, onRetry }) {
  const { language } = useI18n()
  return (
    <OrderPlanErrorBoundaryInner language={language} resetKey={resetKey} onRetry={onRetry}>
      {children}
    </OrderPlanErrorBoundaryInner>
  )
}
