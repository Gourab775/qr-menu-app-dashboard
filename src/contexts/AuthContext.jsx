import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

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
  const pendingProfileFetchRef = useRef(null) // deduplicates concurrent fetches
  const userDataLoadedForRef = useRef(null)   // tracks which userId data was loaded for
  const mountedRef = useRef(true)

  // ─── Internal: fetch profile with deduplication (no artificial timeout) ───
  const _fetchProfile = async (userId) => {
    if (!userId) return null

    // Return from cache immediately
    if (profileCacheRef.current.has(userId)) {
      return profileCacheRef.current.get(userId)
    }

    // Deduplicate concurrent fetches for the same userId
    if (isFetchingProfileRef.current && pendingProfileFetchRef.current) {
      return pendingProfileFetchRef.current
    }

    isFetchingProfileRef.current = true
    pendingProfileFetchRef.current = (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle()

        if (error) {
          console.error('[Auth] Profile fetch error:', error)
          return null
        }
        if (data) profileCacheRef.current.set(userId, data)
        return data
      } catch (err) {
        console.error('[Auth] Profile fetch exception:', err)
        return null
      } finally {
        isFetchingProfileRef.current = false
        pendingProfileFetchRef.current = null
      }
    })()

    return pendingProfileFetchRef.current
  }

  // ─── Internal: load full user data (profile + role + restaurantId) ────────
  const _loadUserData = async (userId) => {
    if (!userId) return
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
        // Try user-specific restaurant first
        const { data: fb } = await supabase
          .from('restaurants')
          .select('id')
          .eq('user_id', userId)
          .limit(1)
          .maybeSingle()

        if (fb?.id) {
          rid = fb.id
        } else {
          // Fallback: first available restaurant
          const { data: anyFb } = await supabase
            .from('restaurants')
            .select('id')
            .limit(1)
            .maybeSingle()
          if (anyFb?.id) rid = anyFb.id
        }
      } catch (err) {
        console.error('[Auth] Restaurant lookup error:', err)
      }
    }

    if (!mountedRef.current) return
    setRestaurantId(rid)
  }

  // ─── Internal: reset all user state ──────────────────────────────────────
  const _clearUserData = () => {
    userDataLoadedForRef.current = null
    pendingProfileFetchRef.current = null
    isFetchingProfileRef.current = false
    profileCacheRef.current.clear()
    setSession(null)
    setProfile(null)
    setRole('staff')
    setRestaurantId(null)
  }

  // ─── One-time initialization — EMPTY dep array so listener registers once ─
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
        if (mountedRef.current) setSession(null)
      } finally {
        if (mountedRef.current) {
          setInitialized(true)
          setLoading(false)
        }
      }
    }

    initializeAuth()

    // Auth state listener — registered once, never re-registered
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!mountedRef.current) return

      if (event === 'SIGNED_OUT') {
        _clearUserData()
        return
      }

      // TOKEN_REFRESHED: just update session token, no profile re-fetch needed
      if (event === 'TOKEN_REFRESHED') {
        setSession(newSession)
        return
      }

      // SIGNED_IN: only load data if it's a new/different user
      if (event === 'SIGNED_IN' && newSession?.user) {
        setSession(newSession)
        if (userDataLoadedForRef.current !== newSession.user.id) {
          await _loadUserData(newSession.user.id)
        }
        return
      }

      // USER_UPDATED: force fresh re-fetch
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
  }, []) // ← empty: runs exactly once

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
  }, [])

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
  }, [session?.user?.id])

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