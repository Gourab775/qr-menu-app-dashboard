import React, { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './lib/supabase'
import { useAuth } from './contexts/AuthContext'
import { fetchWithTimeout, deduplicateRequest } from './lib/apiUtils'
import MenuItemCard from './components/MenuItemCard'
import AddItemModal from './components/AddItemModal'
import Toast from './components/Toast'
import Login from './components/Login'
import ResetPassword from './components/ResetPassword'
import OfflineBanner from './components/OfflineBanner'
import FeaturedItemsPanel from './components/FeaturedItemsPanel'
import CategoriesPage from './pages/CategoriesPage'
import OverviewPage from './pages/OverviewPage'
import SettingsPage from './pages/SettingsPage'
import TablesPage from './pages/TablesPage'
import PastOrdersPage from './pages/PastOrdersPage'
import { formatDateTime, formatOrderDateTime } from './utils/formatDateTime'
import * as orderStore from './services/orderStore'
import './App.css'
import './theme.css'

const API_TIMEOUT = 15000

function App() {
  const { session, profile, loading: authLoading, initialized, signOut, role, restaurantId } = useAuth()
  const [resetMode, setResetMode] = useState(() => window.location.hash === '#reset-password')
  const [restaurantSlug, setRestaurantSlug] = useState('')
  const [restaurantName, setRestaurantName] = useState('')
  const [orders, setOrders] = useState([])
  const [pastOrders, setPastOrders] = useState([])
  const [waiterCalls, setWaiterCalls] = useState([])
  const [waiterCallsLoading, setWaiterCallsLoading] = useState(false)
  const [menuItems, setMenuItems] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(false)
  const [menuLoading, setMenuLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('analytics')
  const [showProfile, setShowProfile] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [toast, setToast] = useState(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [preferences, setPreferences] = useState(() => {
    try {
      const saved = localStorage.getItem('dashboard_preferences')
      return saved ? JSON.parse(saved) : {
        soundEnabled: true,
        orderNotifications: true,
        autoDeclineTimeout: 10,
        theme: 'dark'
      }
    } catch {
      return { soundEnabled: true, orderNotifications: true, autoDeclineTimeout: 10, theme: 'dark' }
    }
  })

  const profileRef = useRef(null)
  const abortControllerRef = useRef(null)
  const ordersLoadingRef = useRef(false)

  const isMountedRef = useRef(true)
  const logoutRef = useRef(false)
  const firstOrdersFetchDone = useRef(false)
  const ordersFetchFailedRef = useRef(false)

  const userRole = role || 'staff'
  const userFullName = profile?.full_name || profile?.email || session?.user?.email || 'User'
  const isLoggedIn = !!session

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const loadOrders = useCallback(async (signal = null) => {
    if (!restaurantId || !isMountedRef.current) return

    const fetchKey = `orders-${restaurantId}`
    const isManualFetch = signal === null

    if (isManualFetch) {
      if (ordersLoadingRef.current) return
      ordersLoadingRef.current = true
      setLoading(true)
    }

    const executeLoad = async () => {
      try {
        const baseSelect = 'id, restaurant_id, total_price, status, items, created_at, order_code, table_id, note, restaurant_tables(table_number)'

        console.log('[Orders] Querying live_orders:', { restaurantId, pendingStatus: 'pending', acceptedStatus: 'accepted', select: baseSelect })
        const [liveResult, pastResult] = await Promise.all([
          fetchWithTimeout(
            supabase.from('live_orders').select(baseSelect).eq('restaurant_id', restaurantId).eq('status', 'pending').order('created_at', { ascending: false }).limit(200),
            API_TIMEOUT
          ),
          fetchWithTimeout(
            supabase.from('live_orders').select(baseSelect).eq('restaurant_id', restaurantId).eq('status', 'accepted').order('created_at', { ascending: false }).limit(200),
            API_TIMEOUT
          )
        ])
        console.log('[Orders] Query results:', { pendingCount: liveResult.data?.length || 0, pendingError: liveResult.error?.message || null, acceptedCount: pastResult.data?.length || 0, acceptedError: pastResult.error?.message || null })

        if (signal?.aborted) return { aborted: true }

        const liveError = liveResult.error && liveResult.error.code !== 'PGRST116' ? liveResult.error : null
        const pastError = pastResult.error && pastResult.error.code !== 'PGRST116' ? pastResult.error : null

        if (liveError) {
          console.error('[Orders] Live query error:', liveError.message || liveError, 'code:', liveError.code)
        }
        if (pastError) {
          console.error('[Orders] Past query error:', pastError.message || pastError, 'code:', pastError.code)
        }

        const liveData = liveResult.data || []
        const pastData = pastResult.data || []
        const allOrders = [...liveData, ...pastData]

        console.log('[Orders] loadOrders result:', {
          pendingCount: liveData.length,
          acceptedCount: pastData.length,
          pendingStatuses: [...new Set(liveData.map(o => o.status))],
          acceptedStatuses: [...new Set(pastData.map(o => o.status))]
        })
        const unresolvedIds = [...new Set(allOrders.filter(o => o.table_id && !o.restaurant_tables?.table_number).map(o => o.table_id))]

        if (unresolvedIds.length > 0) {
          const tablesPromise = supabase.from('restaurant_tables').select('id, table_number').in('id', unresolvedIds)
          const { data: tr } = await fetchWithTimeout(tablesPromise, API_TIMEOUT)
          if (!signal?.aborted && tr) {
            const tMap = {}
            tr.forEach(t => { tMap[t.id] = t.table_number })
            allOrders.forEach(o => {
              if (o.table_id && tMap[o.table_id] !== undefined) {
                o.restaurant_tables = { table_number: tMap[o.table_id] }
              }
            })
          }
        }

        if (signal?.aborted) return { aborted: true }

        return { data: liveData, pastData }
      } catch (err) {
        console.error('[Orders] Exception:', err)
        return { error: err }
      }
    }

    const result = isManualFetch
      ? await deduplicateRequest(fetchKey, executeLoad)
      : await executeLoad()

    if (signal?.aborted) return
    if (result.aborted) return

    if (result.error && !result.data && !result.pastData) {
      console.error('[Orders] Both queries failed completely:', result.error?.message || result.error)
      ordersFetchFailedRef.current = true
      setToast({ message: 'Failed to load orders', type: 'error' })
    } else if (result.error) {
      console.warn('[Orders] Partial query failure, using available data:', result.error?.message || result.error)
      ordersFetchFailedRef.current = true
      if (result.data !== undefined) {
        setOrders(prev => {
          const merged = new Map(prev.map(o => [o.id, o]))
          ;(result.data || []).forEach(o => merged.set(o.id, o))
          return Array.from(merged.values()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        })
      }
      if (result.pastData !== undefined) {
        setPastOrders(prev => {
          const merged = new Map(prev.map(o => [o.id, o]))
          ;(result.pastData || []).forEach(o => merged.set(o.id, o))
          return Array.from(merged.values()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        })
      }
    } else {
      ordersFetchFailedRef.current = false
      if (result.data !== undefined) {
        setOrders(prev => {
          const merged = new Map(prev.map(o => [o.id, o]))
          ;(result.data || []).forEach(o => merged.set(o.id, o))
          return Array.from(merged.values()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        })
        setPastOrders(prev => {
          const merged = new Map(prev.map(o => [o.id, o]))
          ;(result.pastData || []).forEach(o => merged.set(o.id, o))
          return Array.from(merged.values()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        })
      }
    }

    if (isManualFetch) {
      ordersLoadingRef.current = false
      setLoading(false)
    }
  }, [restaurantId, setToast])

  const closeSidebar = useCallback(() => setSidebarOpen(false), [])

  const isAdmin = userRole === 'admin' || userRole === 'owner'
  const isManager = userRole === 'manager' || isAdmin

  useEffect(() => {
    const handleClick = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setShowProfile(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const handleLogout = useCallback(async () => {
    if (logoutRef.current) return
    logoutRef.current = true

    try {
      localStorage.removeItem('dashboard_preferences')
      localStorage.removeItem('dashboard_keepLoggedIn')
      setShowProfile(false)
      await signOut()

      setRestaurantSlug('')
      setRestaurantName('')
      setOrders([])
      setPastOrders([])
      setMenuItems([])
      setCategories([])

      window.location.hash = ''
    } catch (err) {
      console.error('Logout error:', err)
      window.location.hash = ''
      window.location.reload()
    } finally {
      logoutRef.current = false
    }
  }, [signOut])

  // Fetch restaurant name and slug when restaurantId is available
  useEffect(() => {
    if (!isLoggedIn || !restaurantId) return
    isMountedRef.current = true

    const controller = new AbortController()

    const fetchRestaurantInfo = async () => {
      try {
        const { data } = await fetchWithTimeout(
          supabase.from('restaurants').select('name, slug').eq('id', restaurantId).maybeSingle(),
          API_TIMEOUT
        )
        if (!isMountedRef.current || controller.signal.aborted) return
        if (data) {
          setRestaurantName(data.name || '')
          setRestaurantSlug(data.slug || '')
        }
      } catch (err) {
        console.error('[RestaurantInfo] Error:', err)
      }
    }

    fetchRestaurantInfo()

    return () => {
      isMountedRef.current = false
      controller.abort()
    }
  }, [isLoggedIn, restaurantId])

  useEffect(() => {
    if (!isLoggedIn || !restaurantId) return
    isMountedRef.current = true

    const controller = new AbortController()
    abortControllerRef.current = controller

    const doLoad = async () => {
      try {
        const catPromise = supabase.from('categories').select('id, name, image, sort_order').eq('restaurant_id', restaurantId).order('sort_order', { ascending: true })
        const { data: catData } = await fetchWithTimeout(catPromise, API_TIMEOUT)
        if (!isMountedRef.current || controller.signal.aborted) return
        if (catData) setCategories(catData || [])

        setMenuLoading(true)
        try {
          const menuPromise = supabase.from('menu_items').select('id, name, price, description, is_veg, is_available, category_id, image_url').eq('restaurant_id', restaurantId).order('name', { ascending: true })
          const { data: itemData, error: itemErr } = await fetchWithTimeout(menuPromise, API_TIMEOUT)
          if (!isMountedRef.current || controller.signal.aborted) return
          if (itemErr) {
            console.error('[Menu] Load error:', itemErr)
            setToast({ message: 'Failed to load menu items', type: 'error' })
          } else {
            setMenuItems(itemData || [])
          }
        } finally {
          setMenuLoading(false)
        }
      } catch (err) {
        console.error('[DataLoad] Error:', err)
      }
    }

    doLoad()

    return () => {
      isMountedRef.current = false
      controller.abort()
      abortControllerRef.current = null
    }
  }, [isLoggedIn, restaurantId, setToast])

  useEffect(() => {
    if (!isLoggedIn || !restaurantId) return

    if (ordersLoadingRef.current) return
    ordersLoadingRef.current = true
    setLoading(true)

    const controller = new AbortController()
    abortControllerRef.current = controller

    loadOrders(controller.signal).finally(() => {
      firstOrdersFetchDone.current = true
      ordersLoadingRef.current = false
      setLoading(false)
    })

    return () => {
      controller.abort()
      ordersLoadingRef.current = false
    }
  }, [isLoggedIn, restaurantId, loadOrders])

  // Polling fallback — runs loadOrders every 30s if realtime subscription is inactive
  useEffect(() => {
    if (!isLoggedIn || !restaurantId) return

    const interval = setInterval(() => {
      loadOrders()
    }, 30000)

    return () => clearInterval(interval)
  }, [isLoggedIn, restaurantId, loadOrders])

  useEffect(() => {
    if (!isLoggedIn || !restaurantId) return

    const lastPlayedOrderRef = { current: null }
    const soundReadyRef = { current: false }
    const audioCtxRef = { current: null }

    const SOUND_OPTIONS = [
      { id: 'beep', name: 'Default Beep', freq: [800, 1000], duration: 0.3 },
      { id: 'chime', name: 'Soft Chime', freq: [600, 800, 1000], duration: 0.5 },
      { id: 'bell', name: 'Bell Ring', freq: [500, 700], duration: 0.6 },
      { id: 'alert', name: 'Alert Tone', freq: [1000, 1200, 800], duration: 0.4 },
      { id: 'digital', name: 'Digital Ping', freq: [1500, 2000], duration: 0.2 },
      { id: 'pop', name: 'Notification Pop', freq: [400, 600], duration: 0.25 },
      { id: 'ding', name: 'Classic Ding', freq: [700, 900], duration: 0.35 },
      { id: 'subtle', name: 'Subtle Click', freq: [300], duration: 0.15 },
      { id: 'triple', name: 'Triple Alert', freq: [800, 800, 800], duration: 0.45 },
      { id: 'ascend', name: 'Ascending Tone', freq: [400, 600, 800], duration: 0.4 }
    ]

    const createSound = () => {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (!AudioContext) return null
      try {
        const ctx = new AudioContext()
        audioCtxRef.current = ctx
        const selSound = SOUND_OPTIONS.find(s => s.id === preferences.notificationSound) || SOUND_OPTIONS[0]
        return () => {
          if (ctx.state === 'suspended') ctx.resume()
          let delay = 0
          selSound.freq.forEach((freq, i) => {
            setTimeout(() => {
              const osc = ctx.createOscillator()
              const gain = ctx.createGain()
              osc.connect(gain); gain.connect(ctx.destination)
              osc.frequency.value = freq; osc.type = 'sine'
              const td = selSound.duration / selSound.freq.length
              gain.gain.setValueAtTime(0.25, ctx.currentTime)
              gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + td)
              osc.start(ctx.currentTime); osc.stop(ctx.currentTime + td)
            }, delay)
            delay += (selSound.duration * 1000) / selSound.freq.length
          })
        }
      } catch { return null }
    }

    let playFn = null
    const initAudio = () => {
      if (soundReadyRef.current) return
      playFn = createSound()
      soundReadyRef.current = true
    }

    const handleGesture = () => { initAudio(); document.removeEventListener('click', handleGesture); document.removeEventListener('keydown', handleGesture) }
    document.addEventListener('click', handleGesture)
    document.addEventListener('keydown', handleGesture)

    const playSound = () => {
      if (!preferences.soundEnabled || !playFn) return
      try { playFn() } catch { }
    }

    const subscriptionActiveRef = { current: false }
    const needsReconnectRefetch = { current: false }
    let reconnectTimer = null

    const channel = supabase
      .channel('live-orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_orders' },
        (payload) => {
          if (payload.new.restaurant_id !== restaurantId) return
          const newOrderId = payload.new.id
          const rawStatus = payload.new.status
          const newStatus = rawStatus || 'pending'
          if (lastPlayedOrderRef.current === newOrderId) return
          lastPlayedOrderRef.current = newOrderId

          console.log('[Orders] INSERT event received:', {
            id: newOrderId,
            status: rawStatus,
            resolvedStatus: newStatus,
            order_code: payload.new.order_code,
            created_at: payload.new.created_at
          })

          if (newStatus !== 'pending') {
            console.warn('[Orders] New order inserted with non-pending status:', {
              id: newOrderId,
              status: rawStatus,
              expected: 'pending',
              order_code: payload.new.order_code
            })
          }

          const fetchAndAddOrder = async () => {
            const { data: freshOrder } = await supabase
              .from('live_orders').select('*, restaurant_tables(table_number)')
              .eq('id', newOrderId).single()
            if (!freshOrder) return

            let resolved = freshOrder
            if (freshOrder.table_id && !freshOrder.restaurant_tables?.table_number) {
              const { data: tr } = await supabase.from('restaurant_tables').select('id, table_number').eq('id', freshOrder.table_id).maybeSingle()
              if (tr) resolved = { ...freshOrder, restaurant_tables: { table_number: tr.table_number } }
            }

            if (newStatus === 'pending') {
              setOrders(prev => {
                if (prev.some(o => o.id === newOrderId)) return prev.map(o => o.id === newOrderId ? { ...o, ...resolved } : o)
                if (preferences.soundEnabled) playSound()
                return [resolved, ...prev].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
              })
            } else if (newStatus === 'accepted') {
              setPastOrders(prev => {
                if (prev.some(o => o.id === newOrderId)) return prev.map(o => o.id === newOrderId ? { ...o, ...resolved } : o)
                return [resolved, ...prev].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
              })
            } else {
              console.warn('[Orders] INSERT with unrecognized status, defaulting to pending routing:', {
                id: newOrderId, status: newStatus
              })
              setOrders(prev => {
                if (prev.some(o => o.id === newOrderId)) return prev
                return [resolved, ...prev].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
              })
            }
          }
          fetchAndAddOrder()
        }
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'live_orders' },
        (payload) => {
          const { id, status } = payload.new
          const oldStatus = payload.old?.status

          console.log('[Orders] UPDATE event:', {
            id,
            oldStatus,
            newStatus: status,
            order_code: payload.new.order_code || 'N/A'
          })

          if (status !== 'pending' && status !== 'accepted' && status !== 'confirmed' && status !== 'completed') {
            console.warn('[Orders] UPDATE with unknown status, ignoring:', { id, status })
            return
          }

          if (oldStatus === status) {
            console.log('[Orders] UPDATE with same status, no transition:', { id, status })
          }

          setOrders(prev => {
            if (!prev.some(o => o.id === id)) return prev
            if (status === 'pending') {
              return prev.map(o => o.id === id ? { ...o, ...payload.new } : o)
            }
            return prev.filter(o => o.id !== id)
          })

          if (status === 'accepted') {
            setPastOrders(prev => {
              const exists = prev.some(o => o.id === id)
              if (exists) {
                return prev.map(o => o.id === id ? { ...o, ...payload.new, restaurant_tables: o.restaurant_tables || payload.new.restaurant_tables } : o)
              }
              return [{ ...payload.new, restaurant_tables: null }, ...prev].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            })
            supabase.from('live_orders').select('*, restaurant_tables(table_number)').eq('id', id).single().then(({ data }) => {
              if (data) {
                setPastOrders(prev => prev.map(o => o.id === id ? { ...o, ...data } : o))
              }
            })
          } else {
            setPastOrders(prev => prev.filter(o => o.id !== id))
          }
        }
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'live_orders' },
        (payload) => {
          setOrders(prev => prev.filter(o => o.id !== payload.old.id))
          setPastOrders(prev => prev.filter(o => o.id !== payload.old.id))
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (needsReconnectRefetch.current) {
            needsReconnectRefetch.current = false
            loadOrders()
          }
          subscriptionActiveRef.current = true
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          if (subscriptionActiveRef.current) {
            needsReconnectRefetch.current = true
            if (reconnectTimer) clearTimeout(reconnectTimer)
            reconnectTimer = setTimeout(() => {
              if (!subscriptionActiveRef.current) {
                loadOrders()
              }
            }, 10000)
          }
          subscriptionActiveRef.current = false
        }
      })

    return () => {
      document.removeEventListener('click', handleGesture)
      document.removeEventListener('keydown', handleGesture)
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (audioCtxRef.current) { try { audioCtxRef.current.close() } catch { } }
      needsReconnectRefetch.current = false
      subscriptionActiveRef.current = false
      supabase.removeChannel(channel)
    }
  }, [isLoggedIn, restaurantId, preferences.soundEnabled, preferences.orderNotifications, preferences.notificationSound, loadOrders])

  useEffect(() => {
    orderStore.publish(orders, pastOrders)
  }, [orders, pastOrders])

  useEffect(() => {
    if (!isLoggedIn || !restaurantId) return

    let isSubscribed = true
    let channel = null
    let reconnectTimer = null

    const AUTH_RID = restaurantId

    console.log('[Waiter] ⚡ Effect running', { restaurant_id: AUTH_RID })

    const runDiagnostics = async () => {
      try {
        const { data: allInTable, error: allErr } = await supabase
          .from('waiter_calls')
          .select('id, restaurant_id, status')
          .limit(50)
          .order('created_at', { ascending: false })
        if (allErr) {
          console.error('[Waiter] 🩺 DIAG - failed to query waiter_calls:', allErr.message)
          return
        }
        const uniqueRids = [...new Set((allInTable || []).map(r => r.restaurant_id))]
        const statuses = [...new Set((allInTable || []).map(r => r.status))]
        console.log('[Waiter] 🩺 DIAG - waiter_calls table check:', {
          total_in_table: (allInTable || []).length,
          unique_restaurant_ids: uniqueRids,
          statuses_found: statuses,
          pending_count: (allInTable || []).filter(r => r.status === 'pending').length,
          auth_restaurant_id: AUTH_RID,
          auth_rid_matches: uniqueRids.length === 0 || uniqueRids.some(rid => rid === AUTH_RID)
        })
        if (uniqueRids.length > 0 && !uniqueRids.some(rid => rid === AUTH_RID)) {
          console.error('[Waiter] 🩺 DIAG - MISMATCH: auth restaurant_id', AUTH_RID, 'NOT FOUND in waiter_calls records. Found IDs:', uniqueRids)
        }
      } catch (diagErr) {
        console.warn('[Waiter] 🩺 DIAG - exception:', diagErr)
      }
    }

    const enrichTableNumber = async (call) => {
      if (!call.table_id) return { ...call, restaurant_tables: null }
      try {
        const { data: table } = await supabase.from('restaurant_tables').select('id, table_number').eq('id', call.table_id).maybeSingle()
        if (table) {
          return { ...call, restaurant_tables: { table_number: table.table_number } }
        }
      } catch (err) {
        console.warn('[Waiter] enrichTableNumber error:', call.id, err)
      }
      return { ...call, restaurant_tables: null }
    }

    const fetchPending = async () => {
      setWaiterCallsLoading(true)
      try {
        console.log('[Waiter] 🔍 Fetching pending calls for restaurant:', AUTH_RID)
        const { data, error } = await supabase
          .from('waiter_calls')
          .select('id, restaurant_id, table_id, order_code, session_order_id, status, created_at')
          .eq('restaurant_id', AUTH_RID)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
        console.log('[Waiter] 📦 Fetch result:', {
          count: data?.length,
          error: error?.message || null,
          code: error?.code || null,
          filters: { restaurant_id: AUTH_RID, status: 'pending' }
        })
        if (error) throw error
        if (data) {
          const tableIds = [...new Set(data.filter(c => c.table_id).map(c => c.table_id))]
          if (tableIds.length > 0) {
            const { data: tables } = await supabase.from('restaurant_tables').select('id, table_number').in('id', tableIds)
            if (tables) {
              const tMap = {}
              tables.forEach(t => { tMap[t.id] = t.table_number })
              data.forEach(c => { if (c.table_id && tMap[c.table_id]) c.restaurant_tables = { table_number: tMap[c.table_id] } })
            }
          }
          if (isSubscribed) {
            setWaiterCalls(data)
            console.log('[Waiter] ✅ State set with', data.length, 'pending calls')
          }
        }
      } catch (err) {
        console.error('[Waiter] ❌ Fetch error:', err.message || err)
        showToast('Failed to load waiter requests', 'error')
      } finally {
        if (isSubscribed) setWaiterCallsLoading(false)
      }
    }

    const subscribe = () => {
      if (channel) {
        console.log('[Waiter] 🧹 Removing existing channel before resubscribe')
        supabase.removeChannel(channel)
        channel = null
      }

      console.log('[Waiter] 🔌 Creating new subscription for restaurant_id:', AUTH_RID)

      channel = supabase
        .channel('waiter-calls-dashboard')
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'waiter_calls' },
          async (payload) => {
            console.log('[Waiter] 📩 INSERT event RAW payload:', JSON.stringify(payload))
            const rid = payload.new.restaurant_id
            const st = payload.new.status
            console.log('[Waiter] 📩 INSERT event details:', {
              id: payload.new.id,
              restaurant_id: rid,
              expected_restaurant_id: AUTH_RID,
              rid_match: rid === AUTH_RID,
              status: st,
              isPending: st === 'pending',
              table_id: payload.new.table_id,
              order_code: payload.new.order_code,
              session_order_id: payload.new.session_order_id,
              created_at: payload.new.created_at
            })
            if (rid !== AUTH_RID) {
              console.log('[Waiter] ⏭️ INSERT ignored (restaurant_id mismatch):', rid, '!=', AUTH_RID)
              return
            }
            if (st === 'pending') {
              const enriched = await enrichTableNumber(payload.new)
              setWaiterCalls(prev => {
                if (prev.some(c => c.id === enriched.id)) {
                  console.log('[Waiter] ⏭️ Duplicate INSERT ignored:', enriched.id)
                  return prev
                }
                console.log('[Waiter] ➕ Added call via INSERT event:', enriched.id, 'table_number:', enriched.restaurant_tables?.table_number)
                return [enriched, ...prev]
              })
            } else {
              console.log('[Waiter] ⏭️ INSERT ignored (status not pending):', st)
            }
          }
        )
        .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'waiter_calls' },
          (payload) => {
            console.log('[Waiter] 📩 UPDATE event RAW payload:', JSON.stringify(payload))
            const rid = payload.new.restaurant_id
            console.log('[Waiter] 📩 UPDATE event details:', {
              id: payload.new.id,
              old_status: payload.old?.status,
              new_status: payload.new.status,
              restaurant_id: rid,
              expected_restaurant_id: AUTH_RID,
              rid_match: rid === AUTH_RID
            })
            if (rid !== AUTH_RID) {
              console.log('[Waiter] ⏭️ UPDATE ignored (restaurant_id mismatch):', rid, '!=', AUTH_RID)
              return
            }
            if (payload.new.status !== 'pending') {
              setWaiterCalls(prev => {
                const filtered = prev.filter(c => c.id !== payload.new.id)
                if (filtered.length !== prev.length) {
                  console.log('[Waiter] ➖ Removed via UPDATE (status changed to', payload.new.status, '):', payload.new.id)
                } else {
                  console.log('[Waiter] ⏭️ UPDATE ignored (not in current list):', payload.new.id)
                }
                return filtered
              })
            } else {
              setWaiterCalls(prev => {
                if (prev.some(c => c.id === payload.new.id)) {
                  console.log('[Waiter] ⏭️ UPDATE ignored (already in list):', payload.new.id)
                  return prev
                }
                console.log('[Waiter] ➕ Added back via UPDATE (status restored to pending):', payload.new.id)
                return [{ ...payload.new, restaurant_tables: null }, ...prev]
              })
            }
          }
        )
        .on('postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'waiter_calls' },
          (payload) => {
            console.log('[Waiter] 📩 DELETE event RAW payload:', JSON.stringify(payload))
            const rid = payload.old.restaurant_id
            console.log('[Waiter] 📩 DELETE event details:', {
              id: payload.old.id,
              restaurant_id: rid,
              expected_restaurant_id: AUTH_RID,
              rid_match: rid === AUTH_RID
            })
            if (rid !== AUTH_RID) {
              console.log('[Waiter] ⏭️ DELETE ignored (restaurant_id mismatch):', rid, '!=', AUTH_RID)
              return
            }
            setWaiterCalls(prev => {
              const filtered = prev.filter(c => c.id !== payload.old.id)
              if (filtered.length !== prev.length) {
                console.log('[Waiter] ➖ Removed via DELETE event:', payload.old.id)
              } else {
                console.log('[Waiter] ⏭️ DELETE ignored (not in current list):', payload.old.id)
              }
              return filtered
            })
          }
        )
        .subscribe((status, err) => {
          console.log('[Waiter] 📡 Subscription status:', status, err || '')
          if (status === 'SUBSCRIBED') {
            console.log('[Waiter] ✅ Successfully subscribed to waiter_calls changes')
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.warn('[Waiter] ⚠️ Subscription issue:', status, err || '')
            if (isSubscribed) {
              console.log('[Waiter] 🔄 Will attempt resubscribe in 3s...')
              reconnectTimer = setTimeout(() => {
                if (isSubscribed) {
                  console.log('[Waiter] 🔄 Reconnecting waiter-calls channel...')
                  fetchPending()
                  subscribe()
                }
              }, 3000)
            }
          }
        })
    }

    runDiagnostics()
    fetchPending()
    subscribe()

    return () => {
      isSubscribed = false
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (channel) {
        console.log('[Waiter] 🧹 Cleaning up waiter-calls-dashboard channel')
        supabase.removeChannel(channel)
        channel = null
      }
    }
  }, [isLoggedIn, restaurantId])

  // Waiter calls — polling fallback (every 30s) + tab-activation refetch
  useEffect(() => {
    if (!isLoggedIn || !restaurantId) return

    const doFetch = async () => {
      try {
        const { data, error } = await supabase
          .from('waiter_calls')
          .select('id, restaurant_id, table_id, order_code, session_order_id, status, created_at')
          .eq('restaurant_id', restaurantId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })

        if (error) {
          console.error('[Waiter] Poll fetch error:', error.message)
          return
        }
        if (!data) return

        const tableIds = [...new Set(data.filter(c => c.table_id).map(c => c.table_id))]
        if (tableIds.length > 0) {
          const { data: tables } = await supabase.from('restaurant_tables').select('id, table_number').in('id', tableIds)
          if (tables) {
            const tMap = {}
            tables.forEach(t => { tMap[t.id] = t.table_number })
            data.forEach(c => { if (c.table_id && tMap[c.table_id]) c.restaurant_tables = { table_number: tMap[c.table_id] } })
          }
        }

        setWaiterCalls(data)
        console.log('[Waiter] Poll fetch complete:', data.length, 'pending calls')
      } catch (err) {
        console.error('[Waiter] Poll fetch exception:', err)
      }
    }

    // Fetch immediately when the effect runs (covers tab-activation)
    doFetch()

    // Then poll every 30s
    const interval = setInterval(doFetch, 30000)
    return () => clearInterval(interval)
  }, [isLoggedIn, restaurantId, activeTab])

  const openOrdersPopup = useCallback(() => {
    if (window.electronAPI?.showPopup) {
      window.electronAPI.showPopup()
    } else {
      const baseUrl = window.location.origin + window.location.pathname.replace(/\/+$/, '')
      const popupUrl = baseUrl + '?mode=popup-orders'
      const popup = window.open(popupUrl, 'live-orders-popup', 'width=440,height=700,menubar=no,toolbar=no,location=no,status=no')
      if (popup) popup.focus()
    }
  }, [])

  useEffect(() => {
    if (window.electronAPI?.isElectron) return;
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.code === 'Space') {
        e.preventDefault()
        openOrdersPopup()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [openOrdersPopup])

  // [Polling disabled - auto-decline background check removed]

  const handleSaveItem = useCallback(async (id, updates) => {
    const prevItems = [...menuItems]
    setMenuItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item))
    try {
      const { error } = await supabase.from('menu_items').update(updates).eq('id', id)

      if (error) throw error
    } catch (err) {
      setMenuItems(prevItems)
      showToast('Failed to update item', 'error')
    }
  }, [menuItems, showToast])

  const handleDeleteItem = useCallback(async (id) => {
    const prevItems = [...menuItems]
    setMenuItems(prev => prev.filter(item => item.id !== id))
    try {
      const { error } = await supabase.from('menu_items').delete().eq('id', id)

      if (error) throw error
      showToast('Item deleted successfully')
    } catch (err) {
      setMenuItems(prevItems)
      showToast('Failed to delete item', 'error')
    }
  }, [menuItems, showToast])

  const filteredItems = menuItems.filter(item => {
    const matchSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchFilter = filterType === 'all' || (filterType === 'veg' && item.is_veg) || (filterType === 'nonveg' && !item.is_veg)
    return matchSearch && matchFilter
  })

  if (resetMode) {
    return <ResetPassword onDone={() => { setResetMode(false); window.location.hash = '' }} />
  }

  if (!isLoggedIn) return <Login />

  if (authLoading || !initialized) {
    return (
      <div className="app">
        <div className="login-page">
          <div className="login-card skeleton-container">
            <div className="skeleton skeleton-title" style={{ width: '60%', margin: '0 auto 24px' }}></div>
            <div className="skeleton skeleton-text" style={{ width: '100%' }}></div>
            <div className="skeleton skeleton-text" style={{ width: '80%' }}></div>
            <div className="skeleton skeleton-button" style={{ width: '100%', marginTop: '16px' }}></div>
          </div>
        </div>
      </div>
    )
  }

  if (!restaurantId) {
    return (
      <div className="app">
        <div className="login-page">
          <div className="login-card">
            <div className="login-icon">🏪</div>
            <h1 className="login-title">No Restaurant Found</h1>
            <p className="login-subtitle">No restaurant available for your account</p>
            <button className="login-btn" onClick={() => {
              signOut().then(() => window.location.reload()).catch(() => window.location.reload())
            }}>Logout</button>
          </div>
        </div>
      </div>
    )
  }

  const handleAccept = async (orderId) => {
    let movedOrder = null
    setOrders(prev => {
      const order = prev.find(o => o.id === orderId)
      if (order) movedOrder = { ...order, status: 'accepted' }
      return prev.filter(o => o.id !== orderId)
    })
    if (movedOrder) {
      console.log('[Orders] Accepting order:', {
        id: orderId,
        order_code: movedOrder.order_code,
        fromStatus: movedOrder.status,
        toStatus: 'accepted'
      })
      setPastOrders(prev => [movedOrder, ...prev])
    }

    try {
      console.log('[Orders] handleAccept - updating status to accepted:', {
        id: orderId,
        order_code: movedOrder?.order_code,
      })
      const { error } = await supabase.from('live_orders').update({ status: 'accepted' }).eq('id', orderId)
      if (error) throw error
      console.log('[Orders] handleAccept - success:', { id: orderId, order_code: movedOrder?.order_code })
      showToast('Order accepted')
    } catch (err) {
      console.error('[Orders] handleAccept error:', {
        id: orderId,
        message: err.message,
        details: err.details,
        code: err.code,
      })
      if (movedOrder) {
        setOrders(prev => [movedOrder, ...prev])
        setPastOrders(prev => prev.filter(o => o.id !== orderId))
      }
      showToast('Failed to accept order', 'error')
    }
  }

  const handleConfirm = async (orderId) => {
    const prevOrders = [...pastOrders]
    setPastOrders(prev => prev.filter(o => o.id !== orderId))
    try {
      console.log('[Orders] handleConfirm:', { id: orderId })
      const { error } = await supabase.from('live_orders').update({ status: 'confirmed' }).eq('id', orderId)
      if (error) throw error
      console.log('[Orders] handleConfirm - success:', { id: orderId })
      showToast('Order confirmed')
    } catch (err) {
      console.error('[Orders] handleConfirm error:', { id: orderId, message: err.message, code: err.code })
      setPastOrders(prevOrders)
      showToast('Failed to confirm order', 'error')
    }
  }

  const handleComplete = async (orderId) => {
    const prevOrders = [...pastOrders]
    setPastOrders(prev => prev.filter(o => o.id !== orderId))
    try {
      console.log('[Orders] handleComplete:', { id: orderId })
      const { error } = await supabase.from('live_orders').update({ status: 'completed' }).eq('id', orderId)
      if (error) throw error
      console.log('[Orders] handleComplete - success:', { id: orderId })
      showToast('Order completed')
    } catch (err) {
      console.error('[Orders] handleComplete error:', { id: orderId, message: err.message, code: err.code })
      setPastOrders(prevOrders)
      showToast('Failed to complete order', 'error')
    }
  }

  const handleDecline = async (orderId, orderCode) => {
    const confirmDelete = window.confirm(`Decline order #${orderCode || orderId.slice(0, 8)}?\n\nThis cannot be undone.`)
    if (!confirmDelete) return

    try {
      console.log('[Orders] handleDecline:', { id: orderId, order_code: orderCode })
      const { error } = await supabase.from('live_orders').delete().eq('id', orderId)

      if (error) throw error
      setOrders(prev => prev.filter(o => o.id !== orderId))
      console.log('[Orders] handleDecline - success:', { id: orderId, order_code: orderCode })
      showToast('Order declined')
    } catch (err) {
      console.error('[Orders] handleDecline error:', { id: orderId, message: err.message, code: err.code })
      showToast('Failed to decline order', 'error')
    }
  }

  const handleResolveWaiter = async (callId) => {
    let removedCall = null
    setWaiterCalls(prev => {
      const call = prev.find(c => c.id === callId)
      if (!call) return prev
      removedCall = call
      return prev.filter(c => c.id !== callId)
    })
    try {
      const { error } = await supabase.from('waiter_calls').delete().eq('id', callId)
      if (error) throw error
      showToast('Waiter request resolved')
    } catch (err) {
      console.error('[Waiter] handleResolveWaiter error:', err)
      if (removedCall) {
        setWaiterCalls(prev => {
          if (prev.some(c => c.id === removedCall.id)) return prev
          return [removedCall, ...prev]
        })
      }
      showToast('Failed to resolve waiter request', 'error')
    }
  }

  const handleAddItem = async (itemData) => {
    try {
      const { data, error } = await supabase
        .from('menu_items')
        .insert({
          name: itemData.name,
          description: itemData.description,
          price: itemData.price,
          image_url: itemData.image_url,
          is_veg: itemData.is_veg,
          is_available: itemData.is_available,
          category_id: itemData.category_id || null,
          restaurant_id: restaurantId
        })
        .select()
        .single()

      if (error) throw error

      setMenuItems(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setShowAddModal(false)
      showToast('Item added successfully')
    } catch (err) {
      showToast('Failed to add item', 'error')
    }
  }



  return (
    <div className="app">
      {toast && <Toast message={toast.message} type={toast.type} />}
      <OfflineBanner />

      <header className="header">
        <button className="menu-btn" onClick={() => setSidebarOpen(true)}>☰</button>
<h2 className="header-title">
  {activeTab === 'analytics' && 'Analytics'}
  {activeTab === 'menu_items' && 'Menu Items'}
  {activeTab === 'categories' && 'Categories'}
  {activeTab === 'tables' && 'Tables'}
  {activeTab === 'settings' && 'Settings'}
  {activeTab === 'live-orders' && 'Live Orders'}
  {activeTab === 'waiter-call' && 'Waiter Call'}
  {activeTab === 'past-orders' && 'Past Orders'}
</h2>
        <div className="header-notifications">
          {waiterCalls.length > 0 && (
            <button
              className="header-waiter-bell"
              onClick={() => setActiveTab('waiter-call')}
              title={`${waiterCalls.length} waiter request${waiterCalls.length !== 1 ? 's' : ''}`}
            >
              <span className="bell-icon">🔔</span>
              <span className="bell-badge">{waiterCalls.length}</span>
            </button>
          )}
        </div>
        <div className="profile-wrapper" ref={profileRef}>
          <div className="profile-icon" onClick={() => setShowProfile(!showProfile)} title={userFullName}>
            {userFullName ? userFullName.charAt(0).toUpperCase() : '?'}
          </div>
          {showProfile && (
            <div className="profile-dropdown">
              <div className="profile-info">
                <p className="profile-name"><strong>{userFullName}</strong></p>
                <p className="profile-role">{userRole.charAt(0).toUpperCase() + userRole.slice(1)}</p>
                <p className="profile-id">ID: {(profile?.id || session?.user?.id || '').slice(0, 8)}...</p>
              </div>
              <div className="profile-divider"></div>
              <button className="profile-btn" onClick={handleLogout}>Logout</button>
            </div>
          )}
        </div>
      </header>

      <main className="main-content">
        {activeTab === 'analytics' && <OverviewPage restaurantId={restaurantId} />}

        {activeTab === 'menu_items' && (
          <div className="menu-section">
            <div className="menu-header-row">
              <div className="menu-stats">
                <span className="stat-label">Total Items</span>
                <span className="stat-value">{menuItems.length}</span>
              </div>
              <button onClick={() => {
                setMenuLoading(true)
                supabase.from('menu_items').select('id, name, price, description, is_veg, is_available, category_id, image_url').eq('restaurant_id', restaurantId).order('name', { ascending: true })
                  .then(({ data, error }) => {
                    if (error) {
                      setToast ? setToast({ message: 'Failed to load menu items', type: 'error' }) : null
                    } else {
                      setMenuItems(data || [])
                    }
                    setMenuLoading(false)
                  })
              }} className="refresh-btn-glass">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 4v6h-6M1 20v-6h6" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
                Refresh
              </button>
            </div>
            <div className="menu-controls">
              <div className="search-box">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  placeholder="Search menu items..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="filter-tabs">
                <button
                  className={`filter-tab ${filterType === 'all' ? 'active' : ''}`}
                  onClick={() => setFilterType('all')}
                >
                  All
                </button>
                <button
                  className={`filter-tab ${filterType === 'veg' ? 'active' : ''}`}
                  onClick={() => setFilterType('veg')}
                >
                  🟢 Veg
                </button>
                <button
                  className={`filter-tab ${filterType === 'nonveg' ? 'active' : ''}`}
                  onClick={() => setFilterType('nonveg')}
                >
                  🔴 Non-Veg
                </button>
              </div>

              <button className="add-btn" onClick={() => setShowAddModal(true)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add Item
              </button>
            </div>

            {menuLoading ? (
              <div className="loading-grid">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="skeleton-card">
                    <div className="skeleton-line"></div>
                    <div className="skeleton-line short"></div>
                    <div className="skeleton-line"></div>
                  </div>
                ))}
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">{searchQuery || filterType !== 'all' ? '🔍' : '🍽️'}</div>
                <h3>{searchQuery || filterType !== 'all' ? 'No items found' : 'No menu items yet'}</h3>
                <p>{searchQuery || filterType !== 'all'
                  ? 'Try adjusting your search or filter to find what you\'re looking for.'
                  : 'Start building your menu by adding your first item.'}</p>
                <button className="add-btn" onClick={() => {
                  if (searchQuery || filterType !== 'all') {
                    setSearchQuery('')
                    setFilterType('all')
                  } else {
                    setShowAddModal(true)
                  }
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  {searchQuery || filterType !== 'all' ? 'Clear filters' : 'Add your first item'}
                </button>
              </div>
            ) : (
              <div className="menu-list">
                {filteredItems.map(item => (
                  <MenuItemCard
                    key={item.id}
                    item={item}
                    onSave={handleSaveItem}
                    onDelete={handleDeleteItem}
                    categories={categories}
                  />
                ))}
              </div>
            )}

            {filteredItems.length > 0 && (
              <div className="menu-footer">
                <div className="filter-summary">
                  <span className="summary-text">
                    Showing {filteredItems.length} of {menuItems.length} items
                    {searchQuery && ` for "${searchQuery}"`}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'categories' && <CategoriesPage restaurantId={restaurantId} />}

        {activeTab === 'tables' && <TablesPage restaurantId={restaurantId} restaurantSlug={restaurantSlug} />}

        {activeTab === 'settings' && <SettingsPage preferences={preferences} setPreferences={setPreferences} onToast={showToast} restaurantId={restaurantId} />}

        {activeTab === 'featured' && <FeaturedItemsPanel restaurantId={restaurantId} />}

        {activeTab === 'live-orders' && null}

        {activeTab === 'waiter-call' && (
          <div className="waiter-call-page">
            <div className="waiter-call-header">
              <div className="waiter-call-stats">
                <span className="stat-label">Active Requests</span>
                <span className="stat-value">{waiterCalls.length}</span>
              </div>
            </div>

            {waiterCallsLoading ? (
              <div className="loading-state">
                <div className="loading-spinner"></div>
                <p>Loading waiter requests...</p>
              </div>
            ) : waiterCalls.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🔔</div>
                <h3>No waiter calls</h3>
                <p>Customer requests for assistance will appear here in realtime</p>
              </div>
            ) : (
              <div className="waiter-call-list">
                {waiterCalls.map(call => {
                  const tableNum = call.table_number || (call.restaurant_tables?.table_number) || call.table_id?.slice(0, 8) || '—'
                  const note = call.note || null
                  return (
                    <div key={call.id} className="waiter-call-card">
                      <div className="waiter-call-card-top">
                        <div className="waiter-call-card-left">
                          <span className="waiter-call-table-icon">🛎️</span>
                          <div className="waiter-call-card-info">
                            <span className="waiter-call-table-number">Table {tableNum}</span>
                            {note && <span className="waiter-call-note">{note}</span>}
                          </div>
                        </div>
                        <span className="waiter-call-time">{call.created_at ? formatOrderDateTime(call.created_at) : ''}</span>
                      </div>
                      <div className="waiter-call-card-actions">
                        <button
                          className="waiter-call-resolve-btn"
                          onClick={() => handleResolveWaiter(call.id)}
                          disabled={call._resolving}
                        >
                          {call._resolving ? 'Resolving...' : '✓ Confirm'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'past-orders' && <PastOrdersPage pastOrders={pastOrders} loading={loading} onToast={showToast} />}
      </main>

      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} activeTab={activeTab} setActiveTab={setActiveTab} onOpenOrders={openOrdersPopup} waiterCalls={waiterCalls} />

      {showAddModal && (
        <AddItemModal
          onSave={handleAddItem}
          onClose={() => setShowAddModal(false)}
          categories={categories}
        />
      )}

    </div>
  )
}

function Sidebar({ isOpen, onClose, activeTab, setActiveTab, onOpenOrders, waiterCalls }) {
  return (
    <>
      {isOpen && <div className="overlay" onClick={onClose} />}
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h2>Menu</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => { setActiveTab('analytics'); onClose(); }}
          >
            📊 Analytics
          </button>
          <button
            className={`nav-item ${activeTab === 'menu_items' ? 'active' : ''}`}
            onClick={() => { setActiveTab('menu_items'); onClose(); }}
          >
            🍽️ Menu Items
          </button>
          <button
            className={`nav-item ${activeTab === 'categories' ? 'active' : ''}`}
            onClick={() => { setActiveTab('categories'); onClose(); }}
          >
            📂 Categories
          </button>
          <button
            className={`nav-item ${activeTab === 'featured' ? 'active' : ''}`}
            onClick={() => { setActiveTab('featured'); onClose(); }}
          >
            🎯 Featured
          </button>
          <button
            className={`nav-item ${activeTab === 'live-orders' ? 'active' : ''}`}
            onClick={() => { onOpenOrders?.(); onClose(); }}
          >
            🔴 Live Orders
          </button>
          <button
            className={`nav-item ${activeTab === 'waiter-call' ? 'active' : ''}`}
            onClick={() => { setActiveTab('waiter-call'); onClose(); }}
          >
            <span className="nav-item-content">
              <span>🛎️ Waiter Call</span>
              {waiterCalls.length > 0 && (
                <span className="nav-badge">{waiterCalls.length}</span>
              )}
            </span>
          </button>
          <button
            className={`nav-item ${activeTab === 'past-orders' ? 'active' : ''}`}
            onClick={() => { setActiveTab('past-orders'); onClose(); }}
          >
            📋 Past Orders
          </button>
          <button
            className={`nav-item ${activeTab === 'tables' ? 'active' : ''}`}
            onClick={() => { setActiveTab('tables'); onClose(); }}
          >
            🪑 Tables
          </button>
          <button
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => { setActiveTab('settings'); onClose(); }}
          >
            ⚙️ Settings
          </button>
        </nav>
      </aside>
    </>
  )
}



export default App