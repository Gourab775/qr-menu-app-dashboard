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

  const initCompleteRef = useRef(false)
  const profileCacheRef = useRef(new Map())
  const isFetchingProfileRef = useRef(false)

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

  const loadUserData = useCallback(async (userId) => {
    const userProfile = await fetchProfile(userId)
    setProfile(userProfile)
    
    const userRole = userProfile?.role || 'staff'
    setRole(userRole)
    
    let rid = userProfile?.restaurant_id || null
    
    if (!rid) {
      const fbQuery = supabase.from('restaurants').select('id').eq('user_id', userId).limit(1).maybeSingle()
      const { data: fb } = await fetchWithTimeout(fbQuery, 10000)
      if (fb?.id) {
        rid = fb.id
      } else {
        const anyFbQuery = supabase.from('restaurants').select('id').limit(1).maybeSingle()
        const { data: anyFb } = await fetchWithTimeout(anyFbQuery, 10000)
        if (anyFb?.id) rid = anyFb.id
      }
    }
    setRestaurantId(rid)
  }, [fetchProfile])

  const handleAuthChange = useCallback(async (event, newSession) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      setSession(newSession)
      if (newSession?.user) {
        await loadUserData(newSession.user.id)
      }
    } else if (event === 'SIGNED_OUT') {
      setSession(null)
      setProfile(null)
      setRole('staff')
      setRestaurantId(null)
      profileCacheRef.current.clear()
    } else if (event === 'USER_UPDATED') {
      setSession(newSession)
      if (newSession?.user) {
        profileCacheRef.current.delete(newSession.user.id)
        await loadUserData(newSession.user.id)
      }
    }
  }, [loadUserData])

  useEffect(() => {
    if (initCompleteRef.current) return

    let mounted = true

    const initializeAuth = async () => {
      setLoading(true)

      try {
        const { data: { session: currentSession }, error: sessionError } = 
          await supabase.auth.getSession()

        if (sessionError) {
          console.error('Session fetch error:', sessionError)
          if (mounted) {
            setSession(null)
            setProfile(null)
            setRole('staff')
            setRestaurantId(null)
          }
        } else {
          if (mounted) setSession(currentSession)
          if (currentSession?.user && mounted) {
            await loadUserData(currentSession.user.id)
          }
        }
      } catch (err) {
        console.error('Session check error:', err)
        if (mounted) {
          setSession(null)
          setProfile(null)
          setRole('staff')
          setRestaurantId(null)
        }
      } finally {
        if (mounted) {
          setInitialized(true)
          setLoading(false)
          initCompleteRef.current = true
        }
      }
    }

    initializeAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(handleAuthChange)

    return () => {
      mounted = false
      subscription.unsubscribe()
      initCompleteRef.current = false
    }
  }, [handleAuthChange, loadUserData])

  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (error) throw error
    if (!data?.session) throw new Error('No session created')

    setSession(data.session)
    await loadUserData(data.user.id)

    return data
  }, [loadUserData])

  const signOut = useCallback(async () => {
    try {
      profileCacheRef.current.clear()
      isFetchingProfileRef.current = false
      setSession(null)
      setProfile(null)
      setRole('staff')
      setRestaurantId(null)
      const { error } = await supabase.auth.signOut()
      if (error) console.warn('Supabase signOut warning:', error.message)
    } catch (err) {
      console.error('signOut error:', err)
      setSession(null)
      setProfile(null)
      setRole('staff')
      setRestaurantId(null)
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
    await loadUserData(session.user.id)
    return profileCacheRef.current.get(session.user.id)
  }, [session, loadUserData])

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