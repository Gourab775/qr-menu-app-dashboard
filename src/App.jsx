import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react'
import { supabase } from './lib/supabase'
import { useAuth } from './contexts/AuthContext'
import { fetchWithTimeout, deduplicateRequest } from './lib/apiUtils'
import { deleteMenuItemImage } from './services/supabaseStorageService'
import MenuItemCard from './components/MenuItemCard'
import AddItemModal from './components/AddItemModal'
import Toast from './components/Toast'
import UpdateNotification from './components/UpdateNotification'
import Login from './components/Login'
import OfflineBanner from './components/OfflineBanner'
import FeaturedItemsPanel from './components/FeaturedItemsPanel'
import { formatDateTime, formatOrderDateTime } from './utils/formatDateTime'
import * as orderStore from './services/orderStore'

import { IconStore, IconSearch, IconUtensils, IconBellRing, IconBell, IconBarChart, IconFolder, IconTarget, IconClipboard, IconTable, IconSettings, IconLock, IconShoppingBag } from './components/Icons'
import { hasFeature, getDefaultTab, PLAN_LABELS } from './constants/plans'
import './App.css'
import './theme.css'

const CategoriesPage = lazy(() => import('./pages/CategoriesPage'))
const OverviewPage = lazy(() => import('./pages/OverviewPage'))
const PosPage = lazy(() => import('./pages/PosPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const TablesPage = lazy(() => import('./pages/TablesPage'))
const PastOrdersPage = lazy(() => import('./pages/PastOrdersPage'))
const LiveOrdersPage = lazy(() => import('./pages/LiveOrdersPage'))

const API_TIMEOUT = 30000
const CURRENT_VERSION = "2.0.0"

// Maps tab names (with dashes) to feature keys (with underscores)
function tabToFeature(tab) {
  return ({ 'live-orders': 'live_orders', 'waiter-call': 'waiter_calls', 'past-orders': 'past_orders' })[tab] || tab
}

function App() {
  const { session, profile, loading: authLoading, initialized, signOut, role, restaurantId, plan, userDataLoading, restaurantSlug, restaurantName } = useAuth()
  const [orders, setOrders] = useState([])
  const [pastOrders, setPastOrders] = useState([])
  const [waiterCalls, setWaiterCalls] = useState([])
  const [waiterCallsLoading, setWaiterCallsLoading] = useState(false)
  const [hasNewWaiterCall, setHasNewWaiterCall] = useState(false)
  const [menuItems, setMenuItems] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(false)
  const [menuLoading, setMenuLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeTab, setActiveTab] = useState(() => {
    try { return localStorage.getItem('dashboard_current_page') || 'analytics' } catch { return 'analytics' }
  })
  const [hasUnseenOrders, setHasUnseenOrders] = useState(false)
  const activeTabRef = useRef(activeTab)
  const previousPageRef = useRef('analytics')
  const [showProfile, setShowProfile] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [toast, setToast] = useState(null)
  const [updateNotification, setUpdateNotification] = useState(null)
  const updateNotificationShownRef = useRef(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [preferences, setPreferences] = useState(() => {
    try {
      const saved = localStorage.getItem('dashboard_preferences')
      const orderEnabled = localStorage.getItem('order_sound_enabled')
      const waiterEnabled = localStorage.getItem('waiter_sound_enabled')
      const base = saved ? JSON.parse(saved) : {
        soundEnabled: true,
        orderNotifications: true,
        autoDeclineTimeout: 10,
        theme: 'dark',
        order_notification_sound: 'classic-notification',
        waiter_notification_sound: 'service-bell'
      }
      return {
        ...base,
        order_sound_enabled: orderEnabled !== null ? orderEnabled === 'true' : true,
        waiter_sound_enabled: waiterEnabled !== null ? waiterEnabled === 'true' : true
      }
    } catch {
      return { soundEnabled: true, orderNotifications: true, autoDeclineTimeout: 10, theme: 'dark', order_notification_sound: 'classic-notification', waiter_notification_sound: 'service-bell', order_sound_enabled: true, waiter_sound_enabled: true }
    }
  })

  useEffect(() => {
    const root = document.documentElement
    if (preferences.theme === 'light') {
      root.classList.add('light-theme')
    } else {
      root.classList.remove('light-theme')
    }
  }, [preferences.theme])

  useEffect(() => {
    if (!activeTab) return
    activeTabRef.current = activeTab
    if (activeTab === 'live-orders') setHasUnseenOrders(false)
    if (activeTab === 'waiter-call') setHasNewWaiterCall(false)
    try { localStorage.setItem('dashboard_current_page', activeTab) } catch {}
  }, [activeTab])

  const currentPlan = (plan || 'plus').toLowerCase().trim()

  // Redirect to default tab if current tab's feature is not available on this plan
  useEffect(() => {
    if (!currentPlan || !activeTab) return
    const feature = tabToFeature(activeTab)
    if (!hasFeature(currentPlan, feature)) {
      const defaultTab = getDefaultTab(currentPlan)
      setActiveTab(defaultTab)
    }
  }, [currentPlan])

  const profileRef = useRef(null)
  const abortControllerRef = useRef(null)
  const ordersLoadingRef = useRef(false)

  const isMountedRef = useRef(true)
  const logoutRef = useRef(false)
  const firstOrdersFetchDone = useRef(false)
  const ordersFetchFailedRef = useRef(false)

  const waiterPlayFnRef = useRef(null)
  const ordersChannelRef = useRef(null)
  const waiterChannelRef = useRef(null)

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
        const baseSelect = 'id, restaurant_id, total_price, status, items, created_at, order_code, table_id, note, order_type, restaurant_tables(table_number)'

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

      setOrders([])
      setPastOrders([])
      setMenuItems([])
      setCategories([])

      window.location.hash = ''
    } catch (err) {
      console.error('Logout error:', err)
      window.location.hash = ''
    } finally {
      logoutRef.current = false
    }
  }, [signOut])

  // Fetch all initial data in parallel when restaurantId is available
  useEffect(() => {
    if (!isLoggedIn || !restaurantId) return
    isMountedRef.current = true

    const controller = new AbortController()
    abortControllerRef.current = controller

    const doLoad = async () => {
      setMenuLoading(true)
      try {
        const [catResult] = await Promise.all([
          fetchWithTimeout(
            supabase.from('categories').select('id, name, image, sort_order').eq('restaurant_id', restaurantId).order('sort_order', { ascending: true }),
            API_TIMEOUT
          )
        ])

        if (!isMountedRef.current || controller.signal.aborted) return

        if (catResult?.data) {
          setCategories(catResult.data || [])
        }

        const menuPromise = supabase.from('menu_items').select('id, name, price, description, is_veg, is_available, category_id, image_url').eq('restaurant_id', restaurantId).order('name', { ascending: true })
        const { data: itemData, error: itemErr } = await fetchWithTimeout(menuPromise, API_TIMEOUT)
        if (!isMountedRef.current || controller.signal.aborted) return
        if (itemErr) {
          console.error('[Menu] Load error:', itemErr)
          setToast({ message: 'Failed to load menu items', type: 'error' })
        } else {
          setMenuItems(itemData || [])
        }
      } catch (err) {
        console.error('[DataLoad] Error:', err)
      } finally {
        setMenuLoading(false)
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
    if (!hasFeature(currentPlan, 'live_orders')) return

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
  }, [isLoggedIn, restaurantId, loadOrders, currentPlan])

  useEffect(() => {
    if (!isLoggedIn || !restaurantId) return
    if (!hasFeature(currentPlan, 'live_orders')) return

    const lastPlayedOrderRef = { current: null }
    const processedEventIdsRef = { current: new Set() }
    const soundReadyRef = { current: false }
    const audioCtxRef = { current: null }

    const ORDER_SOUNDS = [
      { id: 'classic-notification', name: 'Classic Notification', freq: [800, 1000], duration: 0.2 },
      { id: 'restaurant-alert', name: 'Restaurant Alert', freq: [600, 900, 1200], duration: 0.4 },
      { id: 'soft-chime', name: 'Soft Chime', freq: [523, 659, 784], duration: 0.5 },
      { id: 'digital-alert', name: 'Digital Alert', freq: [1000, 1500, 2000], duration: 0.3 }
    ]

    const WAITER_SOUNDS = [
      { id: 'service-bell', name: 'Service Bell', freq: [800, 1200], duration: 0.5 },
      { id: 'counter-bell', name: 'Counter Bell', freq: [1000, 1500], duration: 0.4 },
      { id: 'reception-bell', name: 'Reception Bell', freq: [600, 900, 1200], duration: 0.6 },
      { id: 'soft-bell', name: 'Soft Bell', freq: [700, 1000], duration: 0.4 }
    ]

    const createSound = (soundList, soundId) => {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (!AudioContext) return null
      try {
        const ctx = new AudioContext()
        const selSound = soundList.find(s => s.id === soundId) || soundList[0]
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

    let orderPlayFn = null
    let waiterPlayFn = null
    const initAudio = () => {
      if (soundReadyRef.current) return
      orderPlayFn = createSound(ORDER_SOUNDS, preferences.order_notification_sound)
      waiterPlayFn = createSound(WAITER_SOUNDS, preferences.waiter_notification_sound)
      waiterPlayFnRef.current = waiterPlayFn
      soundReadyRef.current = true
    }

    const handleGesture = () => { initAudio(); document.removeEventListener('click', handleGesture); document.removeEventListener('keydown', handleGesture) }
    document.addEventListener('click', handleGesture)
    document.addEventListener('keydown', handleGesture)

    const playOrderSound = () => {
      if (localStorage.getItem('order_sound_enabled') === 'false' || !orderPlayFn) return
      try { orderPlayFn() } catch { }
    }

    if (!restaurantId) {
      return
    }

    if (ordersChannelRef.current) {
      supabase.removeChannel(ordersChannelRef.current)
      ordersChannelRef.current = null
    }

    const ordersChannel = supabase
      .channel(`live-orders-${restaurantId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_orders', filter: `restaurant_id=eq.${restaurantId}` },
        (payload) => {
          if (payload.new.restaurant_id !== restaurantId) {
            console.error('[CROSS-TENANT] INSERT event with mismatched restaurant_id:', {
              channelRestaurantId: restaurantId,
              eventRestaurantId: payload.new.restaurant_id,
              orderId: payload.new.id
            })
            return
          }
          const newOrderId = payload.new.id
          const rawStatus = payload.new.status
          const newStatus = rawStatus || 'pending'

          if (processedEventIdsRef.current.has(newOrderId)) {
            return
          }
          processedEventIdsRef.current.add(newOrderId)
          if (lastPlayedOrderRef.current === newOrderId) return
          lastPlayedOrderRef.current = newOrderId

          const fetchAndAddOrder = async () => {
            const { data: freshOrder } = await supabase
              .from('live_orders').select('*, restaurant_tables(table_number)')
              .eq('id', newOrderId).eq('restaurant_id', restaurantId).single()
            if (!freshOrder) return

            let resolved = freshOrder
            if (freshOrder.table_id && !freshOrder.restaurant_tables?.table_number) {
              const { data: tr } = await supabase.from('restaurant_tables').select('id, table_number').eq('id', freshOrder.table_id).maybeSingle()
              if (tr) resolved = { ...freshOrder, restaurant_tables: { table_number: tr.table_number } }
            }

            if (newStatus === 'pending') {
              setOrders(prev => {
                if (prev.some(o => o.id === newOrderId)) {
                  return prev.map(o => o.id === newOrderId ? { ...o, ...resolved } : o)
                }
                playOrderSound()
                return [resolved, ...prev].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
              })
              if (activeTabRef.current !== 'live-orders') {
                setHasUnseenOrders(true)
              }
            } else if (newStatus === 'accepted') {
              setPastOrders(prev => {
                if (prev.some(o => o.id === newOrderId)) return prev.map(o => o.id === newOrderId ? { ...o, ...resolved } : o)
                return [resolved, ...prev].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
              })
            } else {
              setOrders(prev => {
                if (prev.some(o => o.id === newOrderId)) return prev
                return [resolved, ...prev].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
              })
            }
          }
          fetchAndAddOrder()
        }
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'live_orders', filter: `restaurant_id=eq.${restaurantId}` },
        (payload) => {
          if (payload.new.restaurant_id !== restaurantId) {
            console.error('[CROSS-TENANT] UPDATE event with mismatched restaurant_id:', {
              channelRestaurantId: restaurantId,
              eventRestaurantId: payload.new.restaurant_id,
              orderId: payload.new.id
            })
            return
          }
          const { id, status } = payload.new
          const oldStatus = payload.old?.status

          if (status !== 'pending' && status !== 'accepted' && status !== 'confirmed' && status !== 'completed') {
            return
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
            supabase.from('live_orders').select('*, restaurant_tables(table_number)').eq('id', id).eq('restaurant_id', restaurantId).single().then(({ data }) => {
              if (data) {
                setPastOrders(prev => prev.map(o => o.id === id ? { ...o, ...data } : o))
              }
            })
          } else {
            setPastOrders(prev => prev.filter(o => o.id !== id))
          }
        }
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'live_orders', filter: `restaurant_id=eq.${restaurantId}` },
        (payload) => {
          setOrders(prev => prev.filter(o => o.id !== payload.old.id))
          setPastOrders(prev => prev.filter(o => o.id !== payload.old.id))
        }
      )

    try {
      ordersChannel.subscribe()
      ordersChannelRef.current = ordersChannel
    } catch (err) {
      console.error('[Realtime] Orders subscription failed:', err)
    }

    return () => {
      document.removeEventListener('click', handleGesture)
      document.removeEventListener('keydown', handleGesture)
      if (audioCtxRef.current) { try { audioCtxRef.current.close() } catch { } }
      if (ordersChannelRef.current) {
        supabase.removeChannel(ordersChannelRef.current)
        ordersChannelRef.current = null
      }
    }
  }, [isLoggedIn, restaurantId, preferences.order_notification_sound, preferences.waiter_notification_sound, currentPlan])

  useEffect(() => {
    orderStore.publish(orders, pastOrders)
  }, [orders, pastOrders])

  // WAITER CALLS — fetch + realtime only, no polling
  useEffect(() => {
    if (!isLoggedIn || !restaurantId) return

    const waiterChannelName = `waiter-live-${restaurantId}`

    if (waiterChannelRef.current) {
      supabase.removeChannel(waiterChannelRef.current)
      waiterChannelRef.current = null
    }

    let isSubscribed = true

    const channel = supabase
      .channel(waiterChannelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'waiter_calls',
          filter: `restaurant_id=eq.${restaurantId}`
        },
        (payload) => {
          if (payload.new && payload.new.restaurant_id !== restaurantId) {
            console.error('[CROSS-TENANT] Waiter call event with mismatched restaurant_id:', {
              channelRestaurantId: restaurantId,
              eventRestaurantId: payload.new.restaurant_id,
              callId: payload.new.id
            })
            return
          }
          if (payload.eventType === 'INSERT') {
            supabase
              .from('restaurant_tables')
              .select('id, table_number')
              .eq('id', payload.new.table_id)
              .maybeSingle()
              .then(({ data: table }) => {
                setWaiterCalls(prev => [{
                  ...payload.new,
                  restaurant_tables: table || null
                }, ...prev])
              })
            if (activeTabRef.current !== 'waiter-call') {
              setHasNewWaiterCall(true)
            }
            if (localStorage.getItem('waiter_sound_enabled') !== 'false' && waiterPlayFnRef.current) {
              try { waiterPlayFnRef.current() } catch {}
            }
          }
          if (payload.eventType === 'UPDATE') {
            if (payload.new && payload.new.restaurant_id !== restaurantId) {
              console.error('[CROSS-TENANT] Waiter call UPDATE with mismatched restaurant_id:', {
                channelRestaurantId: restaurantId,
                eventRestaurantId: payload.new.restaurant_id,
                callId: payload.new.id
              })
              return
            }
            setWaiterCalls(prev => prev.filter(x => x.id !== payload.new.id))
          }
        }
      )

    try {
      channel.subscribe()
      waiterChannelRef.current = channel
    } catch (err) {
      console.error('[Realtime] Waiter subscription failed:', err)
    }

    const fetchWaiterCalls = async () => {
      if (!restaurantId) {
        if (isSubscribed) setWaiterCallsLoading(false)
        return
      }
      setWaiterCallsLoading(true)
      const { data, error } = await supabase
        .from("waiter_calls")
        .select(`
          *,
          restaurant_tables!table_id(
            id,
            table_number
          )
        `)
        .eq('restaurant_id', restaurantId)
        .order("created_at", { ascending: false })

      if (error) {
        if (isSubscribed) setWaiterCalls([])
        if (isSubscribed) setWaiterCallsLoading(false)
        return
      }

      if (data) setWaiterCalls(data)
      if (isSubscribed) setWaiterCallsLoading(false)
    }

    fetchWaiterCalls()

    return () => {
      isSubscribed = false
      if (waiterChannelRef.current) {
        supabase.removeChannel(waiterChannelRef.current)
        waiterChannelRef.current = null
      }
    }
  }, [isLoggedIn, restaurantId])

  // App version update checker — one-time query only, no realtime subscription
  useEffect(() => {
    if (!isLoggedIn) return

    supabase
      .from('app_versions')
      .select('*')
      .eq('app_name', 'dashboard')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error('[UpdateCheck] Query error:', error)
          return
        }
        if (data && data.version !== CURRENT_VERSION) {
          const shownKey = `update_${data.version}`
          if (updateNotificationShownRef.current === shownKey) return
          updateNotificationShownRef.current = shownKey
          setUpdateNotification(data)
        }
      })
  }, [isLoggedIn])

  const handleUpdateNow = useCallback((updateUrl) => {
    if (updateUrl) {
      window.open(updateUrl, '_blank', 'noopener,noreferrer')
    }
    setUpdateNotification(null)
  }, [])

  const handleDismissUpdate = useCallback(() => {
    setUpdateNotification(null)
  }, [])

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
    if (updates.name !== undefined) {
      const name = (updates.name || '').trim()
      if (!name || name.length > 22 || !/^[a-zA-Z0-9]+(?: [a-zA-Z0-9]+)*$/.test(name)) return
      updates.name = name
    }
    if (updates.description !== undefined) {
      const desc = (updates.description || '').replace(/\s+/g, ' ').trim()
      if (desc && (desc.length > 60 || !/^[a-zA-Z0-9 .,!?;:'"\-()&\/@#]+$/.test(desc))) return
      updates.description = desc
    }
    const oldItem = menuItems.find(item => item.id === id)
    const oldImageUrl = oldItem?.image_url
    const prevItems = [...menuItems]
    setMenuItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item))
    try {
      if (updates.image_url !== undefined && oldImageUrl && updates.image_url !== oldImageUrl) {
        try {
          await deleteMenuItemImage(oldImageUrl)
        } catch (deleteErr) {
          console.error('[App] Failed to delete old menu item image:', deleteErr.message)
        }
      }
      const { error } = await supabase.from('menu_items').update(updates).eq('id', id).eq('restaurant_id', restaurantId)

      if (error) throw error
    } catch (err) {
      setMenuItems(prevItems)
      showToast('Failed to update item', 'error')
    }
  }, [menuItems, showToast, restaurantId])

  const handleDeleteItem = useCallback(async (id) => {
    const item = menuItems.find(i => i.id === id)
    const prevItems = [...menuItems]
    setMenuItems(prev => prev.filter(item => item.id !== id))
    try {
      if (item?.image_url) {
        try {
          await deleteMenuItemImage(item.image_url)
        } catch (deleteErr) {
          console.error('[App] Failed to delete menu item image:', deleteErr.message)
        }
      }
      const { error } = await supabase.from('menu_items').delete().eq('id', id).eq('restaurant_id', restaurantId)

      if (error) throw error
      showToast('Item deleted successfully')
    } catch (err) {
      setMenuItems(prevItems)
      showToast('Failed to delete item', 'error')
    }
  }, [menuItems, showToast, restaurantId])

  const filteredItems = useMemo(() => menuItems.filter(item => {
    const matchSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchFilter = filterType === 'all' || (filterType === 'veg' && item.is_veg) || (filterType === 'nonveg' && !item.is_veg)
    const matchCategory = categoryFilter === 'all' || item.category_id === categoryFilter
    return matchSearch && matchFilter && matchCategory
  }), [menuItems, searchQuery, filterType, categoryFilter])

  if (!isLoggedIn) return <Login />

  if (authLoading || !initialized || userDataLoading) {
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
            <div className="login-icon"><IconStore size={48} /></div>
            <h1 className="login-title">No Restaurant Found</h1>
            <p className="login-subtitle">No restaurant available for your account</p>
            <button className="login-btn" onClick={() => {
              signOut().catch(() => {})
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
      setPastOrders(prev => [movedOrder, ...prev])
    }

    try {
      const { error } = await supabase.from('live_orders').update({ status: 'accepted' }).eq('id', orderId).eq('restaurant_id', restaurantId)
      if (error) throw error
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
      const { error } = await supabase.from('live_orders').update({ status: 'confirmed' }).eq('id', orderId).eq('restaurant_id', restaurantId)
      if (error) throw error
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
      const { error } = await supabase.from('live_orders').update({ status: 'completed' }).eq('id', orderId).eq('restaurant_id', restaurantId)
      if (error) throw error
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
      const { error } = await supabase.from('live_orders').delete().eq('id', orderId).eq('restaurant_id', restaurantId)

      if (error) throw error
      setOrders(prev => prev.filter(o => o.id !== orderId))
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
      const { error } = await supabase.from('waiter_calls').delete().eq('id', callId).eq('restaurant_id', restaurantId)
      if (error) throw error
      showToast('Waiter request resolved')
      if (previousPageRef.current) setActiveTab(previousPageRef.current)
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
      const name = (itemData.name || '').trim()
      const desc = (itemData.description || '').replace(/\s+/g, ' ').trim()
      if (!name || !desc || !itemData.category_id || !itemData.price) {
        console.error('[Menu] Add item validation failed:', { name, desc, category_id: itemData.category_id, price: itemData.price })
        showToast('Missing required fields', 'error')
        return
      }
      console.log('[Menu] Inserting item:', { name, price: itemData.price, image_url: itemData.image_url ? '(present)' : '(empty)', category_id: itemData.category_id, restaurantId })
      const { data, error } = await supabase
        .from('menu_items')
        .insert({
          name,
          description: desc,
          price: Number(itemData.price),
          image_url: itemData.image_url,
          is_veg: itemData.is_veg,
          is_available: itemData.is_available,
          category_id: itemData.category_id,
          restaurant_id: restaurantId
        })
        .select('id, name, price, description, is_veg, is_available, category_id, image_url')
        .single()

      if (error) {
        console.error('[Menu] Insert error:', error)
        throw error
      }

      if (!data) {
        console.error('[Menu] Insert succeeded but no data returned (RLS or server issue)')
        // Item IS in DB — re-fetch all items to reconcile
        const { data: refreshed, error: refetchError } = await supabase
          .from('menu_items')
          .select('id, name, price, description, is_veg, is_available, category_id, image_url')
          .eq('restaurant_id', restaurantId)
          .order('name', { ascending: true })
        if (refetchError) throw refetchError
        setMenuItems(refreshed || [])
        setShowAddModal(false)
        showToast('Item added successfully')
        return
      }

      console.log('[Menu] Insert success, item returned:', { id: data.id, name: data.name })
      setMenuItems(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setShowAddModal(false)
      showToast('Item added successfully')
    } catch (err) {
      console.error('[Menu] Add item failed:', err.message)
      showToast('Failed to add item', 'error')
    }
  }



  return (
    <div className="app">
      {toast && <Toast message={toast.message} type={toast.type} />}
      <UpdateNotification
        update={updateNotification}
        onUpdate={handleUpdateNow}
        onDismiss={handleDismissUpdate}
      />
      {updateNotification?.force_update && <div className="update-block-overlay" />}
      <OfflineBanner />

      <header className="header">
        <button className="menu-btn" onClick={() => setSidebarOpen(true)}>
          ☰
          {(hasUnseenOrders || orders.length > 0) && <span className="menu-btn-badge" />}
        </button>
<h2 className="header-title">
  {activeTab === 'analytics' && 'Analytics'}
  {activeTab === 'pos' && 'POS Billing'}
  {activeTab === 'menu_items' && 'Menu Items'}
  {activeTab === 'categories' && 'Categories'}
  {activeTab === 'tables' && 'Tables'}
  {activeTab === 'settings' && 'Settings'}
  {activeTab === 'live-orders' && 'Live Orders'}
  {activeTab === 'waiter-call' && 'Waiter Call'}
  {activeTab === 'past-orders' && 'Past Orders'}
  
</h2>
        <div className="header-notifications">
          {activeTab !== 'live-orders' && waiterCalls.length > 0 && (
            <button
              className="header-waiter-bell"
              onClick={() => {
                if (activeTab === 'waiter-call') {
                  setActiveTab(previousPageRef.current)
                } else {
                  setHasNewWaiterCall(false)
                  previousPageRef.current = activeTab
                  setActiveTab('waiter-call')
                }
              }}
              title={`${waiterCalls.length} waiter request${waiterCalls.length !== 1 ? 's' : ''}`}
            >
              <span className="bell-icon"><IconBellRing size={20} /></span>
              <span className="bell-badge" />
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
                <p className="profile-plan">
                  <span className={`plan-badge plan-badge--${currentPlan}`}>
                    {PLAN_LABELS[currentPlan] || 'Plus Plan'}
                  </span>
                </p>
              </div>
              <div className="profile-divider"></div>
              <button className="profile-btn" onClick={handleLogout}>Logout</button>
            </div>
          )}
        </div>
      </header>

      <main className="main-content">
        <Suspense fallback={<div className="loading-state"><div className="loading-spinner"></div><p>Loading...</p></div>}>
        {activeTab && !hasFeature(currentPlan, tabToFeature(activeTab)) && (
          <div className="restricted-page">
            <div className="restricted-content">
              <div className="restricted-icon"><IconLock size={48} /></div>
              <h2>Feature Not Available</h2>
              <p>This feature is not available on your current plan. Upgrade to Plus to access it.</p>
              {activeTab === 'analytics' && <p className="restricted-detail">Analytics, reports, and performance insights are Plus features.</p>}
              {activeTab === 'pos' && <p className="restricted-detail">POS billing and counter management are Pro features.</p>}
              {activeTab === 'live-orders' && <p className="restricted-detail">Online ordering and order management are Plus features.</p>}
              {activeTab === 'past-orders' && <p className="restricted-detail">Order history and past orders are Plus features.</p>}
            </div>
          </div>
        )}
        {activeTab === 'analytics' && hasFeature(currentPlan, tabToFeature('analytics')) && <OverviewPage restaurantId={restaurantId} />}

        {activeTab === 'pos' && hasFeature(currentPlan, tabToFeature('pos')) && <PosPage restaurantId={restaurantId} />}

        {activeTab === 'menu_items' && (
          <div className="menu-section">
            <div className="menu-header">
              <div className="menu-header-left">
                <h2 className="menu-title">Menu Items</h2>
                <span className="menu-count">{menuItems.length}</span>
              </div>
              <div className="menu-header-right">
                <div className="menu-search">
                  <input
                    type="text"
                    placeholder="Search items..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <select
                  className="menu-category-filter"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  <option value="all">All Categories</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
                <div className="menu-type-filter">
                  <button
                    className={`type-pill ${filterType === 'all' ? 'active' : ''}`}
                    onClick={() => setFilterType('all')}
                  >All</button>
                  <button
                    className={`type-pill veg ${filterType === 'veg' ? 'active' : ''}`}
                    onClick={() => setFilterType('veg')}
                  >Veg</button>
                  <button
                    className={`type-pill nonveg ${filterType === 'nonveg' ? 'active' : ''}`}
                    onClick={() => setFilterType('nonveg')}
                  >Non-Veg</button>
                </div>
                <button className="menu-add-btn" onClick={() => setShowAddModal(true)}>
                  + Add Item
                </button>
              </div>
            </div>

            {menuLoading ? (
              <div className="menu-loading">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} className="menu-skeleton" />
                ))}
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="menu-empty">
                <div className="menu-empty-icon">
                  {searchQuery || filterType !== 'all' || categoryFilter !== 'all' ? <IconSearch size={48} /> : <IconUtensils size={48} />}
                </div>
                <h3>{searchQuery || filterType !== 'all' || categoryFilter !== 'all' ? 'No items found' : 'No menu items yet'}</h3>
                <p>
                  {searchQuery || filterType !== 'all' || categoryFilter !== 'all'
                    ? 'Try adjusting your search or filters.'
                    : 'Add your first menu item to get started.'}
                </p>
                <button className="menu-add-btn" onClick={() => {
                  if (searchQuery || filterType !== 'all' || categoryFilter !== 'all') {
                    setSearchQuery('')
                    setFilterType('all')
                    setCategoryFilter('all')
                  } else {
                    setShowAddModal(true)
                  }
                }}>
                  {searchQuery || filterType !== 'all' || categoryFilter !== 'all' ? 'Clear filters' : '+ Add Item'}
                </button>
              </div>
            ) : (
              <div className="menu-grid">
                {filteredItems.map(item => (
                  <MenuItemCard
                    key={item.id}
                    item={item}
                    onSave={handleSaveItem}
                    onDelete={handleDeleteItem}
                    categories={categories}
                    restaurantId={restaurantId}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'categories' && <CategoriesPage restaurantId={restaurantId} />}

        {activeTab === 'tables' && <TablesPage restaurantId={restaurantId} restaurantSlug={restaurantSlug} />}

        {activeTab === 'settings' && <SettingsPage preferences={preferences} setPreferences={setPreferences} onToast={showToast} restaurantId={restaurantId} />}

        {activeTab === 'featured' && <FeaturedItemsPanel restaurantId={restaurantId} />}

        {activeTab === 'live-orders' && hasFeature(currentPlan, tabToFeature('live-orders')) && <LiveOrdersPage restaurantId={restaurantId} />}

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
                <div className="empty-icon"><IconBellRing size={48} /></div>
                <h3>No waiter calls</h3>
                <p>Customer requests for assistance will appear here in realtime</p>
              </div>
            ) : (
              <div className="waiter-call-list">
                {waiterCalls.map(call => {
                  const tableNum = call.table_number || (call.restaurant_tables?.table_number) || call.table_id?.slice(0, 8) || '—'
                  const requestType = call.request_type_name || null
                  const customMsg = call.custom_message || null
                  const status = call.status || 'pending'
                  return (
                    <div key={call.id} className="waiter-call-card">
                      <div className="waiter-call-card-top">
                        <div className="waiter-call-card-left">
                          <span className="waiter-call-table-icon"><IconBell size={20} /></span>
                          <div className="waiter-call-card-info">
                            <span className="waiter-call-table-number">Table {tableNum}</span>
                            {requestType && <span className="waiter-call-request-type">Request: {requestType}</span>}
                            {customMsg && <span className="waiter-call-note">{customMsg}</span>}
                            <span className="waiter-call-status">{status === 'pending' ? 'Waiting' : status}</span>
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

        {activeTab === 'past-orders' && hasFeature(currentPlan, tabToFeature('past-orders')) && <PastOrdersPage pastOrders={pastOrders} loading={loading} onToast={showToast} />}
        </Suspense>
      </main>

      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} activeTab={activeTab} setActiveTab={setActiveTab} onOpenOrders={openOrdersPopup} waiterCalls={waiterCalls} hasUnseenOrders={hasUnseenOrders} hasPendingOrders={orders.length > 0} plan={currentPlan} />

      {showAddModal && (
        <AddItemModal
          onSave={handleAddItem}
          onClose={() => setShowAddModal(false)}
          categories={categories}
          restaurantId={restaurantId}
        />
      )}

    </div>
  )
}

function Sidebar({ isOpen, onClose, activeTab, setActiveTab, onOpenOrders, waiterCalls, hasUnseenOrders, hasPendingOrders, plan }) {
  return (
    <>
      {isOpen && <div className="overlay" onClick={onClose} />}
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <button className="close-btn" onClick={onClose}>×</button>
        <nav className="sidebar-nav">
          {hasFeature(plan, tabToFeature('analytics')) && (
            <button
              className={`nav-item ${activeTab === 'analytics' ? 'active' : ''}`}
              onClick={() => { setActiveTab('analytics'); onClose(); }}
            >
              <IconBarChart size={18} /> Analytics
            </button>
          )}
          {hasFeature(plan, tabToFeature('pos')) && (
            <button
              className={`nav-item ${activeTab === 'pos' ? 'active' : ''}`}
              onClick={() => { setActiveTab('pos'); onClose(); }}
            >
              <IconShoppingBag size={18} /> POS Billing
            </button>
          )}
          <button
            className={`nav-item ${activeTab === 'menu_items' ? 'active' : ''}`}
            onClick={() => { setActiveTab('menu_items'); onClose(); }}
          >
            <IconUtensils size={18} /> Menu Items
          </button>
          <button
            className={`nav-item ${activeTab === 'categories' ? 'active' : ''}`}
            onClick={() => { setActiveTab('categories'); onClose(); }}
          >
            <IconFolder size={18} /> Categories
          </button>
          <button
            className={`nav-item ${activeTab === 'featured' ? 'active' : ''}`}
            onClick={() => { setActiveTab('featured'); onClose(); }}
          >
            <IconTarget size={18} /> Featured
          </button>
          {hasFeature(plan, tabToFeature('live-orders')) && (
            <button
              className={`nav-item ${activeTab === 'live-orders' ? 'active' : ''}`}
              onClick={() => { setActiveTab('live-orders'); onClose(); }}
            >
              <IconBell size={18} /> Live Orders
              {(hasUnseenOrders || hasPendingOrders) && <span className="sidebar-badge" />}
            </button>
          )}
          <button
            className={`nav-item ${activeTab === 'waiter-call' ? 'active' : ''}`}
            onClick={() => { setActiveTab('waiter-call'); onClose(); }}
          >
            <IconBellRing size={18} /> Waiter Call
            {waiterCalls.length > 0 && <span className="sidebar-badge" />}
          </button>
          {hasFeature(plan, tabToFeature('past-orders')) && (
            <button
              className={`nav-item ${activeTab === 'past-orders' ? 'active' : ''}`}
              onClick={() => { setActiveTab('past-orders'); onClose(); }}
            >
              <IconClipboard size={18} /> Past Orders
            </button>
          )}
          <button
            className={`nav-item ${activeTab === 'tables' ? 'active' : ''}`}
            onClick={() => { setActiveTab('tables'); onClose(); }}
          >
            <IconTable size={18} /> Tables
          </button>
          <button
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => { setActiveTab('settings'); onClose(); }}
          >
            <IconSettings size={18} /> Settings
          </button>
        </nav>
      </aside>
    </>
  )
}



export default App