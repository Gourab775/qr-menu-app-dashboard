import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { fetchWithTimeout } from '../lib/apiUtils'

const AuthContext = createContext(null)

let authListenerInitialized = false

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [initialized, setInitialized] = useState(false)

  const initCompleteRef = useRef(false)
  const profileCacheRef = useRef(new Map())
  const isFetchingProfileRef = useRef(false)
  const subscriptionRef = useRef(null)

  const fetchProfile = useCallback(async (userId) => {
    if (!userId) return null
    if (profileCacheRef.current.has(userId)) {
      return profileCacheRef.current.get(userId)
    }
    if (isFetchingProfileRef.current) {
      return null
    }

    isFetchingProfileRef.current = true
    try {
      const query = supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      const { data, error } = await fetchWithTimeout(query, 10000)

      if (error) {
        console.error('Profile fetch error:', error)
        isFetchingProfileRef.current = false
        return null
      }

      if (data) {
        profileCacheRef.current.set(userId, data)
      }
      isFetchingProfileRef.current = false
      return data
    } catch (err) {
      console.error('Profile fetch exception:', err)
      isFetchingProfileRef.current = false
      return null
    }
  }, [])

  const handleAuthChange = useCallback(async (event, newSession) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      setSession(newSession)
      if (newSession?.user) {
        const userProfile = await fetchProfile(newSession.user.id)
        setProfile(userProfile)
      }
    } else if (event === 'SIGNED_OUT') {
      setSession(null)
      setProfile(null)
      profileCacheRef.current.clear()
    } else if (event === 'USER_UPDATED') {
      setSession(newSession)
      if (newSession?.user) {
        profileCacheRef.current.delete(newSession.user.id)
        const userProfile = await fetchProfile(newSession.user.id)
        setProfile(userProfile)
      }
    }
  }, [fetchProfile])

  useEffect(() => {
    if (initCompleteRef.current) return

    const initializeAuth = async () => {
      setLoading(true)

      try {
        const { data: { session: currentSession }, error: sessionError } = 
          await supabase.auth.getSession()

        if (sessionError) {
          console.error('Session fetch error:', sessionError)
          setSession(null)
          setProfile(null)
        } else {
          setSession(currentSession)
          if (currentSession?.user) {
            const userProfile = await fetchProfile(currentSession.user.id)
            setProfile(userProfile)
          }
        }
      } catch (err) {
        console.error('Session check error:', err)
        setSession(null)
        setProfile(null)
      } finally {
        setInitialized(true)
        setLoading(false)
        initCompleteRef.current = true
      }
    }

    initializeAuth()

    if (!authListenerInitialized) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(handleAuthChange)
      subscriptionRef.current = subscription
      authListenerInitialized = true
    }

    return () => {
    }
  }, [fetchProfile, handleAuthChange])

  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (error) throw error
    if (!data?.session) throw new Error('No session created')

    setSession(data.session)

    const userProfile = await fetchProfile(data.user.id)
    if (userProfile) {
      profileCacheRef.current.set(data.user.id, userProfile)
    }
    setProfile(userProfile)

    return data
  }, [fetchProfile])

  const signOut = useCallback(async () => {
    try {
      profileCacheRef.current.clear()
      isFetchingProfileRef.current = false
      setSession(null)
      setProfile(null)
      const { error } = await supabase.auth.signOut()
      if (error) console.warn('Supabase signOut warning:', error.message)
    } catch (err) {
      console.error('signOut error:', err)
      setSession(null)
      setProfile(null)
    }
  }, [])

  const resetPassword = useCallback(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + '/reset-password'
    })
    if (error) throw error
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!session?.user) return null
    profileCacheRef.current.delete(session.user.id)
    const userProfile = await fetchProfile(session.user.id)
    setProfile(userProfile)
    return userProfile
  }, [session, fetchProfile])

  const value = {
    session,
    profile,
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