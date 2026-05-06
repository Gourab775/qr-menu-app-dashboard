import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './lib/supabase'
import { useAuth } from './contexts/AuthContext'
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
import { formatDateTime } from './utils/formatDateTime'
import './App.css'
import './theme.css'

const ORDER_CACHE_KEY = 'dashboard_orders'

function App() {
  const { session, loading: authLoading } = useAuth()
  const isLoggedIn = !!session
  const [resetMode, setResetMode] = useState(() => {
    return window.location.hash === '#reset-password'
  })
  const [currentUser, setCurrentUser] = useState(null)
  const [restaurantId, setRestaurantId] = useState(null)
  const [restaurantSlug, setRestaurantSlug] = useState('')
  const [restaurantName, setRestaurantName] = useState('')
  const [orders, setOrders] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [menuLoading, setMenuLoading] = useState(false)
  const [isInitializing, setIsInitializing] = useState(true)
  const [initError, setInitError] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('orders')
  const [orderFilter, setOrderFilter] = useState('all')
  const [showProfile, setShowProfile] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [orderSearch, setOrderSearch] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [toast, setToast] = useState(null)
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
    } catch (e) {
      return {
        soundEnabled: true,
        orderNotifications: true,
        autoDeclineTimeout: 10,
        theme: 'dark'
      }
    }
  })
  const profileRef = useRef(null)
  const prevOrderCount = useRef(0)
  const audioRef = useRef(null)

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setShowProfile(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
    }
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
}, [])

  const initializeApp = useCallback(async (user) => {
    if (!user) return
    
    setIsInitializing(true)
    setInitError(null)
    
    try {
      setCurrentUser(user)
      
      const { data: restaurantData, error: restError } = await supabase
        .from('restaurants')
        .select('id, slug')
        .eq('user_id', user.id)
        .maybeSingle()
      
      if (restError) {
        console.error('Error fetching restaurant:', restError)
      }
      
      let restaurantIdValue = restaurantData?.id
      
      if (!restaurantIdValue) {
        const { data: newRest, error: insertError } = await supabase
          .from('restaurants')
          .insert({ name: user.email.split('@')[0] + "'s Restaurant", user_id: user.id })
          .select()
          .maybeSingle()
        
        if (insertError) {
          console.error('Error creating restaurant:', insertError)
        }
        restaurantIdValue = newRest?.id
      }
      
      if (!restaurantIdValue) {
        const { data: fallback } = await supabase.from('restaurants').select('id').limit(1).maybeSingle()
        restaurantIdValue = fallback?.id
      }
      
      if (!restaurantIdValue) {
        setInitError('No restaurant found. Please contact support.')
        setIsInitializing(false)
        return
      }
      
      setRestaurantId(restaurantIdValue)
      if (restaurantData?.slug) {
        setRestaurantSlug(restaurantData.slug)
      } else if (restaurantIdValue) {
        // Fallback fetch slug if missing
        const { data: slugData } = await supabase.from('restaurants').select('slug').eq('id', restaurantIdValue).single()
        if (slugData?.slug) setRestaurantSlug(slugData.slug)
      }
    } catch (err) {
      console.error('Initialize error:', err)
      setInitError('Failed to initialize. Please try again.')
    } finally {
      setIsInitializing(false)
    }
  }, [])

  const initializingRef = useRef(true)
  
  useEffect(() => {
    const initTimeout = setTimeout(() => {
      if (initializingRef.current) {
        console.warn('[INIT] Timeout - proceeding anyway')
        setIsInitializing(false)
        initializingRef.current = false
      }
    }, 8000)
    
    if (session?.user) {
      initializeApp(session.user).finally(() => {
        clearTimeout(initTimeout)
        initializingRef.current = false
      })
    } else if (!session && !authLoading) {
      clearTimeout(initTimeout)
      initializingRef.current = false
      setIsInitializing(false)
    }
    
    return () => {
      clearTimeout(initTimeout)
    }
  }, [session, authLoading, initializeApp])

  const [soundReady, setSoundReady] = useState(false)
  const [newOrderToast, setNewOrderToast] = useState(null)
  const lastPlayedOrderRef = useRef(null)
  const audioContextRef = useRef(null)

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

  const createNotificationSound = useCallback(() => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (!AudioContext) return null
      
      const ctx = new AudioContext()
      audioContextRef.current = ctx
      
      const selectedSound = SOUND_OPTIONS.find(s => s.id === preferences.notificationSound) || SOUND_OPTIONS[0]
      
      const playTone = () => {
        if (ctx.state === 'suspended') {
          ctx.resume()
        }
        
        let delay = 0
        selectedSound.freq.forEach((freq, i) => {
          setTimeout(() => {
            const oscillator = ctx.createOscillator()
            const gainNode = ctx.createGain()
            
            oscillator.connect(gainNode)
            gainNode.connect(ctx.destination)
            
            oscillator.frequency.value = freq
            oscillator.type = 'sine'
            
            const toneDuration = selectedSound.duration / selectedSound.freq.length
            gainNode.gain.setValueAtTime(0.25, ctx.currentTime)
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + toneDuration)
            
            oscillator.start(ctx.currentTime)
            oscillator.stop(ctx.currentTime + toneDuration)
          }, delay)
          delay += (selectedSound.duration * 1000) / selectedSound.freq.length
        })
      }
      
      return playTone
    } catch (err) {
      console.warn('Web Audio API not supported:', err)
      return null
    }
  }, [preferences.notificationSound])

  const playNotificationToneRef = useRef(null)

  const initAudio = useCallback(() => {
    if (soundReady) return
    
    try {
      playNotificationToneRef.current = createNotificationSound()
      setSoundReady(true)
    } catch (err) {
      console.warn('Failed to initialize audio:', err)
    }
  }, [soundReady, createNotificationSound, preferences.notificationSound])

  const playNotificationSound = useCallback(() => {
    if (!preferences.soundEnabled) return
    
    try {
      if (playNotificationToneRef.current) {
        playNotificationToneRef.current()
      }
    } catch (err) {
      console.warn('Sound play error:', err)
    }
  }, [preferences.soundEnabled])

  useEffect(() => {
    if (!isLoggedIn) return

    const handleUserGesture = () => {
      initAudio()
      document.removeEventListener('click', handleUserGesture)
      document.removeEventListener('keydown', handleUserGesture)
    }

    document.addEventListener('click', handleUserGesture)
    document.addEventListener('keydown', handleUserGesture)

    return () => {
      document.removeEventListener('click', handleUserGesture)
      document.removeEventListener('keydown', handleUserGesture)
    }
  }, [isLoggedIn, initAudio])

  const getDateFilter = (filter) => {
    const now = new Date()
    let startDate = null
    let endDate = null
    
    switch (filter) {
      case 'live':
        startDate = new Date(Date.now() - (24 * 60 * 60 * 1000))
        break
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
        break
      case '7days':
        startDate = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000))
        break
      case '30days':
        startDate = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000))
        break
      case 'all':
      default:
        return null
    }
    
    if (startDate && !isNaN(startDate.getTime())) {
      const result = { start: startDate.toISOString() }
      if (endDate && !isNaN(endDate.getTime())) {
        result.end = endDate.toISOString()
      }
      return result
    }
    return null
  }

  const loadOrders = async (isInitialLoad = false) => {
    const restId = restaurantId
    
    if (!restId) {
      console.warn('[LOAD] No restaurant ID defined')
      setLoading(false)
      return
    }
    
    console.log('[LOAD] Using restaurant ID:', restId, 'Filter:', orderFilter)
    
    try {
      const { data: restaurantData } = await supabase
        .from('restaurants')
        .select('name')
        .eq('id', restId)
        .single()
      
      if (restaurantData?.name) {
        setRestaurantName(restaurantData.name)
      }

      let query = supabase
        .from('live_orders')
        .select('id, restaurant_id, total_price, payment_mode, status, items, created_at, order_code, table_id, note, restaurant_tables(table_number)')
        .eq('restaurant_id', restId)
        .order('created_at', { ascending: false })
        .limit(200)

      // Date filter removed to show all past orders as requested

      console.log('[LOAD] Executing query with restId:', restId)
      const { data, error } = await query

      if (error) {
        console.error('[LOAD] Orders fetch error:', error.message, '| Details:', error.details)
        
        if (error.code === 'PGRST116') {
          showToast('No orders found', 'info')
        } else if (error.code === '42P01') {
          showToast('Table live_orders does not exist in database', 'error')
        } else if (error.message?.includes('network')) {
          showToast('Network error. Check connection.', 'error')
        } else {
          showToast('Failed to load orders', 'error')
        }
        if (isInitialLoad) {
          setOrders([])
        }
        setLoading(false)
        return
      }
       
      console.log('Fetched orders:', data?.length || 0)
      if (data?.length) {
        console.log('table_id values:', data.map(o => ({ id: o.id, table_id: o.table_id, has_table_join: !!o.restaurant_tables })))
      }

      // --- Fallback table resolution ---
      // The PostgREST join (restaurant_tables(table_number)) only works when the
      // FK constraint exists. This direct query works regardless of schema state.
      const unresolvedIds = [...new Set(
        (data || [])
          .filter(o => o.table_id && !o.restaurant_tables?.table_number)
          .map(o => o.table_id)
      )]
      let tableMap = {}
      if (unresolvedIds.length > 0) {
        const { data: tableRows } = await supabase
          .from('restaurant_tables')
          .select('id, table_number')
          .in('id', unresolvedIds)
        ;(tableRows || []).forEach(t => { tableMap[t.id] = t.table_number })
      }

      const mergeTableNumber = (order) => ({
        ...order,
        restaurant_tables:
          order.restaurant_tables ??
          (order.table_id && tableMap[order.table_id]
            ? { table_number: tableMap[order.table_id] }
            : null),
      })

      const resolvedData = (data || []).map(mergeTableNumber)

      if (isInitialLoad) {
        setOrders(resolvedData)
      } else {
        setOrders(prev => {
          const existingIds = new Set(prev.map(o => o.id))
          const newOrders = resolvedData.filter(o => !existingIds.has(o.id))
          const updatedOrders = prev.map(existing => {
            const updated = resolvedData.find(d => d.id === existing.id)
            return updated ? { ...existing, ...updated } : existing
          })
          return [...updatedOrders, ...newOrders].sort((a, b) =>
            new Date(b.created_at) - new Date(a.created_at)
          )
        })
      }
    } catch (err) {
      console.error('[LOAD] Orders load exception:', err)
      showToast('Failed to load orders', 'error')
    } finally {
      setLoading(false)
    }
  }

  const loadCategories = async () => {
    const restId = restaurantId || RESTAURANT_ID
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, image, sort_order')
        .eq('restaurant_id', restId)
        .order('sort_order', { ascending: true })

      if (!error) setCategories(data || [])
    } catch (err) {
    }
  }

  const loadMenuItems = async () => {
    setMenuLoading(true)
    const restId = restaurantId || RESTAURANT_ID
    
    try {
      const { data, error } = await supabase
        .from('menu_items')
        .select('id, name, price, description, is_veg, is_available, category_id, image_url')
        .eq('restaurant_id', restId)
        .order('name', { ascending: true })

      if (error) throw error
      setMenuItems(data || [])
    } catch (err) {
      showToast('Failed to load menu items', 'error')
    } finally {
      setMenuLoading(false)
    }
  }

  useEffect(() => {
    if (!isLoggedIn || !restaurantId) return
    loadOrders(true)
    loadCategories()
    loadMenuItems()
  }, [isLoggedIn, restaurantId, orderFilter])

  useEffect(() => {
    if (!isLoggedIn) return

    const channel = supabase
      .channel('live-orders')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'live_orders' },
        (payload) => {
          const newOrderId = payload.new.id
          console.log('New order received:', { id: newOrderId, payment_mode: payload.new.payment_mode })
          
          if (lastPlayedOrderRef.current === newOrderId) {
            return
          }
          lastPlayedOrderRef.current = newOrderId
          
          // Fetch table number for the new order to ensure it displays correctly.
          // Falls back to a direct restaurant_tables query if the FK join is absent.
          const fetchNewOrderWithTable = async () => {
            const { data: freshOrder } = await supabase
              .from('live_orders')
              .select('*, restaurant_tables(table_number)')
              .eq('id', newOrderId)
              .single()

            if (!freshOrder) return

            // Fallback: if FK join didn't return table_number, fetch it directly
            let resolved = freshOrder
            if (freshOrder.table_id && !freshOrder.restaurant_tables?.table_number) {
              const { data: tableRow } = await supabase
                .from('restaurant_tables')
                .select('id, table_number')
                .eq('id', freshOrder.table_id)
                .maybeSingle()
              if (tableRow) {
                resolved = { ...freshOrder, restaurant_tables: { table_number: tableRow.table_number } }
              }
            }

            setOrders(prev => {
              const exists = prev.some(o => o.id === newOrderId)
              if (exists) {
                return prev.map(o => o.id === newOrderId ? { ...o, ...resolved } : o)
              }

              if (preferences.soundEnabled) {
                playNotificationSound()
              }

              if (preferences.orderNotifications) {
                const orderCode = resolved.order_code || newOrderId.slice(0, 8).toUpperCase()
                setNewOrderToast(`📦 New Order #${orderCode}`)
                setTimeout(() => setNewOrderToast(null), 4000)
              }

              return [resolved, ...prev].sort((a, b) =>
                new Date(b.created_at) - new Date(a.created_at)
              )
            })
          }

          fetchNewOrderWithTable()
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'live_orders' },
        (payload) => {
          setOrders(prev =>
            prev.map(order =>
              order.id === payload.new.id ? { ...order, ...payload.new } : order
            )
          )
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'live_orders' },
        (payload) => {
          setOrders(prev =>
            prev.filter(order => order.id !== payload.old.id)
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isLoggedIn, preferences.soundEnabled, preferences.orderNotifications, playNotificationSound])

  useEffect(() => {
    if (!isLoggedIn) return

    let mounted = true
    let intervalId = null

    const checkPendingOrders = async () => {
      if (!mounted) return
      
      setOrders(prev => {
        const timeoutMs = (preferences.autoDeclineTimeout || 10) * 60 * 1000
        const thresholdTime = new Date(Date.now() - timeoutMs)

        const pendingOrders = prev.filter(order => {
          if (order.status === 'accepted' || order.status === 'rejected') return false
          const orderTime = new Date(order.created_at)
          return orderTime < thresholdTime
        })

        if (pendingOrders.length === 0) return prev

        pendingOrders.forEach(order => {
          supabase
            .from('live_orders')
            .delete()
            .eq('id', order.id)
            .then(({ error }) => {
              if (!error) {
                showToast(`Order #${order.order_code || order.id.slice(0, 8)} auto-declined (timeout)`)
              }
            })
        })

        const declinedIds = new Set(pendingOrders.map(o => o.id))
        return prev.filter(o => !declinedIds.has(o.id))
      })
    }

    intervalId = setInterval(checkPendingOrders, 30000)

    return () => {
      mounted = false
      if (intervalId) clearInterval(intervalId)
    }
  }, [isLoggedIn, preferences.autoDeclineTimeout])

  const handleAccept = async (orderId) => {
    setOrders(prev =>
      prev.map(order =>
        order.id === orderId ? { ...order, status: 'accepted' } : order
      )
    )
    await supabase
      .from('live_orders')
      .update({ status: 'accepted' })
      .eq('id', orderId)
  }

  const handleDecline = async (orderId, orderCode) => {
    const confirmDelete = window.confirm(
      `Decline order #${orderCode || orderId.slice(0, 8)}?\n\nThis cannot be undone.`
    )
    if (!confirmDelete) return

    try {
      const { error } = await supabase
        .from('live_orders')
        .delete()
        .eq('id', orderId)

      if (error) throw error
      setOrders(prev => prev.filter(o => o.id !== orderId))
      showToast('Order declined')
    } catch (err) {
      showToast('Failed to decline order', 'error')
    }
  }

  const handleSaveItem = async (id, updates) => {
    const prevItems = [...menuItems]
    setMenuItems(prev =>
      prev.map(item => item.id === id ? { ...item, ...updates } : item)
    )
    try {
      const { error } = await supabase
        .from('menu_items')
        .update(updates)
        .eq('id', id)
      
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
      const { error } = await supabase
        .from('menu_items')
        .delete()
        .eq('id', id)
      
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
          restaurant_id: restaurantId || RESTAURANT_ID
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

  const closeSidebar = () => setSidebarOpen(false)

  const filteredItems = menuItems.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesFilter =
      filterType === 'all' ||
      (filterType === 'veg' && item.is_veg) ||
      (filterType === 'nonveg' && !item.is_veg)
    return matchesSearch && matchesFilter
  })

  const filteredOrders = orders.filter(order => {
    if (!orderSearch) return true
    const orderCode = order.order_code || ''
    const orderId = order.id || ''
    return (
      orderCode.toLowerCase().includes(orderSearch.toLowerCase()) ||
      orderId.toLowerCase().includes(orderSearch.toLowerCase())
    )
  })

  if (resetMode) {
    return <ResetPassword onDone={() => { setResetMode(false); window.location.hash = ''; }} />
  }

  if (!isLoggedIn) {
    return <Login />
  }

  if (authLoading || isInitializing) {
    return (
      <div className="app">
        <div className="login-page">
          <div className="login-card skeleton-container">
            <div className="skeleton skeleton-title" style={{ width: '60%', margin: '0 auto 24px' }}></div>
            <div className="skeleton skeleton-text" style={{ width: '100%' }}></div>
            <div className="skeleton skeleton-text" style={{ width: '100%' }}></div>
            <div className="skeleton skeleton-button" style={{ width: '100%', marginTop: '16px' }}></div>
          </div>
        </div>
      </div>
    )
  }

  if (initError) {
    return (
      <div className="app">
        <div className="login-page">
          <div className="login-card">
            <div className="login-icon">⚠️</div>
            <h1 className="login-title">Initialization Error</h1>
            <p className="login-subtitle">{initError}</p>
            <button className="login-btn" onClick={async () => {
              await supabase.auth.signOut()
            }}>
              Logout
            </button>
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
            <p className="login-subtitle">No restaurant available</p>
            <button className="login-btn" onClick={async () => {
              await supabase.auth.signOut()
            }}>
              Logout
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="app">
        <header className="header">
          <button className="menu-btn" onClick={() => setSidebarOpen(true)}>☰</button>
          <h2 className="header-title">Dashboard</h2>
          <div className="profile-icon">👤</div>
        </header>
        <main className="main-content">
          <div className="skeleton-container" style={{maxWidth: '800px', margin: '0 auto'}}>
            <div className="skeleton-grid">
              <div className="skeleton skeleton-card"></div>
              <div className="skeleton skeleton-card"></div>
              <div className="skeleton skeleton-card"></div>
              <div className="skeleton skeleton-card"></div>
            </div>
          </div>
        </main>
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
          {activeTab === 'orders' && '📦 Orders'}
          {activeTab === 'menu_items' && '🍽️ Menu Items'}
          {activeTab === 'categories' && '📂 Categories'}
          {activeTab === 'tables' && '🪑 Tables'}
          {activeTab === 'settings' && '⚙️ Settings'}
        </h2>
        <div className="profile-wrapper" ref={profileRef}>
          <div className="profile-icon" onClick={() => setShowProfile(!showProfile)}>👤</div>
          {showProfile && (
            <div className="profile-dropdown">
              <div className="profile-info">
                <p className="profile-name"><strong>Restaurant</strong></p>
                <p className="profile-id">ID: {(restaurantId || RESTAURANT_ID).slice(0, 8)}...</p>
              </div>
              <div className="profile-divider"></div>
              <button className="profile-btn" onClick={async () => {
                try {
                  await supabase.auth.signOut()
                } catch (e) {
                  console.warn('SignOut error:', e.message)
                }
                
                localStorage.removeItem('dashboard_preferences')
                setShowProfile(false)
              }}>Logout</button>
            </div>
          )}
        </div>
      </header>
      
      <main className="main-content">
        {activeTab === 'analytics' && <OverviewPage restaurantId={restaurantId} />}

        {activeTab === 'orders' && (
          <div className="orders-section">
            <div className="sticky-header">
              <div className="orders-controls">
                <div className="order-search-box">
                  <span className="search-icon">🔍</span>
                  <input
                    type="text"
                    placeholder="Search by Order ID..."
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                  />
                </div>
                <button onClick={loadOrders} className="refresh-btn">
                  🔄 Refresh
                </button>
              </div>
              <div className="order-filters">
                <button 
                  className={`filter-btn ${orderFilter === 'live' ? 'active' : ''}`}
                  onClick={() => setOrderFilter('live')}
                >
                  <span className="live-dot"></span>
                  Live
                </button>
                <button 
                  className={`filter-btn ${orderFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setOrderFilter('all')}
                >
                  All
                </button>
                <button 
                  className={`filter-btn ${orderFilter === 'today' ? 'active' : ''}`}
                  onClick={() => setOrderFilter('today')}
                >
                  Last Day
                </button>
                <button 
                  className={`filter-btn ${orderFilter === '7days' ? 'active' : ''}`}
                  onClick={() => setOrderFilter('7days')}
                >
                  Last 7 Days
                </button>
                <button 
                  className={`filter-btn ${orderFilter === '30days' ? 'active' : ''}`}
                  onClick={() => setOrderFilter('30days')}
                >
                  Last 30 Days
                </button>
              </div>
            </div>
            
            {orders.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📦</div>
                <p>No live orders</p>
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
                    const isCounter = paymentMode === 'counter'
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
                      className={`order-card ${order.status === 'accepted' ? 'accepted' : ''} ${isTimeout ? 'timeout' : ''} ${isWarning ? 'warning' : ''}`}
                      style={{
                        background: order.status === 'accepted'
                          ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.1), var(--card))'
                          : isTimeout
                          ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.15), var(--card))'
                          : isWarning
                          ? 'linear-gradient(135deg, rgba(249, 115, 22, 0.15), var(--card))'
                          : isCounter
                          ? 'linear-gradient(135deg, rgba(139, 90, 43, 0.15), var(--card))'
                          : isOnline
                          ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), var(--card))'
                          : undefined
                      }}
                    >
                      <div className="order-header">
                        <div className="order-header-left">
                          <span className="order-code">#{order.order_code || order.id.slice(0, 8).toUpperCase()}</span>
                          {tableNum ? (
                            <span className="order-table">Table {tableNum}</span>
                          ) : (
                            <span className="order-table" style={{ background: 'var(--border)', color: 'var(--text-muted)' }}>No Table</span>
                          )}
                          {isCounter && (
                            <span className="payment-badge">💵 Pay at Counter</span>
                          )}
                          {isOnline && (
                            <span className="payment-badge online">💳 Online Paid</span>
                          )}
                          {order.status !== 'accepted' && (
                            <span className={`time-badge ${minutesOld >= 8 ? 'urgent' : ''}`}>
                              {minutesOld}m ago
                            </span>
                          )}
                        </div>
                        <div className="order-datetime">
                          {formatDateTime(order.created_at)}
                        </div>
                      </div>

                      {order.note && (
                        <div className="order-note">
                          Note: {order.note}
                        </div>
                      )}
                      
                      <div className="order-items">
                        {order.items?.map((item, i) => (
                          <div key={i} className="order-item">
                            <div className="item-row">
                              <span>{item.is_veg ? '🟢' : '🔴'}</span>
                              <span className="item-name">{item.name}</span>
                              <span className="item-qty">× {item.quantity}</span>
                            </div>
                            {item.note && (
                              <span className="item-note">Note: {item.note}</span>
                            )}
                            {(item.table || tableNum) && (
                              <span className="item-table">Table {item.table || tableNum}</span>
                            )}
                          </div>
                        ))}
                      </div>
                      
                      <div className="order-bottom">
                        <p className="order-price">₹{order.total_price}</p>
                        
                        <div className="order-actions">
                          <button className="bill-btn" onClick={() => setSelectedOrder(order)}>
                            🧾
                          </button>
                          
                          {order.status === 'accepted' ? (
                            <div className="accepted-label">
                              ✓ Accepted
                            </div>
                          ) : (
                            <>
                              <button className="decline-btn" onClick={() => handleDecline(order.id, order.order_code)}>Decline</button>
                              <button className="accept-btn" onClick={() => handleAccept(order.id)}>Accept</button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    )})}
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
              <button onClick={loadMenuItems} className="refresh-btn-glass">
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
                  : 'Start building your menu by adding your first item. It\'s quick and easy!'}</p>
                <button className="add-btn" onClick={() => {
                  if (searchQuery || filterType !== 'all') {
                    setSearchQuery('');
                    setFilterType('all');
                  } else {
                    setShowAddModal(true);
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

export default App
