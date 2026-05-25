import { Component } from 'react'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    this.setState({ errorInfo })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#1a1a2e',
          color: '#fff',
          fontFamily: 'system-ui, sans-serif',
          padding: '20px'
        }}>
          <div style={{
            maxWidth: '500px',
            textAlign: 'center',
            backgroundColor: '#16213e',
            padding: '32px',
            borderRadius: '16px',
            border: '1px solid #e94560'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
            <h2 style={{ color: '#e94560', marginBottom: '16px' }}>Something went wrong</h2>
            <p style={{ color: '#a0a0a0', marginBottom: '24px' }}>
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button
              onClick={() => window.location.href = '/'}
              style={{
                padding: '12px 24px',
                backgroundColor: '#e94560',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '16px'
              }}
            >
              Go Home
            </button>
            {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
              <details style={{ marginTop: '24px', textAlign: 'left', color: '#a0a0a0' }}>
                <summary style={{ cursor: 'pointer', marginBottom: '8px' }}>Error Details</summary>
                <pre style={{ fontSize: '12px', overflow: 'auto', padding: '12px', backgroundColor: '#0f0f23', borderRadius: '8px' }}>
                  {this.state.error?.stack}
                  {'\n\nComponent Stack:\n'}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary