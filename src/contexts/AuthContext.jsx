import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { getPlanFeatures } from '../constants/plans'

const AuthContext = createContext(null)

// Module-level: prevents concurrent getSession() calls from any component
let sessionPromise = null

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [role, setRole] = useState('staff')
  const [restaurantId, setRestaurantId] = useState(null)
  const [restaurant, setRestaurant] = useState(null)
  const [plan, setPlan] = useState(null)
  const [features, setFeatures] = useState([])
  const [loading, setLoading] = useState(true)
  const [initialized, setInitialized] = useState(false)
  const [userDataLoading, setUserDataLoading] = useState(false)

  const profileCacheRef = useRef(new Map())
  const isFetchingProfileRef = useRef(false)
  const pendingProfileFetchRef = useRef(null)
  const userDataLoadedForRef = useRef(null)
  const mountedRef = useRef(true)
  const subscriberReadyRef = useRef(false)

  // ─── Module-level deduplicated getSession() ───
  const _getSessionOnce = async () => {
    if (!sessionPromise) {
      sessionPromise = supabase.auth.getSession().finally(() => {
        // Keep the resolved promise so subsequent calls return same result
      })
    }
    return sessionPromise
  }

  // ─── Internal: fetch profile with deduplication ───
  const _fetchProfile = async (userId) => {
    if (!userId) return null
    if (profileCacheRef.current.has(userId)) {
      return profileCacheRef.current.get(userId)
    }
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

  // ─── Internal: load full user data ───
  const _loadUserData = async (userId) => {
    if (!userId) return
    if (userDataLoadedForRef.current === userId) return
    userDataLoadedForRef.current = userId

    const userProfile = await _fetchProfile(userId)
    if (!mountedRef.current) return

    setProfile(userProfile)
    setRole(userProfile?.role || 'staff')

    let rid = userProfile?.restaurant_id || null

    if (!rid) {
      try {
        const { data: fb } = await supabase
          .from('restaurants')
          .select('id')
          .eq('user_id', userId)
          .limit(1)
          .maybeSingle()

        if (fb?.id) {
          rid = fb.id
          console.log('[Auth] Assigned restaurant_id from user_id match:', rid)
        } else {
          console.warn('[Auth] No restaurant_id found for user. Staff must be assigned a restaurant via profiles table.')
          // DO NOT fallback to random restaurant - this would cause cross-tenant data leak
        }
      } catch (err) {
        console.error('[Auth] Restaurant lookup error:', err)
      }
    }

    if (!mountedRef.current) return
    setRestaurantId(rid)

    if (rid) {
      try {
        const { data: restData, error: restErr } = await supabase
          .from('restaurants')
          .select('id, name, slug, plan, country_code, currency_code, currency_symbol, locale, contact_number, logo, created_at')
          .eq('id', rid)
          .maybeSingle()
        if (restErr) {
          console.error('[Auth] Restaurant fetch error:', restErr)
          setPlan('plus')
          setFeatures(getPlanFeatures('plus'))
        } else if (restData) {
          const trimmedPlan = String(restData.plan || 'plus').trim().toLowerCase()
          console.log('[Auth] Plan set to:', trimmedPlan)
          setRestaurant(restData)
          setPlan(trimmedPlan)
          setFeatures(getPlanFeatures(trimmedPlan))
        } else {
          console.warn('[Auth] No plan found for restaurant, defaulting to plus')
          setPlan('plus')
          setFeatures(getPlanFeatures('plus'))
        }
      } catch (err) {
        console.error('[Auth] Plan fetch exception:', err)
        setPlan('plus')
        setFeatures(getPlanFeatures('plus'))
      }
    } else {
      setPlan(null)
    }
  }

  const _clearUserData = () => {
    userDataLoadedForRef.current = null
    pendingProfileFetchRef.current = null
    isFetchingProfileRef.current = false
    profileCacheRef.current.clear()
    setSession(null)
    setProfile(null)
    setRole('staff')
    setRestaurantId(null)
    setRestaurant(null)
    setPlan(null)
    setFeatures([])
    setUserDataLoading(false)
  }

  // ─── One-time initialization ───
  useEffect(() => {
    mountedRef.current = true
    const subscriptionRef = { current: null }

    const initializeAuth = async () => {
      try {
        // 1. Get session ONCE (module-level dedup prevents re-entrant lock acquisition)
        const { data: { session: currentSession }, error } = await _getSessionOnce()
        if (!mountedRef.current) return

        if (error) {
          console.error('[Auth] Session fetch error:', error)
          setSession(null)
        } else {
          setSession(currentSession)
        }

        // 2. Subscribe to auth state changes AFTER getSession() resolves.
        //    This prevents the SIGNED_IN event fired by _recoverAndRefresh
        //    (during getSession) from triggering our handler and causing
        //    a re-entrant lock acquisition loop in GoTrue.
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
          if (!mountedRef.current) return
          if (!subscriberReadyRef.current) return

          if (event === 'SIGNED_OUT') {
            _clearUserData()
            return
          }

          if (event === 'TOKEN_REFRESHED') {
            setSession(newSession)
            return
          }

          if (event === 'SIGNED_IN' && newSession?.user) {
            setUserDataLoading(true)
            setSession(newSession)
            try {
              if (userDataLoadedForRef.current !== newSession.user.id) {
                await _loadUserData(newSession.user.id)
              }
            } finally {
              if (mountedRef.current) setUserDataLoading(false)
            }
            return
          }

          if (event === 'USER_UPDATED' && newSession?.user) {
            setSession(newSession)
            profileCacheRef.current.delete(newSession.user.id)
            userDataLoadedForRef.current = null
            await _loadUserData(newSession.user.id)
            return
          }
        })

        subscriptionRef.current = subscription
        subscriberReadyRef.current = true

        // 3. Load user data for the initial session.
        //    The initial getSession() fired SIGNED_IN before we subscribed,
        //    so no duplicate events — we must load data here explicitly.
        if (currentSession?.user) {
          await _loadUserData(currentSession.user.id)
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

    return () => {
      mountedRef.current = false
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe()
      }
    }
  }, []) // empty: runs exactly once

  // ─── Public API ───

  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) throw error
    if (!data?.session) throw new Error('No session created')

    setUserDataLoading(true)
    setSession(data.session)
    userDataLoadedForRef.current = null
    try {
      await _loadUserData(data.user.id)
    } finally {
      if (mountedRef.current) setUserDataLoading(false)
    }
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

  const refreshProfile = useCallback(async () => {
    const userId = session?.user?.id
    if (!userId) return null
    profileCacheRef.current.delete(userId)
    userDataLoadedForRef.current = null
    await _loadUserData(userId)
    return profileCacheRef.current.get(userId) || null
  }, [session?.user?.id])

  const refreshRestaurant = useCallback(async () => {
    const rid = restaurantId
    if (!rid) return
    try {
      const { data: restData, error: restErr } = await supabase
        .from('restaurants')
        .select('id, name, slug, plan, country_code, currency_code, currency_symbol, locale, contact_number, logo, created_at')
        .eq('id', rid)
        .maybeSingle()
      if (restErr) {
        console.error('[Auth] Refresh restaurant error:', restErr)
        return
      }
      if (restData) {
        const trimmedPlan = String(restData.plan || 'plus').trim().toLowerCase()
        setRestaurant(restData)
        setPlan(trimmedPlan)
        setFeatures(getPlanFeatures(trimmedPlan))
      }
    } catch (err) {
      console.error('[Auth] Refresh restaurant exception:', err)
    }
  }, [restaurantId])

  const restaurantName = restaurant?.name || ''
  const restaurantSlug = restaurant?.slug || ''

  const value = {
    session,
    profile,
    role,
    restaurantId,
    restaurant,
    plan,
    features,
    restaurantName,
    restaurantSlug,
    loading,
    initialized,
    isAuthenticated: !!session,
    userDataLoading,
    signIn,
    signOut,
    refreshProfile,
    refreshRestaurant,
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