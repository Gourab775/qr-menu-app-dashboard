import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [initialized, setInitialized] = useState(false)

  const fetchedProfileRef = useRef(null)
  const isFetchingProfile = useRef(false)

  const fetchProfile = useCallback(async (userId) => {
    if (!userId) return null
    if (fetchedProfileRef.current?.id === userId && fetchedProfileRef.current?.data) {
      return fetchedProfileRef.current.data
    }
    if (isFetchingProfile.current) return null

    isFetchingProfile.current = true
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      if (error) {
        console.error('Profile fetch error:', error)
        isFetchingProfile.current = false
        return null
      }

      if (data) fetchedProfileRef.current = { id: userId, data }
      isFetchingProfile.current = false
      return data
    } catch (err) {
      console.error('Profile fetch exception:', err)
      isFetchingProfile.current = false
      return null
    }
  }, [])

  const checkSession = useCallback(async () => {
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      setSession(currentSession)

      if (currentSession?.user) {
        const userProfile = await fetchProfile(currentSession.user.id)
        setProfile(userProfile)
      } else {
        setProfile(null)
        fetchedProfileRef.current = null
      }

      return currentSession
    } catch (err) {
      console.error('Session check error:', err)
      setSession(null)
      setProfile(null)
      fetchedProfileRef.current = null
      return null
    }
  }, [fetchProfile])

  const initialize = useCallback(async () => {
    if (initialized) return
    setLoading(true)
    await checkSession()
    setInitialized(true)
    setLoading(false)
  }, [initialized, checkSession])

  useEffect(() => {
    initialize()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setSession(newSession)
        if (newSession?.user) {
          const userProfile = await fetchProfile(newSession.user.id)
          setProfile(userProfile)
        }
      } else if (event === 'SIGNED_OUT') {
        setSession(null)
        setProfile(null)
        fetchedProfileRef.current = null
      } else if (event === 'USER_UPDATED') {
        setSession(newSession)
        if (newSession?.user) {
          fetchedProfileRef.current = null
          const userProfile = await fetchProfile(newSession.user.id)
          setProfile(userProfile)
        }
      }
    })

    return () => subscription.unsubscribe()
  }, [initialize, fetchProfile])

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
      fetchedProfileRef.current = { id: data.user.id, data: userProfile }
    }
    setProfile(userProfile)

    return data
  }, [fetchProfile])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    setSession(null)
    setProfile(null)
    fetchedProfileRef.current = null
  }, [])

  const resetPassword = useCallback(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + '/reset-password'
    })
    if (error) throw error
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!session?.user) return null
    fetchedProfileRef.current = null
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
    checkSession,
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