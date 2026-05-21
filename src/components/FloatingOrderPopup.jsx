import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { fetchWithTimeout } from '../lib/apiUtils'
import { formatOrderDateTime } from '../utils/formatDateTime'
import './FloatingOrderPopup.css'

const API_TIMEOUT = 15000
const BUBBLE_POS_KEY = 'floating_bubble_position'
const POPUP_POS_KEY = 'floating_popup_position'
const POPUP_SIZE_KEY = 'floating_popup_size'

function loadFromStorage(key, fallback) {
  try {
    const saved = localStorage.getItem(key)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (typeof parsed === 'object' && parsed !== null) return parsed
    }
  } catch {}
  return fallback
}

const FloatingOrderPopup = forwardRef(function FloatingOrderPopup({ standalone = false, visible = true, onVisibilityChange }, ref) {
  const { session, restaurantId } = useAuth()
  const [mode, setMode] = useState(standalone ? 'popup' : 'closed')
  const [activeView, setActiveView] = useState('live')
  const [menuOpen, setMenuOpen] = useState(false)
  const [orders, setOrders] = useState([])
  const [pastOrders, setPastOrders] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)
  const [bubblePos, setBubblePos] = useState(() => loadFromStorage(BUBBLE_POS_KEY, { x: 24, y: 80 }))
  const [popupPos, setPopupPos] = useState(() => loadFromStorage(POPUP_POS_KEY, null))
  const [popupSize, setPopupSize] = useState(() => loadFromStorage(POPUP_SIZE_KEY, { width: 420, height: 680 }))
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)

  const bubbleRef = useRef(null)
  const popupRef = useRef(null)
  const ordersLoadingRef = useRef(false)
  const isMountedRef = useRef(true)
  const firstOrdersFetchDone = useRef(false)
  const lastPlayedOrderRef = useRef(null)
  const wasDismissedRef = useRef(false)

  const isLoggedIn = !!session
  const isElectron = window.electronAPI?.isElectron

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
      if (liveError) console.error('[Floating] Live query error:', liveError.message || liveError)
      if (pastError) console.error('[Floating] Past query error:', pastError.message || pastError)

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
      console.error('[Floating] loadOrders exception:', err)
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
    loadOrders()
    return () => {
      isMountedRef.current = false
      ordersLoadingRef.current = false
    }
  }, [isLoggedIn, restaurantId, loadOrders])

  useEffect(() => {
    if (!isLoggedIn || !restaurantId) return

    const audioCtxRefLocal = { current: null }

    const playSound = () => {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext
        if (!AudioContext) return
        const ctx = new AudioContext()
        audioCtxRefLocal.current = ctx
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.frequency.value = 800
        osc.type = 'sine'
        gain.gain.setValueAtTime(0.2, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.3)
      } catch {}
    }

    const channel = supabase
      .channel('floating-live-orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_orders' },
        (payload) => {
          if (payload.new.restaurant_id !== restaurantId) return
          const newOrderId = payload.new.id
          const rawStatus = payload.new.status

          if (rawStatus === 'pending' && lastPlayedOrderRef.current !== newOrderId) {
            lastPlayedOrderRef.current = newOrderId
            playSound()
          }

          if (rawStatus === 'pending') {
            setUnreadCount(prev => prev + 1)
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
      console.error('[Floating] Accept error:', err)
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

  const openPopup = useCallback(() => {
    setMode('popup')
    setUnreadCount(0)
    wasDismissedRef.current = true
    if (onVisibilityChange) onVisibilityChange(true)
  }, [onVisibilityChange])

  const minimizeToBubble = useCallback(() => {
    setMode('bubble')
    if (onVisibilityChange) onVisibilityChange(false)
  }, [onVisibilityChange])

  const handleBubbleDragStart = useCallback((e) => {
    if (isElectron) return
    e.preventDefault()
    const rect = bubbleRef.current?.getBoundingClientRect()
    if (!rect) return

    const startX = e.clientX
    const startY = e.clientY
    const startLeft = rect.left
    const startTop = rect.top

    const onMove = (ev) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      const newX = startLeft + dx
      const newY = startTop + dy
      if (bubbleRef.current) {
        bubbleRef.current.style.left = `${newX}px`
        bubbleRef.current.style.top = `${newY}px`
      }
    }

    const onUp = (ev) => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      const finalX = Math.max(0, Math.min(window.innerWidth - 56, startLeft + (ev.clientX - startX)))
      const finalY = Math.max(0, Math.min(window.innerHeight - 56, startTop + (ev.clientY - startY)))
      const pos = { x: finalX, y: finalY }
      setBubblePos(pos)
      try { localStorage.setItem(BUBBLE_POS_KEY, JSON.stringify(pos)) } catch {}
      if (bubbleRef.current) {
        bubbleRef.current.style.left = `${finalX}px`
        bubbleRef.current.style.top = `${finalY}px`
      }
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [isElectron])

  const handlePopupDragStart = useCallback((e) => {
    if (isElectron || isResizing) return
    if (e.target.closest('.floating-popup-hamburger') || e.target.closest('.floating-popup-menu') || e.target.closest('.floating-popup-menu-overlay') || e.target.closest('.floating-popup-controls')) return

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
      const finalX = startLeft + (ev.clientX - startX)
      const finalY = startTop + (ev.clientY - startY)
      const pos = { x: finalX, y: finalY }
      setPopupPos(pos)
      try { localStorage.setItem(POPUP_POS_KEY, JSON.stringify(pos)) } catch {}
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
      const rect2 = popupRef.current?.getBoundingClientRect()
      if (rect2) {
        const size = { width: Math.round(rect2.width), height: Math.round(rect2.height) }
        setPopupSize(size)
        try { localStorage.setItem(POPUP_SIZE_KEY, JSON.stringify(size)) } catch {}
        const pos = { x: rect2.left, y: rect2.top }
        setPopupPos(pos)
        try { localStorage.setItem(POPUP_POS_KEY, JSON.stringify(pos)) } catch {}
      }
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [])

  useImperativeHandle(ref, () => ({
    open: openPopup,
    minimize: minimizeToBubble,
    toggle: () => {
      if (mode === 'popup') minimizeToBubble()
      else openPopup()
    },
    isPopupOpen: () => mode === 'popup',
  }), [mode, openPopup, minimizeToBubble])

  if (!isLoggedIn || !restaurantId) return null

  const currentPopupPos = popupPos || { x: Math.max(24, window.innerWidth - 460), y: Math.max(24, window.innerHeight - 720) }

  const renderOrderCard = (order) => {
    const safeOrder = order || {}
    const tableNum = safeOrder.restaurant_tables?.table_number
    const items = Array.isArray(safeOrder.items) ? safeOrder.items : []
    const totalPrice = safeOrder.total_price != null ? safeOrder.total_price : 0
    const orderId = safeOrder.id || 'unknown'
    const orderCode = safeOrder.order_code || (safeOrder.id ? safeOrder.id.slice(0, 8).toUpperCase() : 'N/A')

    return (
      <div key={orderId} className="floating-popup-order-card">
        <div className="floating-popup-card-header">
          <div className="floating-popup-card-header-left">
            <span className="floating-popup-order-id">#{orderCode}</span>
            <span className="floating-popup-table-badge">Table {tableNum || '\u2014'}</span>
          </div>
          <span className="floating-popup-order-date">
            {safeOrder.created_at ? formatOrderDateTime(safeOrder.created_at) : ''}
          </span>
        </div>
        <div className="floating-popup-items">
          {items.length > 0 ? items.map((item, i) => (
            <div key={i} className="floating-popup-item">
              <span className="floating-popup-item-name">{item?.name || 'Item'}</span>
              <span className="floating-popup-item-qty">x{item?.quantity != null ? item.quantity : 1}</span>
              <span className="floating-popup-item-price">₹{((item?.price ?? 0) * (item?.quantity ?? 1)).toFixed(0)}</span>
            </div>
          )) : (
            <div className="floating-popup-item">
              <span className="floating-popup-item-name" style={{ color: '#555', fontStyle: 'italic' }}>No items</span>
            </div>
          )}
        </div>
        {safeOrder.note && (
          <div className="floating-popup-order-note">
            <span className="floating-popup-note-label">Note</span>
            <span>{safeOrder.note}</span>
          </div>
        )}
        <div className="floating-popup-total-row">
          <span className="floating-popup-total-label">Total</span>
          <span className="floating-popup-total-amount">₹{totalPrice}</span>
        </div>
        <div className="floating-popup-card-footer">
          <button className="floating-popup-decline-btn" onClick={() => handleDecline(orderId, orderCode)}>Decline</button>
          <button className="floating-popup-accept-btn" onClick={() => handleAccept(orderId)}>Accept</button>
        </div>
      </div>
    )
  }

  const renderPastOrderCard = (order) => {
    const items = Array.isArray(order.items) ? order.items : []
    const tableNum = order.restaurant_tables?.table_number
    const orderCode = order.order_code || (order.id ? order.id.slice(0, 8).toUpperCase() : 'N/A')
    return (
      <div key={order.id} className="floating-popup-past-card">
        <div className="floating-popup-past-card-top">
          <div>
            <span className="floating-popup-past-code">#{orderCode}</span>
            {tableNum && <span className="floating-popup-past-table">Table {tableNum}</span>}
          </div>
          <span className="floating-popup-past-time">{order.created_at ? formatOrderDateTime(order.created_at) : ''}</span>
        </div>
        <div className="floating-popup-past-items">
          {items.map((item, i) => (
            <div key={i} className="floating-popup-past-item-row">
              <span>{item.name || 'Item'}</span>
              <span>x{item.quantity ?? 1}</span>
              <span>₹{((item.price ?? 0) * (item.quantity ?? 1)).toFixed(0)}</span>
            </div>
          ))}
        </div>
        <div className="floating-popup-past-total-row">
          <span className="floating-popup-past-total-label">Total</span>
          <span className="floating-popup-past-total-amount">₹{order.total_price?.toFixed(0) || '0'}</span>
        </div>
      </div>
    )
  }

  const renderLiveOrders = () => (
    <div className="floating-popup-orders-area">
      {!firstOrdersFetchDone.current && loading ? (
        <div className="floating-popup-loading-grid">
          {[1, 2, 3].map(i => (
            <div key={i} className="floating-popup-skeleton-card">
              <div className="floating-popup-skeleton-line" style={{ width: '40%' }} />
              <div className="floating-popup-skeleton-line" />
              <div className="floating-popup-skeleton-line" style={{ width: '60%' }} />
            </div>
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="floating-popup-empty">
          <div className="floating-popup-empty-icon">{'\uD83D\uDD50'}</div>
          <h3>No live orders</h3>
          <p>Pending orders from customers will appear here</p>
        </div>
      ) : (
        <>
          <div className="floating-popup-orders-count">{orders.length} order{orders.length !== 1 ? 's' : ''} waiting</div>
          <div className="floating-popup-orders-list">
            {orders.map(order => renderOrderCard(order))}
          </div>
        </>
      )}
    </div>
  )

  const renderPastOrders = () => (
    <div className="floating-popup-past-orders">
      {pastOrders.length === 0 ? (
        <div className="floating-popup-empty">
          <div className="floating-popup-empty-icon">{'\uD83D\uDCCB'}</div>
          <h3>No past orders</h3>
          <p>Accepted orders will appear here</p>
        </div>
      ) : (
        <>
          <div className="floating-popup-past-header">
            <span>Past Orders</span>
            <span className="floating-popup-past-total">Total: {pastOrders.length}</span>
          </div>
          {pastOrders.map(order => renderPastOrderCard(order))}
        </>
      )}
    </div>
  )

  const bubbleStyle = {
    left: `${bubblePos.x}px`,
    top: `${bubblePos.y}px`,
  }

  const renderBubble = () => (
    <div
      ref={bubbleRef}
      className="floating-bubble"
      style={bubbleStyle}
      onPointerDown={handleBubbleDragStart}
      onClick={(e) => {
        if (e.defaultPrevented) return
        openPopup()
      }}
      title="Open Live Orders"
    >
      <svg className="floating-bubble-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <path d="M16 10a4 4 0 01-8 0" />
      </svg>
      {unreadCount > 0 && (
        <span className="floating-bubble-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
      )}
    </div>
  )

  const popupStyle = {
    left: `${currentPopupPos.x}px`,
    top: `${currentPopupPos.y}px`,
    width: `${popupSize.width}px`,
    height: `${popupSize.height}px`,
  }

  const renderPopup = () => (
    <div
      ref={popupRef}
      className={`floating-popup-shell ${isDragging ? 'dragging' : ''}`}
      style={popupStyle}
    >
      {toast && (
        <div className={`floating-popup-toast floating-popup-toast--${toast.type}`}>
          {toast.message}
        </div>
      )}

      <div
        className="floating-popup-titlebar"
        onPointerDown={!isElectron ? handlePopupDragStart : undefined}
      >
        <div className="floating-popup-hamburger" onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen) }}>
          <span></span>
          <span></span>
          <span></span>
        </div>
        <span className="floating-popup-title">Orders</span>
        <div className="floating-popup-controls">
          <button
            className="floating-popup-minimize-btn"
            onClick={(e) => { e.stopPropagation(); minimizeToBubble() }}
            title="Minimize to bubble"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </div>

      {menuOpen && (
        <>
          <div className="floating-popup-menu-overlay" onClick={() => setMenuOpen(false)} />
          <div className="floating-popup-menu">
            <button
              className={`floating-popup-menu-item ${activeView === 'live' ? 'active' : ''}`}
              onClick={() => { setActiveView('live'); setMenuOpen(false) }}
            >
              Live Orders
              {orders.length > 0 && <span style={{ marginLeft: 8, background: '#ef4444', color: '#fff', fontSize: 10, padding: '1px 6px', borderRadius: 8 }}>{orders.length}</span>}
            </button>
            <button
              className={`floating-popup-menu-item ${activeView === 'past' ? 'active' : ''}`}
              onClick={() => { setActiveView('past'); setMenuOpen(false) }}
            >
              Past Orders
            </button>
          </div>
        </>
      )}

      <div className="floating-popup-tabs">
        <button
          className={`floating-popup-tab ${activeView === 'live' ? 'active' : ''}`}
          onClick={() => setActiveView('live')}
        >
          Live Orders
          {orders.length > 0 && <span className="floating-popup-tab-badge">{orders.length}</span>}
        </button>
        <button
          className={`floating-popup-tab ${activeView === 'past' ? 'active' : ''}`}
          onClick={() => setActiveView('past')}
        >
          Past Orders
        </button>
      </div>

      <div className="floating-popup-content">
        {activeView === 'live' ? renderLiveOrders() : renderPastOrders()}
      </div>

      <div className="floating-popup-resize-handle floating-popup-resize-handle--n" onPointerDown={(e) => handleResizeStart(e, 'n')} />
      <div className="floating-popup-resize-handle floating-popup-resize-handle--s" onPointerDown={(e) => handleResizeStart(e, 's')} />
      <div className="floating-popup-resize-handle floating-popup-resize-handle--e" onPointerDown={(e) => handleResizeStart(e, 'e')} />
      <div className="floating-popup-resize-handle floating-popup-resize-handle--w" onPointerDown={(e) => handleResizeStart(e, 'w')} />
      <div className="floating-popup-resize-handle floating-popup-resize-handle--se" onPointerDown={(e) => handleResizeStart(e, 'se')} />
    </div>
  )

  if (standalone || mode === 'popup') {
    return renderPopup()
  }

  if (mode === 'bubble') {
    return renderBubble()
  }

  return null
})

export default FloatingOrderPopup
