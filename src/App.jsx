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
import { formatDateTime } from './utils/formatDateTime'
import './App.css'
import './theme.css'

const API_TIMEOUT = 15000

function App() {
  const { session, profile, loading: authLoading, initialized, signOut, role, restaurantId } = useAuth()
  const [resetMode, setResetMode] = useState(() => window.location.hash === '#reset-password')
  const isPopupMode = new URLSearchParams(window.location.search).get('mode') === 'popup-orders'
  const [restaurantSlug, setRestaurantSlug] = useState('')
  const [restaurantName, setRestaurantName] = useState('')
  const [orders, setOrders] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(false)
  const [menuLoading, setMenuLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('analytics')
  const [ordersPopupOpen, setOrdersPopupOpen] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [toast, setToast] = useState(null)
  const [newOrderToast, setNewOrderToast] = useState(null)
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
  const ordersPollingRef = useRef(null)
  const isMountedRef = useRef(true)
  const logoutRef = useRef(false)
  const firstOrdersFetchDone = useRef(false)
  const ordersPopupOpenedRef = useRef(false)

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
        const query = supabase
          .from('live_orders')
          .select('id, restaurant_id, total_price, status, items, created_at, order_code, table_id, note, restaurant_tables(table_number)')
          .eq('restaurant_id', restaurantId)
          .order('created_at', { ascending: false })
          .limit(200)

        const { data, error } = await fetchWithTimeout(query, API_TIMEOUT)

        if (signal?.aborted) return { aborted: true }

        if (error && error.code !== 'PGRST116') {
          console.error('[Orders] Load error:', error)
          return { error }
        }

        const unresolvedIds = [...new Set((data || []).filter(o => o.table_id && !o.restaurant_tables?.table_number).map(o => o.table_id))]
        if (unresolvedIds.length > 0) {
          const tablesPromise = supabase.from('restaurant_tables').select('id, table_number').in('id', unresolvedIds)
          const { data: tr } = await fetchWithTimeout(tablesPromise, API_TIMEOUT)
          if (!signal?.aborted) {
            const tMap = {}
            ;(tr || []).forEach(t => { tMap[t.id] = t.table_number })
            ;(data || []).forEach(o => {
              if (o.table_id && tMap[o.table_id] !== undefined) {
                o.restaurant_tables = { table_number: tMap[o.table_id] }
              }
            })
          }
        }

        if (signal?.aborted) return { aborted: true }

        return { data: data || [] }
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

  useEffect(() => {
    if (!isLoggedIn || !restaurantId) {
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

      deduplicateRequest(pollKey, executePoll).catch(() => { })
    }, 15000)

    ordersPollingRef.current = pollInterval

    return () => {
      if (ordersPollingRef.current) {
        clearInterval(ordersPollingRef.current)
        ordersPollingRef.current = null
      }
    }
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
              if (!isPopupMode && !ordersPopupOpenedRef.current) {
                console.log('[Popup] New order arrived, auto-opening popup')
                ordersPopupOpenedRef.current = true
                setOrdersPopupOpen(true)
              }
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
        (payload) => {
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
      if (audioCtxRef.current) { try { audioCtxRef.current.close() } catch { } }
      supabase.removeChannel(channel)
    }
  }, [isLoggedIn, restaurantId, preferences.soundEnabled, preferences.orderNotifications, preferences.notificationSound])



  useEffect(() => {
    if (!isLoggedIn || !restaurantId) return

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
  }, [isLoggedIn, restaurantId, preferences.autoDeclineTimeout])

  useEffect(() => {
    if (!isPopupMode && orders.length === 0) {
      console.log('[Popup] Order queue empty, closing popup')
      setOrdersPopupOpen(false)
      ordersPopupOpenedRef.current = false
    }
  }, [isPopupMode, orders])

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
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'accepted' } : o))

    try {
      await supabase.from('live_orders').update({ status: 'accepted' }).eq('id', orderId)
      showToast('Order accepted')
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

  // Popup mode: standalone Live Orders window — bypasses Analytics and all other pages
  if (isPopupMode) {
    return (
      <div className="app popup-mode">
        {toast && <Toast message={toast.message} type={toast.type} />}
        {newOrderToast && (
          <div className="new-order-toast">{newOrderToast}</div>
        )}
        <OfflineBanner />
        <div className="popup-orders-window">
          <div className="popup-orders-header popup-drag-header">
            <h2>📋 Live Orders</h2>
            <span className="popup-orders-badge">{orders.length} active</span>
          </div>
          <div className="popup-orders-body">
            {loading || (!firstOrdersFetchDone.current && orders.length === 0) ? (
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
              <div className="popup-empty-state">
                <div className="popup-empty-icon">📦</div>
                <p>No orders</p>
              </div>
            ) : (
              <div className="popup-orders-list">
                {orders.map(order => {
                  const safeOrder = order || {}
                  const tableNum = safeOrder.restaurant_tables?.table_number;
                  const items = Array.isArray(safeOrder.items) ? safeOrder.items : []
                  const totalPrice = safeOrder.total_price != null ? safeOrder.total_price : 0
                  const orderId = safeOrder.id || 'unknown'
                  const orderCode = safeOrder.order_code || (safeOrder.id ? safeOrder.id.slice(0, 8).toUpperCase() : 'N/A')
                  const status = safeOrder.status || 'pending'

                  return (
                    <div key={orderId} className="pos-order-card">
                      <div className="pos-card-header">
                        <span className="pos-order-id">#{orderCode}</span>
                        <span className="pos-table-badge">T{tableNum || '—'}</span>
                        <span className="pos-order-time">{safeOrder.created_at ? <RunningTimer createdAt={safeOrder.created_at} /> : ''}</span>
                        <span className="pos-total">₹{totalPrice}</span>
                      </div>

                      {safeOrder.note && (
                        <div className="pos-order-note">{safeOrder.note}</div>
                      )}

                      <div className="pos-items">
                        {items.map((item, i) => (
                          <div key={i} className="pos-item">
                            <span className="pos-item-name">{item?.name || 'Item'}</span>
                            <span className="pos-item-qty">x{item?.quantity != null ? item.quantity : 1}</span>
                          </div>
                        ))}
                        {items.length === 0 && (
                          <div className="pos-item">
                            <span className="pos-item-name" style={{ color: '#555', fontStyle: 'italic' }}>No items</span>
                          </div>
                        )}
                      </div>

                      <div className="pos-card-footer">
                        {status === 'accepted' ? (
                          <span className="pos-accepted-label">✓ Accepted</span>
                        ) : (
                          <>
                            <button className="pos-decline-btn" onClick={() => handleDecline(orderId, orderCode)}>Decline</button>
                            <button className="pos-accept-btn" onClick={() => handleAccept(orderId)}>Accept</button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    )
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
      </main>

      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} activeTab={activeTab} setActiveTab={setActiveTab} />

      {showAddModal && (
        <AddItemModal
          onSave={handleAddItem}
          onClose={() => setShowAddModal(false)}
          categories={categories}
        />
      )}

      {ordersPopupOpen && (
        <PopupErrorBoundary onReset={() => { setOrdersPopupOpen(false); ordersPopupOpenedRef.current = false; }}>
          <div className="popup-orders-overlay">
            <div className="popup-orders-header">
              <h2>Orders</h2>
              <div className="popup-orders-header-right">
                <span className="popup-orders-badge">{orders.length} orders</span>
                <button className="popup-orders-close" onClick={() => { console.log('[Popup] Manual close'); setOrdersPopupOpen(false); ordersPopupOpenedRef.current = false; }}>✕</button>
              </div>
            </div>
            <div className="popup-orders-body">
              {loading || (!firstOrdersFetchDone.current && orders.length === 0) ? (
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
                <div className="popup-empty-state">
                  <div className="popup-empty-icon">📦</div>
                  <p>No orders</p>
                </div>
              ) : (
                <div className="popup-orders-list">
                  {orders.map(order => {
                    const safeOrder = order || {}
                    const tableNum = safeOrder.restaurant_tables?.table_number;
                    const items = Array.isArray(safeOrder.items) ? safeOrder.items : []
                    const totalPrice = safeOrder.total_price != null ? safeOrder.total_price : 0
                    const orderId = safeOrder.id || 'unknown'
                    const orderCode = safeOrder.order_code || (safeOrder.id ? safeOrder.id.slice(0, 8).toUpperCase() : 'N/A')
                    const status = safeOrder.status || 'pending'

                    return (
                      <div key={orderId} className="pos-order-card">
                        <div className="pos-card-header">
                          <span className="pos-order-id">#{orderCode}</span>
                          <span className="pos-table-badge">T{tableNum || '—'}</span>
                          <span className="pos-order-time">{safeOrder.created_at ? <RunningTimer createdAt={safeOrder.created_at} /> : ''}</span>
                          <span className="pos-total">₹{totalPrice}</span>
                        </div>

                        {safeOrder.note && (
                          <div className="pos-order-note">{safeOrder.note}</div>
                        )}

                        <div className="pos-items">
                          {items.map((item, i) => (
                            <div key={i} className="pos-item">
                              <span className="pos-item-name">{item?.name || 'Item'}</span>
                              <span className="pos-item-qty">x{item?.quantity != null ? item.quantity : 1}</span>
                            </div>
                          ))}
                          {items.length === 0 && (
                            <div className="pos-item">
                              <span className="pos-item-name" style={{ color: '#555', fontStyle: 'italic' }}>No items</span>
                            </div>
                          )}
                        </div>

                        <div className="pos-card-footer">
                          {status === 'accepted' ? (
                            <span className="pos-accepted-label">✓ Accepted</span>
                          ) : (
                            <>
                              <button className="pos-decline-btn" onClick={() => handleDecline(orderId, orderCode)}>Decline</button>
                              <button className="pos-accept-btn" onClick={() => handleAccept(orderId)}>Accept</button>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </PopupErrorBoundary>
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

class PopupErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[PopupErrorBoundary] Caught:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="popup-orders-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: '#888' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px', opacity: 0.3 }}>⚠️</div>
            <p style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>Orders encountered an error</p>
            <p style={{ fontSize: '12px', color: '#555', marginBottom: '16px' }}>{this.state.error?.message || 'Unknown error'}</p>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); this.props.onReset?.() }}
              style={{ background: '#22c55e', color: '#000', border: 'none', borderRadius: '4px', padding: '7px 18px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
            >
              Reset
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
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