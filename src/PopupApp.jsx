import React, { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './lib/supabase'
import { useAuth } from './contexts/AuthContext'
import { fetchWithTimeout } from './lib/apiUtils'
import PastOrdersPage from './pages/PastOrdersPage'
import { formatOrderDateTime } from './utils/formatDateTime'
import './PopupApp.css'

const API_TIMEOUT = 15000
const POPUP_POS_KEY = 'popup_window_position'

const SOUND_OPTIONS = [
  { id: 'beep', name: 'Default Beep', freq: [800, 1000], duration: 0.3 },
  { id: 'chime', name: 'Soft Chime', freq: [600, 800, 1000], duration: 0.5 },
  { id: 'digital', name: 'Digital Ping', freq: [1500, 2000], duration: 0.2 },
]

function PopupApp() {
  const { session, profile, loading: authLoading, initialized, restaurantId } = useAuth()
  const [orders, setOrders] = useState([])
  const [pastOrders, setPastOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [activeSection, setActiveSection] = useState('live')
  const [toast, setToast] = useState(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  const abortControllerRef = useRef(null)
  const ordersLoadingRef = useRef(false)
  const isMountedRef = useRef(true)
  const firstOrdersFetchDone = useRef(false)

  const popupRef = useRef(null)
  const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron

  const [popupPos, setPopupPos] = useState(() => {
    try {
      const saved = localStorage.getItem(POPUP_POS_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          return parsed
        }
      }
    } catch {}
    return null
  })

  const isLoggedIn = !!session
  const userFullName = profile?.full_name || profile?.email || session?.user?.email || 'User'

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const loadOrders = useCallback(async () => {
    if (!restaurantId || !isMountedRef.current) return
    if (ordersLoadingRef.current) return
    ordersLoadingRef.current = true
    setLoading(true)

    try {
      const baseSelect = 'id, restaurant_id, total_price, status, items, created_at, order_code, table_id, note, restaurant_tables(table_number)'

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

      if (!isMountedRef.current) return

      const liveError = liveResult.error && liveResult.error.code !== 'PGRST116' ? liveResult.error : null
      const pastError = pastResult.error && pastResult.error.code !== 'PGRST116' ? pastResult.error : null

      if (liveError) console.error('[Popup] Live query error:', liveError.message || liveError)
      if (pastError) console.error('[Popup] Past query error:', pastError.message || pastError)

      const liveData = liveResult.data || []
      const pastData = pastResult.data || []
      const allOrders = [...liveData, ...pastData]

      const unresolvedIds = [...new Set(allOrders.filter(o => o.table_id && !o.restaurant_tables?.table_number).map(o => o.table_id))]
      if (unresolvedIds.length > 0) {
        const { data: tr } = await fetchWithTimeout(
          supabase.from('restaurant_tables').select('id, table_number').in('id', unresolvedIds),
          API_TIMEOUT
        )
        if (isMountedRef.current && tr) {
          const tMap = {}
          tr.forEach(t => { tMap[t.id] = t.table_number })
          allOrders.forEach(o => {
            if (o.table_id && tMap[o.table_id] !== undefined) {
              o.restaurant_tables = { table_number: tMap[o.table_id] }
            }
          })
        }
      }

      if (isMountedRef.current) {
        setOrders(liveData)
        setPastOrders(pastData)
        firstOrdersFetchDone.current = true
      }
    } catch (err) {
      console.error('[Popup] loadOrders exception:', err)
    } finally {
      if (isMountedRef.current) {
        ordersLoadingRef.current = false
        setLoading(false)
      }
    }
  }, [restaurantId])

  useEffect(() => {
    if (!isLoggedIn || !restaurantId) return
    isMountedRef.current = true
    ordersLoadingRef.current = false

    const controller = new AbortController()
    abortControllerRef.current = controller

    loadOrders()

    return () => {
      isMountedRef.current = false
      controller.abort()
      ordersLoadingRef.current = false
    }
  }, [isLoggedIn, restaurantId, loadOrders])

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

  useEffect(() => {
    if (!isLoggedIn || !restaurantId) return

    const lastPlayedOrderRefLocal = { current: null }
    const soundReadyRefLocal = { current: false }
    const audioCtxRefLocal = { current: null }

    const createSound = () => {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (!AudioContext) return null
      try {
        const ctx = new AudioContext()
        audioCtxRefLocal.current = ctx
        const selSound = SOUND_OPTIONS[0]
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
      if (soundReadyRefLocal.current) return
      playFn = createSound()
      soundReadyRefLocal.current = true
    }

    const handleGesture = () => { initAudio(); document.removeEventListener('click', handleGesture); document.removeEventListener('keydown', handleGesture) }
    document.addEventListener('click', handleGesture)
    document.addEventListener('keydown', handleGesture)

    const channel = supabase
      .channel('popup-live-orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_orders' },
        (payload) => {
          if (payload.new.restaurant_id !== restaurantId) return
          const newOrderId = payload.new.id
          const rawStatus = payload.new.status
          if (lastPlayedOrderRefLocal.current === newOrderId) return
          lastPlayedOrderRefLocal.current = newOrderId

          if (rawStatus === 'pending' && playFn) {
            try { playFn() } catch {}
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

            if (rawStatus === 'pending') {
              setOrders(prev => {
                if (prev.some(o => o.id === newOrderId)) return prev.map(o => o.id === newOrderId ? { ...o, ...resolved } : o)
                return [resolved, ...prev].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
              })
            } else {
              setPastOrders(prev => {
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

          setOrders(prev => {
            if (!prev.some(o => o.id === id)) return prev
            if (status === 'pending') return prev.map(o => o.id === id ? { ...o, ...payload.new } : o)
            return prev.filter(o => o.id !== id)
          })

          if (status === 'accepted') {
            setPastOrders(prev => {
              const exists = prev.some(o => o.id === id)
              if (exists) return prev.map(o => o.id === id ? { ...o, ...payload.new, restaurant_tables: o.restaurant_tables || payload.new.restaurant_tables } : o)
              return [{ ...payload.new, restaurant_tables: null }, ...prev].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            })
            supabase.from('live_orders').select('*, restaurant_tables(table_number)').eq('id', id).single().then(({ data }) => {
              if (data) setPastOrders(prev => prev.map(o => o.id === id ? { ...o, ...data } : o))
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
      .subscribe()

    return () => {
      document.removeEventListener('click', handleGesture)
      document.removeEventListener('keydown', handleGesture)
      if (audioCtxRefLocal.current) { try { audioCtxRefLocal.current.close() } catch {} }
      supabase.removeChannel(channel)
    }
  }, [isLoggedIn, restaurantId])

  const handleAccept = async (orderId) => {
    let movedOrder = null
    setOrders(prev => {
      const order = prev.find(o => o.id === orderId)
      if (order) movedOrder = { ...order, status: 'accepted' }
      return prev.filter(o => o.id !== orderId)
    })
    if (movedOrder) setPastOrders(prev => [movedOrder, ...prev])

    try {
      const { error } = await supabase.from('live_orders').update({ status: 'accepted' }).eq('id', orderId)
      if (error) throw error
      showToast('Order accepted')
    } catch (err) {
      console.error('[Popup] Accept error:', err)
      if (movedOrder) {
        setOrders(prev => [movedOrder, ...prev])
        setPastOrders(prev => prev.filter(o => o.id !== orderId))
      }
      showToast('Failed to accept order', 'error')
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

  const handleDragStart = useCallback((e) => {
    if (isElectron) return
    if (e.target.closest('.popup-tabs') || e.target.closest('.popup-toast')) return

    const rect = popupRef.current?.getBoundingClientRect()
    if (!rect) return

    const startX = e.clientX
    const startY = e.clientY
    const startLeft = rect.left
    const startTop = rect.top

    const onMove = (ev) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (popupRef.current) {
        popupRef.current.style.left = `${startLeft + dx}px`
        popupRef.current.style.top = `${startTop + dy}px`
        popupRef.current.style.transform = 'none'
      }
    }

    const onUp = (ev) => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      const finalX = startLeft + (ev.clientX - startX)
      const finalY = startTop + (ev.clientY - startY)
      const pos = { x: finalX, y: finalY }
      setPopupPos(pos)
      try { localStorage.setItem(POPUP_POS_KEY, JSON.stringify(pos)) } catch {}
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [isElectron])

  if (!isLoggedIn && !authLoading) {
    return (
      <div className="popup-shell">
        <div className="popup-titlebar">
          <span className="popup-titlebar-title">Orders</span>
        </div>
        <div className="popup-content">
          <div className="popup-auth-required">
            <p>Please log in to view orders</p>
          </div>
        </div>
      </div>
    )
  }

  if (authLoading || !initialized) {
    return (
      <div className="popup-shell">
        <div className="popup-titlebar">
          <span className="popup-titlebar-title">Orders</span>
        </div>
        <div className="popup-content">
          <div className="popup-loading">
            <div className="popup-spinner" />
            <p>Loading...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!restaurantId) {
    return (
      <div className="popup-shell">
        <div className="popup-titlebar">
          <span className="popup-titlebar-title">Orders</span>
        </div>
        <div className="popup-content">
          <div className="popup-auth-required">
            <p>No restaurant found</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={popupRef}
      className="popup-shell"
      style={!isElectron && popupPos ? {
        position: 'fixed',
        left: `${popupPos.x}px`,
        top: `${popupPos.y}px`,
        transform: 'none',
        width: '100vw',
        height: '100vh',
      } : {}}
    >
      {toast && (
        <div className={`popup-toast popup-toast--${toast.type}`}>
          {toast.message}
        </div>
      )}

      <div
        className="popup-titlebar"
        onPointerDown={!isElectron ? handleDragStart : undefined}
      >
        <span className="popup-titlebar-title">Orders</span>
        <span className="popup-titlebar-user">{userFullName}</span>
      </div>

      <div className="popup-tabs">
        <button
          className={`popup-tab ${activeSection === 'live' ? 'active' : ''}`}
          onClick={() => setActiveSection('live')}
        >
          <span className="popup-tab-dot" />
          Live Orders
          {orders.length > 0 && <span className="popup-tab-badge">{orders.length}</span>}
        </button>
        <button
          className={`popup-tab ${activeSection === 'past' ? 'active' : ''}`}
          onClick={() => setActiveSection('past')}
        >
          Past Orders
        </button>
      </div>

      <div className="popup-content">
        {!isOnline && (
          <div className="popup-offline-banner">
            You are offline. Orders may not update.
          </div>
        )}

        {activeSection === 'live' && (
          <div className="popup-live-orders">
            {!firstOrdersFetchDone.current && loading ? (
              <div className="popup-loading-grid">
                {[1, 2, 3].map(i => (
                  <div key={i} className="popup-skeleton-card">
                    <div className="popup-skeleton-line" style={{ width: '40%' }} />
                    <div className="popup-skeleton-line" />
                    <div className="popup-skeleton-line" style={{ width: '60%' }} />
                  </div>
                ))}
              </div>
            ) : orders.length === 0 ? (
              <div className="popup-empty">
                <div className="popup-empty-icon">🕐</div>
                <h3>No live orders</h3>
                <p>Pending orders will appear here</p>
              </div>
            ) : (
              <>
                <div className="popup-orders-count">{orders.length} order{orders.length !== 1 ? 's' : ''} waiting</div>
                <div className="popup-orders-list">
                  {orders.map(order => {
                    const safeOrder = order || {}
                    const tableNum = safeOrder.restaurant_tables?.table_number
                    const items = Array.isArray(safeOrder.items) ? safeOrder.items : []
                    const totalPrice = safeOrder.total_price != null ? safeOrder.total_price : 0
                    const orderId = safeOrder.id || 'unknown'
                    const orderCode = safeOrder.order_code || (safeOrder.id ? safeOrder.id.slice(0, 8).toUpperCase() : 'N/A')

                    return (
                      <div key={orderId} className="popup-order-card">
                        <div className="popup-card-header">
                          <div className="popup-card-header-left">
                            <span className="popup-order-id">#{orderCode}</span>
                            <span className="popup-table-badge">Table {tableNum || '—'}</span>
                          </div>
                          <span className="popup-order-date">
                            {safeOrder.created_at ? formatOrderDateTime(safeOrder.created_at) : ''}
                          </span>
                        </div>
                        <div className="popup-items">
                          {items.length > 0 ? items.map((item, i) => (
                            <div key={i} className="popup-item">
                              <span className="popup-item-name">{item?.name || 'Item'}</span>
                              <span className="popup-item-qty">x{item?.quantity != null ? item.quantity : 1}</span>
                              <span className="popup-item-price">₹{((item?.price ?? 0) * (item?.quantity ?? 1)).toFixed(0)}</span>
                            </div>
                          )) : (
                            <div className="popup-item">
                              <span className="popup-item-name" style={{ color: '#555', fontStyle: 'italic' }}>No items</span>
                            </div>
                          )}
                        </div>
                        {safeOrder.note && (
                          <div className="popup-order-note">
                            <span className="popup-note-label">Note</span>
                            <span>{safeOrder.note}</span>
                          </div>
                        )}
                        <div className="popup-total-row">
                          <span className="popup-total-label">Total</span>
                          <span className="popup-total-amount">₹{totalPrice}</span>
                        </div>
                        <div className="popup-card-footer">
                          <button className="popup-decline-btn" onClick={() => handleDecline(orderId, orderCode)}>Decline</button>
                          <button className="popup-accept-btn" onClick={() => handleAccept(orderId)}>Accept</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {activeSection === 'past' && (
          <div className="popup-past-orders">
            <PastOrdersPage pastOrders={pastOrders} loading={loading} onToast={showToast} />
          </div>
        )}
      </div>
    </div>
  )
}

export default PopupApp
