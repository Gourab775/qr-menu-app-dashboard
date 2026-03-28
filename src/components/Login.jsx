import { useState, useEffect } from 'react'

const ADMIN_PASS = '1234'
const AUTH_KEY = 'dashboard_auth'

export default function Login({ onLogin }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(AUTH_KEY)
    if (stored === 'true') {
      onLogin()
    }
  }, [onLogin])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    setTimeout(() => {
      if (password === ADMIN_PASS) {
        localStorage.setItem(AUTH_KEY, 'true')
        onLogin()
      } else {
        setError('Invalid password')
        setPassword('')
      }
      setLoading(false)
    }, 300)
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-icon">🍽️</div>
        <h1 className="login-title">Restaurant Dashboard</h1>
        <p className="login-subtitle">Enter password to continue</p>

        <form onSubmit={handleSubmit} className="login-form">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password..."
            className="login-input"
            autoFocus
          />

          {error && <p className="login-error">{error}</p>}

          <button type="submit" className="login-btn" disabled={loading || !password}>
            {loading ? 'Verifying...' : 'Login'}
          </button>
        </form>

        <p className="login-hint">Demo password: 1234</p>
      </div>
    </div>
  )
}
