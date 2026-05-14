import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { fetchWithTimeout } from '../lib/apiUtils'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [role, setRole] = useState('staff')
  const [restaurantId, setRestaurantId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [initialized, setInitialized] = useState(false)

  // Stable refs — never cause re-renders or effect re-runs
  const profileCacheRef = useRef(new Map())
  const isFetchingProfileRef = useRef(false)
  const userDataLoadedForRef = useRef(null) // tracks which userId we loaded for
  const mountedRef = useRef(true)

  // ─── Internal helpers (not callbacks — no deps) ───────────────────────────

  const _fetchProfile = async (userId) => {
    if (profileCacheRef.current.has(userId)) {
      return profileCacheRef.current.get(userId)
    }
    if (isFetchingProfileRef.current) {
      // Wait briefly and return cached if available
      await new Promise(r => setTimeout(r, 200))
      return profileCacheRef.current.get(userId) || null
    }

    isFetchingProfileRef.current = true
    try {
      const { data, error } = await fetchWithTimeout(
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
        10000
      )
      if (error) { console.error('[Auth] Profile fetch error:', error); return null }
      if (data) profileCacheRef.current.set(userId, data)
      return data
    } catch (err) {
      console.error('[Auth] Profile fetch exception:', err)
      return null
    } finally {
      isFetchingProfileRef.current = false
    }
  }

  const _loadUserData = async (userId) => {
    // Skip if we already loaded for this exact userId
    if (userDataLoadedForRef.current === userId) return
    userDataLoadedForRef.current = userId

    const userProfile = await _fetchProfile(userId)
    if (!mountedRef.current) return

    setProfile(userProfile)
    setRole(userProfile?.role || 'staff')

    let rid = userProfile?.restaurant_id || null
    if (!rid) {
      try {
        const { data: fb } = await fetchWithTimeout(
          supabase.from('restaurants').select('id').eq('user_id', userId).limit(1).maybeSingle(),
          10000
        )
        if (fb?.id) {
          rid = fb.id
        } else {
          const { data: anyFb } = await fetchWithTimeout(
            supabase.from('restaurants').select('id').limit(1).maybeSingle(),
            10000
          )
          if (anyFb?.id) rid = anyFb.id
        }
      } catch (err) {
        console.error('[Auth] Restaurant lookup error:', err)
      }
    }
    if (!mountedRef.current) return
    setRestaurantId(rid)
  }

  const _clearUserData = () => {
    userDataLoadedForRef.current = null
    profileCacheRef.current.clear()
    isFetchingProfileRef.current = false
    setSession(null)
    setProfile(null)
    setRole('staff')
    setRestaurantId(null)
  }

  // ─── One-time initialization — EMPTY dep array so it runs exactly once ────
  useEffect(() => {
    mountedRef.current = true

    const initializeAuth = async () => {
      try {
        const { data: { session: currentSession }, error } = await supabase.auth.getSession()
        if (!mountedRef.current) return

        if (error) {
          console.error('[Auth] Session fetch error:', error)
          setSession(null)
        } else {
          setSession(currentSession)
          if (currentSession?.user) {
            await _loadUserData(currentSession.user.id)
          }
        }
      } catch (err) {
        console.error('[Auth] Init error:', err)
        setSession(null)
      } finally {
        if (mountedRef.current) {
          setInitialized(true)
          setLoading(false)
        }
      }
    }

    initializeAuth()

    // Register auth listener once — using a plain function so it's never recreated
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!mountedRef.current) return

      if (event === 'SIGNED_OUT') {
        _clearUserData()
        return
      }

      // For TOKEN_REFRESHED: just update session, don't re-fetch profile
      if (event === 'TOKEN_REFRESHED') {
        setSession(newSession)
        return
      }

      // For SIGNED_IN: only load user data if it's a NEW user (not already loaded)
      if (event === 'SIGNED_IN' && newSession?.user) {
        setSession(newSession)
        // Only re-load if this is a genuinely new login (different user or first load)
        if (userDataLoadedForRef.current !== newSession.user.id) {
          await _loadUserData(newSession.user.id)
        }
        return
      }

      // For USER_UPDATED: force re-fetch
      if (event === 'USER_UPDATED' && newSession?.user) {
        setSession(newSession)
        profileCacheRef.current.delete(newSession.user.id)
        userDataLoadedForRef.current = null
        await _loadUserData(newSession.user.id)
        return
      }
    })

    return () => {
      mountedRef.current = false
      subscription.unsubscribe()
    }
  }, []) // ← EMPTY: runs once, listener is never re-registered

  // ─── Public API ───────────────────────────────────────────────────────────

  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) throw error
    if (!data?.session) throw new Error('No session created')

    setSession(data.session)
    userDataLoadedForRef.current = null // force fresh load on explicit sign-in
    await _loadUserData(data.user.id)
    return data
  }, []) // no deps — uses internal functions via closure

  const signOut = useCallback(async () => {
    try {
      _clearUserData()
      const { error } = await supabase.auth.signOut()
      if (error) console.warn('[Auth] signOut warning:', error.message)
    } catch (err) {
      console.error('[Auth] signOut error:', err)
      _clearUserData()
    }
  }, [])

  const resetPassword = useCallback(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + '/reset-password'
    })
    if (error) throw error
  }, [])

  const refreshProfile = useCallback(async () => {
    const userId = session?.user?.id
    if (!userId) return null
    profileCacheRef.current.delete(userId)
    userDataLoadedForRef.current = null
    await _loadUserData(userId)
    return profileCacheRef.current.get(userId) || null
  }, [session?.user?.id]) // only dep: user id, not callbacks

  const value = {
    session,
    profile,
    role,
    restaurantId,
    loading,
    initialized,
    isAuthenticated: !!session,
    signIn,
    signOut,
    resetPassword,
    refreshProfile,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

export default AuthContext