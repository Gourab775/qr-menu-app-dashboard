import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { IconUtensils, IconEye, IconEyeOff } from '../components/Icons'

export default function Login() {
  const { signIn, isAuthenticated, session, loading: authLoading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [keepLoggedIn, setKeepLoggedIn] = useState(() => {
    try {
      return localStorage.getItem('dashboard_keepLoggedIn') === 'true'
    } catch {
      return false
    }
  })

  const timeoutRef = useRef(null)
  const initialized = useRef(false)

  useEffect(() => {
    if (!initialized.current && !authLoading) {
      initialized.current = true
      if (isAuthenticated && session) {
        window.location.hash = '#dashboard'
      }
    }
  }, [isAuthenticated, session, authLoading])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const clearTimeoutAndReset = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setLoading(false)
  }

  const startTimeout = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    timeoutRef.current = setTimeout(() => {
      setError('Request timed out. Please try again.')
      clearTimeoutAndReset()
    }, 10000)
  }

  const validateEmail = (emailStr) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(emailStr)
  }

  const getInputError = (field, value) => {
    if (field === 'email') {
      if (!value.trim()) return 'Email is required'
      if (!validateEmail(value)) return 'Please enter a valid email address'
    }
    if (field === 'password') {
      if (!value.trim()) return 'Password is required'
    }
    return null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    const emailVal = email.trim()
    const pwdVal = password.trim()

    const emailErr = getInputError('email', emailVal)
    if (emailErr) {
      setError(emailErr)
      return
    }
    const pwdErr = getInputError('password', pwdVal)
    if (pwdErr) {
      setError(pwdErr)
      return
    }

    setLoading(true)
    startTimeout()

    try {
      await signIn(emailVal, pwdVal)
      clearTimeoutAndReset()
      window.location.hash = '#dashboard'

    } catch (err) {
      clearTimeoutAndReset()
      const msg = err.message?.toLowerCase() || ''
      
      if (msg.includes('invalid') || msg.includes('credentials') || msg.includes('400')) {
        setError('Invalid email or password')
      } else if (msg.includes('email not confirmed')) {
        setError('Email not confirmed')
      } else if (msg.includes('user not found')) {
        setError('Account does not exist')
      } else if (msg.includes('rate limit')) {
        setError('Too many attempts. Please wait.')
      } else if (msg.includes('network') || msg.includes('fetch')) {
        setError('Network error. Please check your connection.')
      } else {
        setError(err.message || 'An unexpected error occurred')
      }
      
      setPassword('')
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-icon"><IconUtensils size={48} /></div>
        <h1 className="login-title">Restaurant Dashboard</h1>
        <p className="login-subtitle">Enter your credentials to continue</p>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
              placeholder="Enter your email"
              className="login-input"
              autoFocus
              disabled={loading}
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div className="password-input-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                placeholder="Enter password"
                className="login-input"
                disabled={loading}
                autoComplete="current-password"
              />
              <button 
                type="button" 
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                disabled={loading}
              >
                {showPassword ? <IconEye size={18} /> : <IconEyeOff size={18} />}
              </button>
            </div>
          </div>

          <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              id="keepLoggedIn"
              checked={keepLoggedIn}
              onChange={(e) => {
                const checked = e.target.checked
                setKeepLoggedIn(checked)
                try {
                  if (checked) {
                    localStorage.setItem('dashboard_keepLoggedIn', 'true')
                  } else {
                    localStorage.removeItem('dashboard_keepLoggedIn')
                  }
                } catch {}
              }}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
            <label htmlFor="keepLoggedIn" style={{ cursor: 'pointer', fontSize: '14px', color: '#aaa' }}>
              Keep me logged in
            </label>
          </div>

          {error && <p className="login-error">{error}</p>}

          <button type="submit" className="login-btn" disabled={loading || !email || !password}>
            {loading ? (
              <span className="loading-content">
                <span className="loading-spinner-small"></span>
                Verifying...
              </span>
            ) : (
              'Login'
            )}
          </button>
        </form>

      </div>
    </div>
  )
}