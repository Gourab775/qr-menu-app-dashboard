import React, { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './lib/supabase'
import { useAuth } from './contexts/AuthContext'
import { formatOrderDateTime } from './utils/formatDateTime'
import * as orderStore from './services/orderStore'
import './PopupApp.css'

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

function PopupApp() {
  const { session, profile, loading: authLoading, initialized, restaurantId, userDataLoading } = useAuth()
  const [orders, setOrders] = useState(() => orderStore.getPending())
  const [pastOrders, setPastOrders] = useState(() => orderStore.getPast())
  const [waiterCalls, setWaiterCalls] = useState([])
  const [activeView, setActiveView] = useState('live')
  const [menuOpen, setMenuOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [activeSubTab, setActiveSubTab] = useState('orders')
  const [preferences, setPreferences] = useState(() => {
    try {
      const saved = localStorage.getItem('popup_preferences')
      return saved ? JSON.parse(saved) : { soundEnabled: true, orderNotifications: true, notificationSound: 'beep', order_notification_sound: 'classic-notification', waiter_notification_sound: 'service-bell' }
    } catch {
      return { soundEnabled: true, orderNotifications: true, notificationSound: 'beep', order_notification_sound: 'classic-notification', waiter_notification_sound: 'service-bell' }
    }
  })

  const popupRef = useRef(null)
  const isMountedRef = useRef(true)
  const lastOrderIds = useRef(new Set())
  const waiterPlayFnRef = useRef(null)
  const waiterChannelRef = useRef(null)

  const isLoggedIn = !!session
  const userFullName = profile?.full_name || profile?.email || session?.user?.email || 'User'
  const isElectron = window.electronAPI?.isElectron

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

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

    const soundReadyRef = { current: false }
    const audioCtxRef = { current: null }
    let orderPlayFn = null
    let waiterPlayFn = null

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

    const cleanup = orderStore.startConsumer((pending, past) => {
      if (!isMountedRef.current) return
      if (!soundReadyRef.current) initAudio()

      const prevIds = lastOrderIds.current
      const currIds = new Set(pending.map(o => o.id))
      const hasNewOrder = pending.some(o => !prevIds.has(o.id))
      if (hasNewOrder) {
        console.log('[Order Sound] New Order Received (BroadcastChannel)', { newOrderIds: [...currIds].filter(id => !prevIds.has(id)) })
        if (localStorage.getItem('order_sound_enabled') !== 'false' && orderPlayFn) {
          try { orderPlayFn() } catch {}
        }
      } else {
        console.log('[Order Sound] Ignored Existing Order (BroadcastChannel)')
      }
      lastOrderIds.current = currIds

      setOrders(pending)
      setPastOrders(past)
    })

    return () => {
      document.removeEventListener('click', handleGesture)
      document.removeEventListener('keydown', handleGesture)
      if (audioCtxRef.current) { try { audioCtxRef.current.close() } catch {} }
      cleanup()
    }
  }, [isLoggedIn, restaurantId, preferences.order_notification_sound, preferences.waiter_notification_sound])

  // WAITER CALLS — fetch + realtime only, no polling
  useEffect(() => {
    if (!isLoggedIn || !restaurantId) return

    if (!restaurantId) {
      console.error('[Realtime] Missing restaurantId')
      return
    }

    const waiterChannelName = `waiter-live-${restaurantId}-popup`

    if (waiterChannelRef.current) {
      console.log('[Realtime] Duplicate Subscription Prevented for waiter channel')
      supabase.removeChannel(waiterChannelRef.current)
      waiterChannelRef.current = null
    }

    let isSubscribed = true
    console.log('[Realtime] Channel Created: waiter', waiterChannelName)
    console.log('[Realtime] Restaurant ID:', restaurantId)

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
          console.log('[Realtime] Event Received: waiter', payload.eventType, payload.new?.id)

          // Cross-tenant validation
          if (payload.new && payload.new.restaurant_id !== restaurantId) {
            console.error('[CROSS-TENANT] PopupApp received waiter call from wrong restaurant:', {
              eventRestaurantId: payload.new.restaurant_id,
              currentRestaurantId: restaurantId,
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
            if (localStorage.getItem('waiter_sound_enabled') !== 'false' && waiterPlayFnRef.current) {
              try { waiterPlayFnRef.current() } catch {}
            }
          }
          if (payload.eventType === 'UPDATE') {
            // Cross-tenant validation for UPDATE
            if (payload.new && payload.new.restaurant_id !== restaurantId) {
              console.error('[CROSS-TENANT] PopupApp received waiter call UPDATE from wrong restaurant:', {
                eventRestaurantId: payload.new.restaurant_id,
                currentRestaurantId: restaurantId,
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
      console.log('[Realtime] Waiter channel subscribed')
    } catch (err) {
      console.error('[Realtime] Waiter subscription failed:', err)
    }

    const fetchWaiterCalls = async () => {
      if (!restaurantId) {
        console.error('[Popup WaiterCalls] Cannot fetch: restaurant_id is missing')
        return
      }
      console.log('[Popup WaiterCalls] Fetching with restaurant_id filter:', restaurantId)
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

      console.log("[Popup WaiterCalls] Raw data:", data?.length || 0, "records")
      console.log("[Popup WaiterCalls] Error:", error)

      if (error) {
        if (isSubscribed) setWaiterCalls([])
        return
      }

      if (data) setWaiterCalls(data)
    }

    fetchWaiterCalls()

    return () => {
      isSubscribed = false
      if (waiterChannelRef.current) {
        console.log('[Realtime] Channel Removed: waiter')
        supabase.removeChannel(waiterChannelRef.current)
        waiterChannelRef.current = null
      }
    }
  }, [isLoggedIn, restaurantId])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        setOrders(orderStore.getPending())
        setPastOrders(orderStore.getPast())
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  const handleAccept = async (orderId) => {
    let movedOrder = null
    setOrders(prev => {
      const order = prev.find(o => o.id === orderId)
      if (order) movedOrder = { ...order, status: 'accepted' }
      return prev.filter(o => o.id !== orderId)
    })
    if (movedOrder) setPastOrders(prev => [movedOrder, ...prev])

    try {
      console.log('[Popup] handleAccept - updating status to accepted:', { id: orderId, order_code: movedOrder?.order_code })
      const { error } = await supabase.from('live_orders').update({ status: 'accepted' }).eq('id', orderId).eq('restaurant_id', restaurantId)
      if (error) throw error
      console.log('[Popup] handleAccept - success:', { id: orderId, order_code: movedOrder?.order_code })
      showToast('Order accepted')
    } catch (err) {
      console.error('[Popup] handleAccept error:', { id: orderId, message: err.message, code: err.code })
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
      console.log('[Popup] handleDecline:', { id: orderId, order_code: orderCode })
      const { error } = await supabase.from('live_orders').delete().eq('id', orderId).eq('restaurant_id', restaurantId)
      if (error) throw error
      setOrders(prev => prev.filter(o => o.id !== orderId))
      console.log('[Popup] handleDecline - success:', { id: orderId, order_code: orderCode })
      showToast('Order declined')
    } catch (err) {
      console.error('[Popup] handleDecline error:', { id: orderId, message: err.message, code: err.code })
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
    } catch (err) {
      console.error('[Popup] handleResolveWaiter error:', err)
      if (removedCall) {
        setWaiterCalls(prev => {
          if (prev.some(c => c.id === removedCall.id)) return prev
          return [removedCall, ...prev]
        })
      }
      showToast('Failed to resolve waiter request', 'error')
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

  if (authLoading || !initialized || userDataLoading) {
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
              className={`popup-subtab ${activeSubTab === 'waiter-call' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('waiter-call')}
            >
              Waiter Call
              {waiterCalls.length > 0 && <span className="popup-tab-badge">{waiterCalls.length}</span>}
            </button>
          </div>
        ) : (
          <div className="popup-subtabs">
            <div className="popup-subtab-label">Past Orders</div>
          </div>
        )}

        {activeView === 'live' && activeSubTab === 'orders' ? (
          <div className="popup-orders-area">
            {orders.length === 0 ? (
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
        ) : activeView === 'live' && activeSubTab === 'waiter-call' ? (
          <div className="popup-orders-area">
            {waiterCalls.length === 0 ? (
              <div className="popup-empty">
                <div className="popup-empty-icon">{'\uD83D\uDD0D'}</div>
                <h3>No waiter calls</h3>
                <p>Customer requests for assistance will appear here</p>
              </div>
            ) : (
              <>
                <div className="popup-orders-count">{waiterCalls.length} waiter call{waiterCalls.length !== 1 ? 's' : ''}</div>
                <div className="popup-orders-list">
                  {waiterCalls.map(call => {
                    const tableNum = call.table_number || call.restaurant_tables?.table_number || call.table_id?.slice(0, 8) || '\u2014'
                    const orderCode = call.order_code || null
                    return (
                      <div key={call.id} className="popup-order-card">
                        <div className="popup-card-header">
                          <div className="popup-card-header-left">
                            <span className="popup-table-badge" style={{ fontSize: 13, fontWeight: 700, color: '#fbbf24' }}>Table {tableNum}</span>
                            {orderCode && <span className="popup-order-id" style={{ fontSize: 11, color: '#a1a1aa' }}>Order #{orderCode}</span>}
                          </div>
                          <span className="popup-order-date">
                            {call.created_at ? formatOrderDateTime(call.created_at) : ''}
                          </span>
                        </div>
                        <div className="popup-card-footer" style={{ borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 8 }}>
                          <button className="popup-accept-btn" onClick={() => handleResolveWaiter(call.id)}>Resolve</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
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
