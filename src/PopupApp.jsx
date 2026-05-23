import React, { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './lib/supabase'
import { useAuth } from './contexts/AuthContext'
import { fetchWithTimeout } from './lib/apiUtils'
import { formatOrderDateTime } from './utils/formatDateTime'
import './PopupApp.css'

const API_TIMEOUT = 15000

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
  const [activeView, setActiveView] = useState('live')
  const [menuOpen, setMenuOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [activeSubTab, setActiveSubTab] = useState('orders')
  const [preferences, setPreferences] = useState(() => {
    try {
      const saved = localStorage.getItem('popup_preferences')
      return saved ? JSON.parse(saved) : { soundEnabled: true, orderNotifications: true, notificationSound: 'beep' }
    } catch {
      return { soundEnabled: true, orderNotifications: true, notificationSound: 'beep' }
    }
  })

  const popupRef = useRef(null)
  const abortControllerRef = useRef(null)
  const ordersLoadingRef = useRef(false)
  const isMountedRef = useRef(true)
  const firstOrdersFetchDone = useRef(false)
  const subscriptionActiveRef = useRef(false)
  const needsReconnectRefetch = useRef(false)
  const reconnectTimerRef = useRef(null)

  const isLoggedIn = !!session
  const userFullName = profile?.full_name || profile?.email || session?.user?.email || 'User'
  const isElectron = window.electronAPI?.isElectron

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const loadOrders = useCallback(async (signal = null) => {
    if (!restaurantId || !isMountedRef.current) return

    const isManual = signal === null
    if (isManual) {
      if (ordersLoadingRef.current) return
      ordersLoadingRef.current = true
    }
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

      if (signal?.aborted) return
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
        if (signal?.aborted) return
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

      if (signal?.aborted) return
      if (isMountedRef.current) {
        setOrders(prev => {
          const merged = new Map(prev.map(o => [o.id, o]))
          liveData.forEach(o => merged.set(o.id, o))
          return Array.from(merged.values()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        })
        setPastOrders(prev => {
          const merged = new Map(prev.map(o => [o.id, o]))
          pastData.forEach(o => merged.set(o.id, o))
          return Array.from(merged.values()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        })
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
    return () => {
      isMountedRef.current = false
      ordersLoadingRef.current = false
    }
  }, [isLoggedIn, restaurantId])

  useEffect(() => {
    if (window.electronAPI && window.electronAPI.sendOrderCount) {
      window.electronAPI.sendOrderCount(orders.length)
    }
  }, [orders])

  useEffect(() => {
    if (window.electronAPI && window.electronAPI.onFocusInput) {
      const cleanup = window.electronAPI.onFocusInput(() => {
        if (popupRef.current) {
          popupRef.current.focus({ preventScroll: false })
        }
        window.focus()
      })
      return cleanup
    }
  }, [])

  useEffect(() => {
    if (!isLoggedIn || !restaurantId) return

    const initialFetchAbort = new AbortController()
    const lastPlayedRef = { current: null }
    const soundReadyRef = { current: false }
    const audioCtxRef = { current: null }
    let initialFetchDone = false

    const createSound = () => {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (!AudioContext) return null
      try {
        const ctx = new AudioContext()
        audioCtxRef.current = ctx
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
      if (soundReadyRef.current) return
      playFn = createSound()
      soundReadyRef.current = true
    }

    const handleGesture = () => { initAudio(); document.removeEventListener('click', handleGesture); document.removeEventListener('keydown', handleGesture) }
    document.addEventListener('click', handleGesture)
    document.addEventListener('keydown', handleGesture)

    const channel = supabase
      .channel('popup-live-orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_orders', filter: `restaurant_id=eq.${restaurantId}` },
        (payload) => {
          const newOrderId = payload.new.id
          const rawStatus = payload.new.status
          if (lastPlayedRef.current === newOrderId) return
          lastPlayedRef.current = newOrderId

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
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'live_orders', filter: `restaurant_id=eq.${restaurantId}` },
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
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'live_orders', filter: `restaurant_id=eq.${restaurantId}` },
        (payload) => {
          setOrders(prev => prev.filter(o => o.id !== payload.old.id))
          setPastOrders(prev => prev.filter(o => o.id !== payload.old.id))
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (!initialFetchDone && isMountedRef.current) {
            initialFetchDone = true
            loadOrders(initialFetchAbort.signal)
          }
          if (needsReconnectRefetch.current) {
            needsReconnectRefetch.current = false
            if (!initialFetchDone && isMountedRef.current) {
              initialFetchDone = true
              loadOrders(initialFetchAbort.signal)
            }
          }
          subscriptionActiveRef.current = true
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          if (subscriptionActiveRef.current) {
            needsReconnectRefetch.current = true
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
            reconnectTimerRef.current = setTimeout(() => {
              if (isMountedRef.current && !subscriptionActiveRef.current) {
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
      initialFetchAbort.abort()
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      if (audioCtxRef.current) { try { audioCtxRef.current.close() } catch {} }
      needsReconnectRefetch.current = false
      subscriptionActiveRef.current = false
      supabase.removeChannel(channel)
    }
  }, [isLoggedIn, restaurantId, loadOrders])

  useEffect(() => {
    if (!isLoggedIn || !restaurantId) return
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadOrders()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [isLoggedIn, restaurantId, loadOrders])

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
    } catch {
      showToast('Failed to decline order', 'error')
    }
  }

  const handleDragStart = useCallback((e) => {
    if (isElectron || isResizing) return
    if (e.target.closest('.popup-hamburger') || e.target.closest('.popup-menu') || e.target.closest('.popup-menu-overlay') || e.target.closest('.popup-controls')) return

    e.preventDefault()
    const rect = popupRef.current?.getBoundingClientRect()
    if (!rect) return

    setIsDragging(true)
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
      }
    }

    const onUp = (ev) => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      setIsDragging(false)
      const pos = { x: startLeft + (ev.clientX - startX), y: startTop + (ev.clientY - startY) }
      savePopupPosition(pos)
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [isElectron, isResizing])

  const handleResizeStart = useCallback((e, direction) => {
    e.preventDefault()
    e.stopPropagation()
    setIsResizing(true)

    const rect = popupRef.current?.getBoundingClientRect()
    if (!rect) return

    const startX = e.clientX
    const startY = e.clientY
    const startW = rect.width
    const startH = rect.height
    const startLeft = rect.left
    const startTop = rect.top
    const minW = 340
    const minH = 400

    const onMove = (ev) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      let newW = startW
      let newH = startH
      let newX = startLeft
      let newY = startTop

      if (direction.includes('e')) newW = Math.max(minW, startW + dx)
      if (direction.includes('w')) { newW = Math.max(minW, startW - dx); newX = startLeft + (startW - newW) }
      if (direction.includes('s')) newH = Math.max(minH, startH + dy)
      if (direction.includes('n')) { newH = Math.max(minH, startH - dy); newY = startTop + (startH - newH) }

      if (popupRef.current) {
        popupRef.current.style.width = `${newW}px`
        popupRef.current.style.height = `${newH}px`
        if (direction.includes('w') || direction.includes('n')) {
          popupRef.current.style.left = `${newX}px`
          popupRef.current.style.top = `${newY}px`
        }
      }
    }

    const onUp = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      setIsResizing(false)
      const r = popupRef.current?.getBoundingClientRect()
      if (r) {
        savePopupPosition({ x: r.left, y: r.top })
        savePopupSize({ width: Math.round(r.width), height: Math.round(r.height) })
      }
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [])

  const savePopupPosition = (pos) => {
    if (isElectron && window.electronAPI?.savePopupBounds) {
      window.electronAPI.savePopupBounds(pos)
    } else {
      try { localStorage.setItem('popup_window_position', JSON.stringify(pos)) } catch {}
    }
  }

  const savePopupSize = (size) => {
    if (isElectron && window.electronAPI?.savePopupBounds) {
      window.electronAPI.savePopupBounds({ ...size })
    } else {
      try { localStorage.setItem('popup_window_size', JSON.stringify(size)) } catch {}
    }
  }

  if (!isLoggedIn && !authLoading) {
    return (
      <div className="popup-shell">
        <div className="popup-center-message">
          <p>Please log in to view orders</p>
        </div>
      </div>
    )
  }

  if (authLoading || !initialized) {
    return (
      <div className="popup-shell">
        <div className="popup-center-message">
          <div className="popup-spinner" />
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  if (!restaurantId) {
    return (
      <div className="popup-shell">
        <div className="popup-center-message">
          <p>No restaurant found</p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={popupRef}
      className="popup-shell"
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
        <div className="popup-titlebar-left">
          <button className="popup-hamburger" onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen) }} aria-label="Menu">
            <span></span>
            <span></span>
            <span></span>
          </button>
          <span className="popup-titlebar-title">{activeView === 'live' ? 'Live Orders' : 'Past Orders'}</span>
        </div>
        <div className="popup-titlebar-right">
          <button
            className="popup-minimize-btn"
            onClick={(e) => { e.stopPropagation(); if (window.electronAPI?.minimizePopup) window.electronAPI.minimizePopup() }}
            aria-label="Minimize to bubble"
            title="Minimize to bubble"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
              <circle cx="6" cy="6" r="2" fill="currentColor"/>
            </svg>
          </button>
          <span className="popup-titlebar-user">{userFullName}</span>
        </div>
      </div>

      {menuOpen && (
        <>
          <div className="popup-menu-overlay" onClick={() => setMenuOpen(false)} />
          <div className="popup-menu-dropdown">
            <button
              className={`popup-menu-item ${activeView === 'live' ? 'active' : ''}`}
              onClick={() => { setActiveView('live'); setActiveSubTab('orders'); setMenuOpen(false) }}
            >
              Live Orders
              {orders.length > 0 && <span className="popup-menu-badge">{orders.length}</span>}
            </button>
            <button
              className={`popup-menu-item ${activeView === 'past' ? 'active' : ''}`}
              onClick={() => { setActiveView('past'); setMenuOpen(false) }}
            >
              Past Orders
            </button>
          </div>
        </>
      )}

      <div className="popup-content">
        {activeView === 'live' ? (
          <div className="popup-subtabs">
            <button
              className={`popup-subtab ${activeSubTab === 'orders' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('orders')}
            >
              Live Orders
              {orders.length > 0 && <span className="popup-tab-badge">{orders.length}</span>}
            </button>
            <button
              className={`popup-subtab ${activeSubTab === 'notifications' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('notifications')}
            >
              Notifications
            </button>
          </div>
        ) : (
          <div className="popup-subtabs">
            <div className="popup-subtab-label">Past Orders</div>
          </div>
        )}

        {activeView === 'live' && activeSubTab === 'orders' ? (
          <div className="popup-orders-area">
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
                <div className="popup-empty-icon">{'\uD83D\uDD50'}</div>
                <h3>No live orders</h3>
                <p>Pending orders from customers will appear here</p>
              </div>
            ) : (
              <>
                <div className="popup-orders-count">{orders.length} order{orders.length !== 1 ? 's' : ''} waiting</div>
                <div className="popup-orders-list">
                  {orders.filter(o => o.status === 'pending').map(order => {
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
                            <span className="popup-table-badge">Table {tableNum || '\u2014'}</span>
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
        ) : activeView === 'live' && activeSubTab === 'notifications' ? (
          <div className="popup-orders-area">
            <div className="popup-notifications-panel">
              <h3 className="popup-notifications-title">Notification Settings</h3>

              <div className="popup-notif-row">
                <div className="popup-notif-info">
                  <span className="popup-notif-label">Sound Alerts</span>
                  <span className="popup-notif-desc">Play sound when a new order arrives</span>
                </div>
                <button
                  className={`popup-toggle ${preferences.soundEnabled ? 'active' : ''}`}
                  onClick={() => setPreferences(prev => {
                    const next = { ...prev, soundEnabled: !prev.soundEnabled }
                    try { localStorage.setItem('popup_preferences', JSON.stringify(next)) } catch {}
                    return next
                  })}
                >
                  <span className="popup-toggle-knob" />
                </button>
              </div>

              {preferences.soundEnabled && (
                <div className="popup-notif-row">
                  <div className="popup-notif-info">
                    <span className="popup-notif-label">Notification Sound</span>
                    <span className="popup-notif-desc">Choose the alert tone</span>
                  </div>
                  <select
                    className="popup-notif-select"
                    value={preferences.notificationSound}
                    onChange={(e) => setPreferences(prev => {
                      const next = { ...prev, notificationSound: e.target.value }
                      try { localStorage.setItem('popup_preferences', JSON.stringify(next)) } catch {}
                      return next
                    })}
                  >
                    {SOUND_OPTIONS.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="popup-notif-row">
                <div className="popup-notif-info">
                  <span className="popup-notif-label">Order Notifications</span>
                  <span className="popup-notif-desc">Show desktop alerts for new orders</span>
                </div>
                <button
                  className={`popup-toggle ${preferences.orderNotifications ? 'active' : ''}`}
                  onClick={() => setPreferences(prev => {
                    const next = { ...prev, orderNotifications: !prev.orderNotifications }
                    try { localStorage.setItem('popup_preferences', JSON.stringify(next)) } catch {}
                    return next
                  })}
                >
                  <span className="popup-toggle-knob" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="popup-orders-area">
            {pastOrders.length === 0 ? (
              <div className="popup-empty">
                <div className="popup-empty-icon">{'\uD83D\uDCCB'}</div>
                <h3>No past orders</h3>
                <p>Accepted orders will appear here</p>
              </div>
            ) : (
              <>
                <div className="popup-orders-count">Past Orders &middot; {pastOrders.length} total</div>
                <div className="popup-orders-list">
                  {pastOrders.map(order => {
                    const items = Array.isArray(order.items) ? order.items : []
                    const tableNum = order.restaurant_tables?.table_number
                    const orderCode = order.order_code || (order.id ? order.id.slice(0, 8).toUpperCase() : 'N/A')

                    return (
                      <div key={order.id} className="popup-order-card">
                        <div className="popup-card-header">
                          <div className="popup-card-header-left">
                            <span className="popup-order-id">#{orderCode}</span>
                            {tableNum && <span className="popup-table-badge">Table {tableNum}</span>}
                          </div>
                          <span className="popup-order-date">
                            {order.created_at ? formatOrderDateTime(order.created_at) : ''}
                          </span>
                        </div>
                        <div className="popup-items">
                          {items.map((item, i) => (
                            <div key={i} className="popup-item">
                              <span className="popup-item-name">{item.name || 'Item'}</span>
                              <span className="popup-item-qty">x{item.quantity ?? 1}</span>
                              <span className="popup-item-price">₹{((item.price ?? 0) * (item.quantity ?? 1)).toFixed(0)}</span>
                            </div>
                          ))}
                        </div>
                        <div className="popup-total-row">
                          <span className="popup-total-label">Total</span>
                          <span className="popup-total-amount">₹{order.total_price?.toFixed(0) || '0'}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="popup-resize-handle popup-resize-handle--n" onPointerDown={(e) => handleResizeStart(e, 'n')} />
      <div className="popup-resize-handle popup-resize-handle--s" onPointerDown={(e) => handleResizeStart(e, 's')} />
      <div className="popup-resize-handle popup-resize-handle--e" onPointerDown={(e) => handleResizeStart(e, 'e')} />
      <div className="popup-resize-handle popup-resize-handle--w" onPointerDown={(e) => handleResizeStart(e, 'w')} />
      <div className="popup-resize-handle popup-resize-handle--se" onPointerDown={(e) => handleResizeStart(e, 'se')} />
    </div>
  )
}

export default PopupApp
