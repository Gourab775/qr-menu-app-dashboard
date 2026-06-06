import React, { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatOrderDateTime } from '../utils/formatDateTime'
import * as orderStore from '../services/orderStore'
import { IconClock, IconSearch, IconClipboard } from '../components/Icons'
import '../PopupApp.css'
import './LiveOrdersPage.css'

function LiveOrdersPage({ restaurantId }) {
  const { session } = useAuth()
  const [orders, setOrders] = useState(() => orderStore.getPending())
  const [pastOrders, setPastOrders] = useState(() => orderStore.getPast())
  const [waiterCalls, setWaiterCalls] = useState([])
  const [activeView, setActiveView] = useState('live')
  const [activeSubTab, setActiveSubTab] = useState('orders')
  const [toast, setToast] = useState(null)
  const [preferences] = useState(() => {
    try {
      const saved = localStorage.getItem('popup_preferences')
      return saved ? JSON.parse(saved) : { soundEnabled: true, orderNotifications: true, notificationSound: 'beep' }
    } catch {
      return { soundEnabled: true, orderNotifications: true, notificationSound: 'beep' }
    }
  })

  const isMountedRef = useRef(true)
  const lastOrderIds = useRef(new Set())
  const waiterChannelRef = useRef(null)
  const isLoggedIn = !!session

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  useEffect(() => {
    if (!isLoggedIn || !restaurantId) return

    const soundReadyRef = { current: false }
    const audioCtxRef = { current: null }
    let playFn = null

    const createSound = () => {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (!AudioContext) return null
      try {
        const ctx = new AudioContext()
        audioCtxRef.current = ctx
        return () => {
          if (ctx.state === 'suspended') ctx.resume()
          let delay = 0
          const soundOpt = { freq: [800, 1000], duration: 0.3 }
          soundOpt.freq.forEach((freq, i) => {
            setTimeout(() => {
              const osc = ctx.createOscillator()
              const gain = ctx.createGain()
              osc.connect(gain); gain.connect(ctx.destination)
              osc.frequency.value = freq; osc.type = 'sine'
              const td = soundOpt.duration / soundOpt.freq.length
              gain.gain.setValueAtTime(0.25, ctx.currentTime)
              gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + td)
              osc.start(ctx.currentTime); osc.stop(ctx.currentTime + td)
            }, delay)
            delay += (soundOpt.duration * 1000) / soundOpt.freq.length
          })
        }
      } catch { return null }
    }

    const initAudio = () => {
      if (soundReadyRef.current) return
      playFn = createSound()
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
      if (hasNewOrder) {
        if (localStorage.getItem('order_sound_enabled') !== 'false' && playFn) {
          try { playFn() } catch {}
        }
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
      const { error } = await supabase.from('live_orders').update({ status: 'accepted' }).eq('id', orderId).eq('restaurant_id', restaurantId)
      if (error) throw error
      showToast('Order accepted')
    } catch (err) {
      console.error('[LiveOrders] handleAccept error:', err)
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
      const { error } = await supabase.from('live_orders').delete().eq('id', orderId).eq('restaurant_id', restaurantId)
      if (error) throw error
      setOrders(prev => prev.filter(o => o.id !== orderId))
      showToast('Order declined')
    } catch (err) {
      console.error('[LiveOrders] handleDecline error:', err)
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
      console.error('[LiveOrders] handleResolveWaiter error:', err)
      if (removedCall) {
        setWaiterCalls(prev => {
          if (prev.some(c => c.id === removedCall.id)) return prev
          return [removedCall, ...prev]
        })
      }
      showToast('Failed to resolve waiter request', 'error')
    }
  }

  return (
    <div className="live-orders-page">
      {toast && (
        <div className={`popup-toast popup-toast--${toast.type}`}>
          {toast.message}
        </div>
      )}

      <div className="popup-subtabs">
        <button
          className={`popup-subtab ${activeView === 'live' && activeSubTab === 'orders' ? 'active' : ''}`}
          onClick={() => { setActiveView('live'); setActiveSubTab('orders') }}
        >
          Live Orders
          {orders.length > 0 && <span className="popup-tab-badge">{orders.length}</span>}
        </button>
        <button
          className={`popup-subtab ${activeView === 'live' && activeSubTab === 'waiter-call' ? 'active' : ''}`}
          onClick={() => { setActiveView('live'); setActiveSubTab('waiter-call') }}
        >
          Waiter Call
          {waiterCalls.length > 0 && <span className="popup-tab-badge">{waiterCalls.length}</span>}
        </button>
        <button
          className={`popup-subtab ${activeView === 'past' ? 'active' : ''}`}
          onClick={() => setActiveView('past')}
        >
          Past Orders
        </button>
      </div>

      <div className="popup-orders-area">
        {activeView === 'live' && activeSubTab === 'orders' ? (
          orders.length === 0 ? (
            <div className="popup-empty">
              <div className="popup-empty-icon"><IconClock size={48} /></div>
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
          )
        ) : activeView === 'live' && activeSubTab === 'waiter-call' ? (
          waiterCalls.length === 0 ? (
            <div className="popup-empty">
              <div className="popup-empty-icon"><IconSearch size={48} /></div>
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
          )
        ) : (
          pastOrders.length === 0 ? (
            <div className="popup-empty">
              <div className="popup-empty-icon"><IconClipboard size={48} /></div>
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
          )
        )}
      </div>
    </div>
  )
}

export default LiveOrdersPage
