import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './lib/supabase'
import { useAuth } from './contexts/AuthContext'
import { validateSession, fetchWithTimeout, deduplicateRequest } from './lib/apiUtils'
import MenuItemCard from './components/MenuItemCard'
import AddItemModal from './components/AddItemModal'
import Toast from './components/Toast'
import Login from './components/Login'
import ResetPassword from './components/ResetPassword'
import BillModal from './components/BillModal'
import OfflineBanner from './components/OfflineBanner'
import FeaturedItemsPanel from './components/FeaturedItemsPanel'
import CategoriesPage from './pages/CategoriesPage'
import OverviewPage from './pages/OverviewPage'
import SettingsPage from './pages/SettingsPage'
import TablesPage from './pages/TablesPage'
import KitchenPage from './pages/KitchenPage'
import { formatDateTime } from './utils/formatDateTime'
import './App.css'
import './theme.css'

const API_TIMEOUT = 15000
const MAX_RETRIES = 2

function App() {
  const { session, profile, loading: authLoading, initialized, signOut } = useAuth()
  const [resetMode, setResetMode] = useState(() => window.location.hash === '#reset-password')
  const [restaurantId, setRestaurantId] = useState(null)
  const [restaurantSlug, setRestaurantSlug] = useState('')
  const [restaurantName, setRestaurantName] = useState('')
  const [orders, setOrders] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(false)
  const [menuLoading, setMenuLoading] = useState(false)
  const [initStatus, setInitStatus] = useState('idle')
  const [initError, setInitError] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('orders')
  const [orderFilter, setOrderFilter] = useState('live')
  const [showProfile, setShowProfile] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [orderSearch, setOrderSearch] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [toast, setToast] = useState(null)
  const [newOrderToast, setNewOrderToast] = useState(null)
  const [selectedOrder, setSelectedOrder] = useState(null)
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
  const initializedRef = useRef(false)
  const initAttemptRef = useRef(0)
  const abortControllerRef = useRef(null)
  const ordersLoadingRef = useRef(false)
  const ordersPollingRef = useRef(null)
  const orderFilterRef = useRef(orderFilter)
  const isMountedRef = useRef(true)
  const logoutRef = useRef(false)
  const initCompleteRef = useRef(false)
  const lastFetchKeyRef = useRef(null)

  const userRole = profile?.role || 'staff'
  const userFullName = profile?.full_name || profile?.email || session?.user?.email || 'User'
  const profileRestaurantId = profile?.restaurant_id || null
  const isLoggedIn = !!session

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

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

      setRestaurantId(null)
      setRestaurantSlug('')
      setRestaurantName('')
      setOrders([])
      setMenuItems([])
      setCategories([])
      initializedRef.current = false
      initCompleteRef.current = false
      setInitStatus('idle')
      setInitError(null)
      setOrders([])
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

  useEffect(() => {
    if (initCompleteRef.current) return
    if (!isLoggedIn || !initialized) return

    const user = session?.user
    if (!user) return

    if (initAttemptRef.current >= MAX_RETRIES) {
      setInitError('Maximum initialization attempts reached. Please refresh.')
      setInitStatus('error')
      return
    }

    if (initializedRef.current) return
    initializedRef.current = true
    initCompleteRef.current = true

    setInitStatus('loading')
    initAttemptRef.current++

    const controller = new AbortController()
    abortControllerRef.current = controller
    isMountedRef.current = true

    const initApp = async () => {
      try {
        if (!isMountedRef.current || controller.signal.aborted) return

        const sessionValidation = validateSession(session)
        if (!sessionValidation.valid) {
          setInitError(`Session invalid: ${sessionValidation.reason}. Please login again.`)
          setInitStatus('error')
          return
        }

        let rid = profileRestaurantId
        let slug = ''
        if (!rid) {
          const fetchPromise = supabase
            .from('restaurants')
            .select('id, slug')
            .eq('user_id', user.id)
            .maybeSingle()

          const { data } = await fetchWithTimeout(fetchPromise, API_TIMEOUT)
          if (!isMountedRef.current || controller.signal.aborted) return
          rid = data?.id
          slug = data?.slug || ''
          if (slug) setRestaurantSlug(slug)
        }
        if (!rid) {
          const fallbackPromise = supabase.from('restaurants').select('id, slug').limit(1).maybeSingle()
          const { data: fb } = await fetchWithTimeout(fallbackPromise, API_TIMEOUT)
          if (!isMountedRef.current || controller.signal.aborted) return
          rid = fb?.id
          slug = fb?.slug || ''
          if (slug) setRestaurantSlug(slug)
        }
        if (!rid) {
          setInitError('No restaurant found. Please contact support.')
          setInitStatus('error')
          return
        }
        if (!isMountedRef.current || controller.signal.aborted) return

        setRestaurantId(rid)
        const restaurantPromise = supabase.from('restaurants').select('name, slug').eq('id', rid).maybeSingle()
        const { data: rData } = await fetchWithTimeout(restaurantPromise, API_TIMEOUT)
        if (!isMountedRef.current || controller.signal.aborted) return
        if (rData) {
          setRestaurantName(rData.name || '')
          if (rData.slug && !slug) setRestaurantSlug(rData.slug)
        }
        setInitStatus('done')
      } catch (err) {
        console.error('[Init] Error:', err)
        if (!isMountedRef.current || controller.signal.aborted) return
        if (err.name === 'AbortError') {
          setInitError('Request cancelled. Please refresh.')
        } else {
          setInitError('Failed to initialize. Please try again.')
        }
        setInitStatus('error')
      }
    }

    initApp()

    return () => {
      isMountedRef.current = false
      controller.abort()
      abortControllerRef.current = null
    }
  }, [isLoggedIn, initialized, session?.user?.id, profileRestaurantId])

  useEffect(() => {
    if (!isLoggedIn || !restaurantId || initStatus !== 'done') return
    isMountedRef.current = true

    if (ordersLoadingRef.current) return
    ordersLoadingRef.current = true
    setLoading(true)

    const controller = new AbortController()
    abortControllerRef.current = controller

    const doLoad = async () => {
      try {
        if (!isMountedRef.current || controller.signal.aborted) return

        await loadOrders(controller.signal)

        if (!isMountedRef.current || controller.signal.aborted) return

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
          if (!isMountedRef.current || controller.signal.aborted) return
          setMenuLoading(false)
        }
      } catch (err) {
        console.error('[DataLoad] Error:', err)
      } finally {
        if (!isMountedRef.current || controller.signal.aborted) return
        ordersLoadingRef.current = false
        setLoading(false)
      }
    }

    doLoad()

    return () => {
      isMountedRef.current = false
      controller.abort()
      abortControllerRef.current = null
      ordersLoadingRef.current = false
    }
  }, [isLoggedIn, restaurantId, initStatus, setToast])

  useEffect(() => {
    orderFilterRef.current = orderFilter
    
    if (!isLoggedIn || !restaurantId || initStatus !== 'done') return
    
    const fetchKey = `${restaurantId}-${orderFilter}-${initStatus}`
    if (lastFetchKeyRef.current === fetchKey) return
    lastFetchKeyRef.current = fetchKey

    if (ordersLoadingRef.current) return
    ordersLoadingRef.current = true

    const controller = new AbortController()
    abortControllerRef.current = controller

    loadOrders(controller.signal).finally(() => {
      if (isMountedRef.current) {
        ordersLoadingRef.current = false
      }
    })

    return () => {
      controller.abort()
    }
  }, [isLoggedIn, restaurantId, initStatus, orderFilter])

  useEffect(() => {
    if (!isLoggedIn || initStatus !== 'done') {
      if (ordersPollingRef.current) {
        clearInterval(ordersPollingRef.current)
        ordersPollingRef.current = null
      }
      return
    }

    if (orderFilter !== 'live') {
      if (ordersPollingRef.current) {
        clearInterval(ordersPollingRef.current)
        ordersPollingRef.current = null
      }
      return
    }

    const pollKey = `poll-${restaurantId}`
    
    const pollInterval = setInterval(() => {
      if (ordersLoadingRef.current || !restaurantId || !isMountedRef.current) return
      
      const executePoll = async () => {
        const controller = new AbortController()
        await loadOrders(controller.signal)
      }

      deduplicateRequest(pollKey, executePoll).catch(() => {})
    }, 15000)

    ordersPollingRef.current = pollInterval

    return () => {
      if (ordersPollingRef.current) {
        clearInterval(ordersPollingRef.current)
        ordersPollingRef.current = null
      }
    }
  }, [isLoggedIn, initStatus, orderFilter, restaurantId, loadOrders])

  useEffect(() => {
    if (!isLoggedIn || initStatus !== 'done') return

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
      try { playFn() } catch {}
    }

    const channel = supabase
      .channel('live-orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_orders' },
        (payload) => {
          const newOrderId = payload.new.id
          if (lastPlayedOrderRef.current === newOrderId) return
          lastPlayedOrderRef.current = newOrderId

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

            setOrders(prev => {
              if (prev.some(o => o.id === newOrderId)) return prev.map(o => o.id === newOrderId ? { ...o, ...resolved } : o)
              if (preferences.soundEnabled) playSound()
              if (preferences.orderNotifications) {
                const code = resolved.order_code || newOrderId.slice(0, 8).toUpperCase()
                setNewOrderToast(`📦 New Order #${code}`)
                setTimeout(() => setNewOrderToast(null), 4000)
              }
              return [resolved, ...prev].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            })
          }
          fetchAndAddOrder()
        }
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'live_orders' },
        async (payload) => {
          if (payload.new.status === 'accepted' && payload.old.status !== 'accepted') {
            const { data: ex } = await supabase.from('kitchen_board').select('id').eq('order_id', payload.new.id).maybeSingle()
            if (!ex) await supabase.from('kitchen_board').insert({
              order_id: payload.new.id, items: payload.new.items, table_id: payload.new.table_id, status: 'pending', created_at: new Date().toISOString()
            })
          }
          setOrders(prev => prev.map(o => o.id === payload.new.id ? { ...o, ...payload.new } : o))
        }
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'live_orders' },
        (payload) => { setOrders(prev => prev.filter(o => o.id !== payload.old.id)) }
      )
      .subscribe()

    return () => {
      document.removeEventListener('click', handleGesture)
      document.removeEventListener('keydown', handleGesture)
      if (audioCtxRef.current) { try { audioCtxRef.current.close() } catch {} }
      supabase.removeChannel(channel)
    }
  }, [isLoggedIn, initStatus, preferences.soundEnabled, preferences.orderNotifications, preferences.notificationSound])

  useEffect(() => {
    if (!isLoggedIn || initStatus !== 'done') return

    const kitchenChannel = supabase
      .channel('kitchen-sync-for-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kitchen_board' },
        (payload) => {
          setOrders(prev => prev.map(order => {
            if ((payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') && order.id === payload.new?.order_id) {
              return { ...order, kitchen_status: payload.new.status }
            }
            return order
          }))
        }
      )
      .subscribe()

    return () => supabase.removeChannel(kitchenChannel)
  }, [isLoggedIn, initStatus])

  useEffect(() => {
    if (!isLoggedIn || initStatus !== 'done') return

    let mounted = true
    const intervalId = setInterval(() => {
      if (!mounted) return
      setOrders(prev => {
        const timeoutMs = (preferences.autoDeclineTimeout || 10) * 60 * 1000
        const threshold = new Date(Date.now() - timeoutMs)
        const timedOut = prev.filter(o => {
          if (o.status === 'accepted' || o.status === 'rejected') return false
          return new Date(o.created_at) < threshold
        })
        if (timedOut.length === 0) return prev

        timedOut.forEach(o => {
          supabase.from('live_orders').delete().eq('id', o.id).then(({ error }) => {
            if (!error && setToast) setToast({ message: `Order #${o.order_code || o.id.slice(0, 8)} auto-declined`, type: 'info' })
          })
        })

        const ids = new Set(timedOut.map(o => o.id))
        return prev.filter(o => !ids.has(o.id))
      })
    }, 30000)

    return () => { mounted = false; clearInterval(intervalId) }
  }, [isLoggedIn, initStatus, preferences.autoDeclineTimeout])

  const loadOrders = useCallback(async (signal = null, filterOverride = null) => {
    if (!restaurantId || !isMountedRef.current) return

    const activeFilter = filterOverride !== null ? filterOverride : orderFilterRef.current
    orderFilterRef.current = activeFilter

    const fetchKey = `orders-${restaurantId}-${activeFilter}`
    const isManualFetch = signal === null

    if (isManualFetch) {
      if (ordersLoadingRef.current) return
      ordersLoadingRef.current = true
      setLoading(true)
    }

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const formatDate = (d) => {
      const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }
    const todayStr = formatDate(today)
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = formatDate(yesterday)

    let bounds = { start: `${todayStr}T00:00:00`, end: null }
    if (activeFilter === 'today') bounds = { start: `${yesterdayStr}T00:00:00`, end: `${yesterdayStr}T23:59:59` }
    else if (activeFilter === '7days') {
      const d = new Date(today); d.setDate(d.getDate() - 7)
      bounds = { start: `${formatDate(d)}T00:00:00`, end: `${yesterdayStr}T23:59:59` }
    } else if (activeFilter === '30days') {
      const d = new Date(today); d.setDate(d.getDate() - 30)
      bounds = { start: `${formatDate(d)}T00:00:00`, end: `${yesterdayStr}T23:59:59` }
    }

    const executeLoad = async () => {
      try {
        let query = supabase
          .from('live_orders')
          .select('id, restaurant_id, total_price, payment_mode, status, items, created_at, order_code, table_id, note, restaurant_tables(table_number)')
          .eq('restaurant_id', restaurantId)
          .order('created_at', { ascending: false })
          .limit(200)

        if (bounds.start) query = query.gte('created_at', bounds.start)
        if (bounds.end) query = query.lte('created_at', bounds.end)

        const fetchPromise = query
        const { data, error } = await fetchWithTimeout(fetchPromise, API_TIMEOUT)

        if (signal?.aborted || !isMountedRef.current) return { aborted: true }

        if (error && error.code !== 'PGRST116') {
          console.error('[Orders] Load error:', error)
          return { error }
        }

        const ids = (data || []).map(o => o.id)
        let kitchenMap = {}
        if (ids.length > 0) {
          const kitchenPromise = supabase.from('kitchen_board').select('order_id, status').in('order_id', ids)
          const { data: kr } = await fetchWithTimeout(kitchenPromise, API_TIMEOUT)
          if (!signal?.aborted && isMountedRef.current) {
            (kr || []).forEach(k => { kitchenMap[k.order_id] = k.status })
          }
        }

        if (signal?.aborted || !isMountedRef.current) return { aborted: true }

        const resolved = (data || []).map(o => ({
          ...o,
          kitchen_status: kitchenMap[o.id] || null,
          restaurant_tables: o.restaurant_tables || (o.table_id ? { table_number: null } : null)
        }))

        const unresolvedIds = [...new Set((data || []).filter(o => o.table_id && !o.restaurant_tables?.table_number).map(o => o.table_id))]
        if (unresolvedIds.length > 0) {
          const tablesPromise = supabase.from('restaurant_tables').select('id, table_number').in('id', unresolvedIds)
          const { data: tr } = await fetchWithTimeout(tablesPromise, API_TIMEOUT)
          if (!signal?.aborted && isMountedRef.current) {
            const tMap = {}
            ;(tr || []).forEach(t => { tMap[t.id] = t.table_number })
            resolved.forEach(o => {
              if (o.table_id && tMap[o.table_id] !== undefined) {
                o.restaurant_tables = { table_number: tMap[o.table_id] }
              }
            })
          }
        }

        return { data: resolved }
      } catch (err) {
        console.error('[Orders] Exception:', err)
        return { error: err }
      }
    }

    const result = isManualFetch 
      ? await deduplicateRequest(fetchKey, executeLoad)
      : await executeLoad()

    if (signal?.aborted || !isMountedRef.current) return

    if (result.aborted) return

    if (result.error) {
      setToast({ message: 'Failed to load orders', type: 'error' })
      setOrders([])
    } else if (result.data) {
      setOrders(result.data)
    }

    if (isManualFetch) {
      ordersLoadingRef.current = false
      setLoading(false)
    }
  }, [restaurantId, setToast])

  const closeSidebar = useCallback(() => setSidebarOpen(false), [])

  const filteredItems = menuItems.filter(item => {
    const matchSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchFilter = filterType === 'all' || (filterType === 'veg' && item.is_veg) || (filterType === 'nonveg' && !item.is_veg)
    return matchSearch && matchFilter
  })

  const filteredOrders = orders.filter(order => {
    if (!orderSearch) return true
    const code = (order.order_code || '').toLowerCase()
    const oid = (order.id || '').toLowerCase()
    return code.includes(orderSearch.toLowerCase()) || oid.includes(orderSearch.toLowerCase())
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

  if (initStatus === 'error' || initError) {
    return (
      <div className="app">
        <div className="login-page">
          <div className="login-card">
            <div className="login-icon">⚠️</div>
            <h1 className="login-title">Initialization Error</h1>
            <p className="login-subtitle">{initError || 'Something went wrong'}</p>
            <button className="login-btn" onClick={() => {
                signOut().then(() => window.location.reload()).catch(() => window.location.reload())
              }}>Logout</button>
          </div>
        </div>
      </div>
    )
  }

  if (initStatus === 'loading') {
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
    const order = orders.find(o => o.id === orderId)
    if (!order) return

    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'accepted' } : o))

    try {
      await supabase.from('live_orders').update({ status: 'accepted' }).eq('id', orderId)

      const { data: existing } = await supabase.from('kitchen_board').select('id').eq('order_id', orderId).maybeSingle()

      if (!existing) {
        const { error: insertError } = await supabase.from('kitchen_board').insert({
          order_id: orderId, items: order.items, table_id: order.table_id, status: 'pending', created_at: new Date().toISOString()
        })

        if (insertError && insertError.code !== '23505') {
          showToast('Failed to send to kitchen', 'error')
        } else {
          showToast('Order sent to kitchen')
        }
      }
    } catch (err) {
      console.error('Error in handleAccept:', err)
      showToast('Failed to process order', 'error')
    }
  }

  const handleDecline = async (orderId, orderCode) => {
    const confirmDelete = window.confirm(`Decline order #${orderCode || orderId.slice(0, 8)}?\n\nThis cannot be undone.`)
    if (!confirmDelete) return

    try {
      const { error } = await supabase.from('live_orders').delete().eq('id', orderId)

      if (error) throw error
      setOrders(prev => prev.filter(o => o.id !== orderId))
      showToast('Order declined')
    } catch (err) {
      showToast('Failed to decline order', 'error')
    }
  }

  const handleSaveItem = async (id, updates) => {
    const prevItems = [...menuItems]
    setMenuItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item))
    try {
      const { error } = await supabase.from('menu_items').update(updates).eq('id', id)

      if (error) throw error
    } catch (err) {
      setMenuItems(prevItems)
      showToast('Failed to update item', 'error')
    }
  }

  const handleDeleteItem = async (id) => {
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
      {newOrderToast && (
        <div className="new-order-toast">
          {newOrderToast}
        </div>
      )}
      <OfflineBanner />

      <header className="header">
        <button className="menu-btn" onClick={() => setSidebarOpen(true)}>☰</button>
        <h2 className="header-title">
          {activeTab === 'analytics' && '📊 Analytics'}
          {activeTab === 'orders' && '📦 Orders'}
          {activeTab === 'kitchen' && '🍳 Kitchen'}
          {activeTab === 'menu_items' && '🍽️ Menu Items'}
          {activeTab === 'categories' && '📂 Categories'}
          {activeTab === 'tables' && '🪑 Tables'}
          {activeTab === 'settings' && '⚙️ Settings'}
        </h2>
        <div className="profile-wrapper" ref={profileRef}>
          <div className="profile-icon" onClick={() => setShowProfile(!showProfile)} title={userFullName}>
            {userFullName ? userFullName.charAt(0).toUpperCase() : '👤'}
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

        {activeTab === 'orders' && (
          <div className="orders-section">
            <div className="sticky-header">
              <div className="orders-header-row">
                <div className="order-search-box">
                  <input
                    type="text"
                    placeholder="Search by Order ID..."
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                  />
                </div>
                <div className="order-filters">
                  <button
                    className={`filter-btn ${orderFilter === 'live' ? 'active' : ''}`}
                    onClick={() => {
                      if (orderFilter !== 'live') {
                        setOrderFilter('live')
                      }
                    }}
                  >
                    <span className="live-dot"></span> Live
                  </button>
                  <button
                    className={`filter-btn ${orderFilter === 'today' ? 'active' : ''}`}
                    onClick={() => {
                      if (orderFilter !== 'today') {
                        setOrderFilter('today')
                      }
                    }}
                  >
                    Last Day
                  </button>
                  <button
                    className={`filter-btn ${orderFilter === '7days' ? 'active' : ''}`}
                    onClick={() => {
                      if (orderFilter !== '7days') {
                        setOrderFilter('7days')
                      }
                    }}
                  >
                    7 Days
                  </button>
                  <button
                    className={`filter-btn ${orderFilter === '30days' ? 'active' : ''}`}
                    onClick={() => {
                      if (orderFilter !== '30days') {
                        setOrderFilter('30days')
                      }
                    }}
                  >
                    30 Days
                  </button>
                </div>
                <button onClick={() => { ordersLoadingRef.current = false; loadOrders(null, orderFilter); }} className="refresh-btn">
                  🔄 Refresh
                </button>
              </div>
            </div>

            {loading ? (
              <div className="loading-grid">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="skeleton-card">
                    <div className="skeleton-line" style={{ width: '30%' }}></div>
                    <div className="skeleton-line"></div>
                    <div className="skeleton-line short"></div>
                  </div>
                ))}
              </div>
            ) : orders.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📦</div>
                <p>
                  {orderFilter === 'live' && 'No live orders'}
                  {orderFilter === 'today' && 'No last day orders'}
                  {orderFilter === '7days' && 'No last 7 days orders'}
                  {orderFilter === '30days' && 'No last 30 days orders'}
                </p>
              </div>
            ) : (
              <>
                {filteredOrders.length === 0 && orderSearch && (
                  <div className="empty-state">
                    <div className="empty-icon">🔍</div>
                    <p>No orders found for "{orderSearch}"</p>
                  </div>
                )}
                <div className="orders-grid">
                  {filteredOrders.map(order => {
                    const paymentMode = order.payment_mode?.toLowerCase()
                    const isCash = paymentMode === 'cash' || paymentMode === 'counter'
                    const isCard = paymentMode === 'card'
                    const isOnline = paymentMode === 'online'

                    const orderTime = new Date(order.created_at)
                    const now = new Date()
                    const minutesOld = Math.floor((now - orderTime) / 60000)
                    const isTimeout = minutesOld >= 10 && order.status !== 'accepted'
                    const isWarning = minutesOld >= 8 && minutesOld < 10 && order.status !== 'accepted'

                    const tableNum = order.restaurant_tables?.table_number;

                    return (
                      <div
                        key={order.id}
                        className={`order-card-new ${order.status === 'accepted' ? 'accepted' : ''} ${isTimeout ? 'timeout' : ''} ${isWarning ? 'warning' : ''}`}
                      >
                        <div className="card-top-bar">
                          <div className="order-id-group">
                            <span className="order-badge">#{order.order_code || order.id.slice(0, 8).toUpperCase()}</span>
                            <span className="order-timestamp">{formatDateTime(order.created_at)}</span>
                          </div>
                          <div className="order-status-group">
                            {order.status === 'accepted' && (
                              <span className={`ready-badge ${order.kitchen_status || 'pending'}`}>
                                <span className="dot">●</span> {order.kitchen_status?.toUpperCase() || 'ACCEPTED'}
                              </span>
                            )}
                            <div style={{ display: 'flex', gap: '4px' }}>
                              {isCash && <span className="p-badge counter">Cash</span>}
                              {isCard && <span className="p-badge card">Card</span>}
                              {isOnline && <span className="p-badge online">Online</span>}
                            </div>
                          </div>
                        </div>

                        <div className="card-main-info">
                          <div className="info-item">
                            <span className="info-label">Table</span>
                            <span className="info-value highlighted">{tableNum || 'N/A'}</span>
                          </div>
                          <div className="info-item" style={{ alignItems: 'flex-end' }}>
                            <span className="info-label">Total</span>
                            <span className="info-value price">₹{order.total_price}</span>
                          </div>
                          {order.status !== 'accepted' && (
                            <div className="info-item" style={{ gridColumn: 'span 2', marginTop: '4px' }}>
                              <span className="info-label">Time Elapsed</span>
                              <span className={`info-value ${minutesOld >= 8 ? 'urgent' : ''}`} style={{ fontSize: '13px' }}>
                                ⏱️ <RunningTimer createdAt={order.created_at} />
                              </span>
                            </div>
                          )}
                        </div>

                        {order.note && (
                          <div className="order-special-note" style={{ fontSize: '12px', padding: '8px', borderRadius: '8px' }}>
                            <strong>Note:</strong> {order.note}
                          </div>
                        )}

                        <div className="order-items-container">
                          <div className="items-header">Order Items ({order.items?.length || 0})</div>
                          <div className="items-list-new">
                            {order.items?.map((item, i) => (
                              <div key={i} className="item-row-new">
                                <div className="item-main-desc">
                                  <span className={`veg-indicator ${item.is_veg ? 'veg' : 'non-veg'}`} style={{ color: item.is_veg ? 'var(--green)' : 'var(--red)' }}></span>
                                  <span className="item-name-text">{item.name}</span>
                                </div>
                                <div className="item-qty-tag">x{item.quantity}</div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="card-actions-new">
                          <button className="action-btn icon" onClick={() => setSelectedOrder(order)} title="View Bill">🧾</button>
                          <div style={{ flex: 1, display: 'flex', gap: '8px' }}>
                            {order.status === 'accepted' ? (
                              <div className="acceptance-confirmed">
                                <span className="check-icon">✓</span> Order Confirmed
                              </div>
                            ) : (
                              <>
                                <button className="action-btn decline" onClick={() => handleDecline(order.id, order.order_code)}>Decline</button>
                                <button className="action-btn accept" onClick={() => handleAccept(order.id)}>Accept</button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}

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
                  <path d="M23 4v6h-6M1 20v-6h6"/>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
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
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
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
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
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

        {activeTab === 'kitchen' && <KitchenPage restaurantId={restaurantId} />}

        {activeTab === 'settings' && <SettingsPage preferences={preferences} setPreferences={setPreferences} onToast={showToast} restaurantId={restaurantId} />}

        {activeTab === 'featured' && <FeaturedItemsPanel restaurantId={restaurantId} />}
      </main>

      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} activeTab={activeTab} setActiveTab={setActiveTab} />

      {showAddModal && (
        <AddItemModal
          onSave={handleAddItem}
          onClose={() => setShowAddModal(false)}
          categories={categories}
        />
      )}

      {selectedOrder && (
        <BillModal
          order={{...selectedOrder, restaurants: { name: restaurantName }}}
          isOpen={!!selectedOrder}
          onClose={() => setSelectedOrder(null)}
        />
      )}
    </div>
  )
}

function Sidebar({ isOpen, onClose, activeTab, setActiveTab }) {
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
            className={`nav-item ${activeTab === 'orders' ? 'active' : ''}`}
            onClick={() => { setActiveTab('orders'); onClose(); }}
          >
            📦 Orders
          </button>
          <button
            className={`nav-item ${activeTab === 'kitchen' ? 'active' : ''}`}
            onClick={() => { setActiveTab('kitchen'); onClose(); }}
          >
            🍳 Kitchen
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

function RunningTimer({ createdAt }) {
  const [elapsed, setElapsed] = useState('')

  useEffect(() => {
    const update = () => {
      const now = new Date()
      const start = new Date(createdAt)
      const diff = Math.floor((now - start) / 1000)
      if (diff < 60) setElapsed(`${diff}s ago`)
      else if (diff < 3600) setElapsed(`${Math.floor(diff / 60)}m ago`)
      else setElapsed(`${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m ago`)
    }

    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [createdAt])

  return <span>{elapsed}</span>
}

export default App