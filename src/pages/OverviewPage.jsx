import { useState, useEffect, useCallback, useRef } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend, AreaChart, Area
} from 'recharts'
import { supabase } from '../lib/supabase'
import { fetchWithTimeout, deduplicateRequest } from '../lib/apiUtils'
import { useAuth } from '../contexts/AuthContext'
import './OverviewPage.css'

const API_TIMEOUT = 15000

const ACCENT = {
  green: '#22c55e',
  blue: '#3b82f6',
  orange: '#f59e0b',
  purple: '#8b5cf6',
  background: '#09090b',
  card: '#18181b',
  border: '#27272a',
  text: '#fafafa',
  muted: '#a1a1aa'
}

const CHART_COLORS = {
  revenue: ACCENT.green,
  orders: ACCENT.blue,
  counter: ACCENT.orange,
  online: ACCENT.purple
}

function formatCurrency(v) {
  return '₹' + (v || 0).toLocaleString('en-IN')
}

function getTimeAgo(date) {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return mins + 'm'
  const hours = Math.floor(mins / 60)
  if (hours < 24) return hours + 'h'
  return new Date(date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
}

function getLocalDateString(date) {
  const d = new Date(date)
  const pad = n => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function getDaysInRange(startDate, endDate) {
  const days = []
  const current = new Date(startDate)
  const end = new Date(endDate)
  while (current <= end) {
    days.push(new Date(current))
    current.setDate(current.getDate() + 1)
  }
  return days
}

export default function OverviewPage({ restaurantId }) {
  const { initialized, isAuthenticated } = useAuth()
  const [filter, setFilter] = useState('7days')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [metrics, setMetrics] = useState(null)

  const mountedRef = useRef(false)
  const abortControllerRef = useRef(null)
  const currentFilterRef = useRef('7days')
  const isFetchingRef = useRef(false)
  const initialFetchDoneRef = useRef(false)

  const getDateRange = useCallback((range) => {
    const now = new Date()
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    let start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)

    switch (range) {
      case 'today': break
      case '7days': start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000); start.setHours(0,0,0,0); break
      case '30days': start = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000); start.setHours(0,0,0,0); break
      case 'all': start = new Date(2020, 0, 1); start.setHours(0,0,0,0); break
      default: start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000); start.setHours(0,0,0,0)
    }
    return { start: start.toISOString(), end: end.toISOString(), startDate: start, endDate: end }
  }, [])

  const fetchAnalytics = useCallback(async (signal = null) => {
    const filterKey = currentFilterRef.current
    
    if (isFetchingRef.current && !signal) return
    
    isFetchingRef.current = true
    
    if (!signal) {
      setLoading(true)
      setError(null)
    }

    const requestKey = `analytics-${restaurantId}-${filterKey}`

    try {
      const fetchFn = async () => {
        const { start, end, startDate, endDate } = getDateRange(filterKey)

        const ordersPromise = supabase
          .from('live_orders')
          .select('*')
          .eq('restaurant_id', restaurantId)
          .gte('created_at', start)
          .lte('created_at', end)
          .order('created_at', { ascending: false })

        return await fetchWithTimeout(ordersPromise, API_TIMEOUT)
      }

      const executeFetch = signal 
        ? fetchFn 
        : () => deduplicateRequest(requestKey, fetchFn)

      const { data: orders, error: queryError } = await executeFetch()

      if (!mountedRef.current) return

      if (queryError) throw new Error(queryError.message)

      const list = Array.isArray(orders) ? orders : []

      const allDays = getDaysInRange(startDate, endDate)
      const dailyRev = {}
      const dailyOrd = {}

      allDays.forEach(day => {
        const dateKey = getLocalDateString(day)
        dailyRev[dateKey] = 0
        dailyOrd[dateKey] = 0
      })

      list.forEach(o => {
        if (!o?.created_at) return
        if (o.status === 'rejected') return

        const dayKey = getLocalDateString(o.created_at)
        dailyRev[dayKey] = (dailyRev[dayKey] || 0) + (Number(o.total_price) || 0)
        dailyOrd[dayKey] = (dailyOrd[dayKey] || 0) + 1
      })

      if (!mountedRef.current) return

      const completed = list.filter(o => o.status === 'accepted')
      const pending = list.filter(o => o.status !== 'accepted' && o.status !== 'rejected')

      const items = {}
      const payments = { counter: 0, online: 0 }
      const paymentRevenue = { counter: 0, online: 0 }

      list.forEach(o => {
        if (o.status === 'rejected') return
        const pm = (o.payment_mode || 'counter').toLowerCase()
        const pmKey = pm === 'online' ? 'online' : 'counter'
        payments[pmKey]++
        paymentRevenue[pmKey] += (Number(o.total_price) || 0)

        const orderItems = Array.isArray(o.items) ? o.items : []
        orderItems.forEach(it => {
          if (!it) return
          const name = it.name || 'Item'
          items[name] = (items[name] || 0) + (Number(it.quantity) || 1)
        })
      })

      const topItems = Object.entries(items)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }))

      const chartData = allDays.map(day => {
        const dateKey = getLocalDateString(day)
        return {
          date: dateKey,
          label: day.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
          revenue: dailyRev[dateKey] || 0,
          orders: dailyOrd[dateKey] || 0
        }
      })

      const payData = [
        { name: 'Counter', value: payments.counter, revenue: paymentRevenue.counter, fill: CHART_COLORS.counter },
        { name: 'Online', value: payments.online, revenue: paymentRevenue.online, fill: CHART_COLORS.online }
      ].filter(d => d.value > 0)

      if (!mountedRef.current) return

      setMetrics({
        ordersTotal: list.length,
        revenueTotal: completed.reduce((s, o) => s + (Number(o.total_price) || 0), 0),
        revenuePending: pending.reduce((s, o) => s + (Number(o.total_price) || 0), 0),
        avgOrder: completed.length ? Math.round(completed.reduce((s, o) => s + (Number(o.total_price) || 0), 0) / completed.length) : 0,
        itemsSold: Object.values(items).reduce((a, b) => a + b, 0),
        completedOrders: completed.length,
        pendingOrders: pending.length,
        topItems,
        chartData,
        payData,
        paymentRevenue,
      })
    } catch (err) {
      console.error('Analytics fetch failed:', err)
      if (!mountedRef.current) return
      setError(err.name === 'AbortError' ? 'Request cancelled' : err.message)
      setMetrics(emptyState())
    } finally {
      if (mountedRef.current) {
        isFetchingRef.current = false
        setLoading(false)
        initialFetchDoneRef.current = true
      }
    }
  }, [restaurantId, getDateRange])

  const emptyState = () => ({
    ordersTotal: 0, revenueTotal: 0, revenuePending: 0, avgOrder: 0, itemsSold: 0,
    completedOrders: 0, pendingOrders: 0, topItems: [], chartData: [], payData: [], paymentRevenue: { counter: 0, online: 0 }
  })

  useEffect(() => {
    mountedRef.current = true
    currentFilterRef.current = filter

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    const controller = new AbortController()
    abortControllerRef.current = controller

    if (!initialized || !isAuthenticated || !restaurantId) {
      setLoading(false)
      return () => {
        mountedRef.current = false
        controller.abort()
      }
    }

    fetchAnalytics(controller.signal)

    return () => {
      mountedRef.current = false
      controller.abort()
      abortControllerRef.current = null
      isFetchingRef.current = false
    }
  }, [filter, initialized, isAuthenticated, restaurantId, fetchAnalytics])

  const handleFilterChange = useCallback((newFilter) => {
    if (newFilter === filter) return
    setFilter(newFilter)
  }, [filter])

  const handleRetry = useCallback(() => {
    setError(null)
    setLoading(true)
    fetchAnalytics()
  }, [fetchAnalytics])

  const fmtPct = (a, b) => b ? Math.round(a / b * 100) : 0

  const tabs = [
    { id: 'today', label: 'Today' },
    { id: '7days', label: 'Last 7 Days' },
    { id: '30days', label: 'Last 30 Days' },
    { id: 'all', label: 'All Time' }
  ]

  const filterLabel = tabs.find(t => t.id === filter)?.label || 'Overview'

  if (!initialized || !isAuthenticated) {
    return (
      <div className="analytics-dashboard">
        <div className="skeleton-container">
          <div className="skeleton-grid">
            <div className="skeleton skeleton-card"></div>
            <div className="skeleton skeleton-card"></div>
            <div className="skeleton skeleton-card"></div>
            <div className="skeleton skeleton-card"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="analytics-dashboard">
      <div className="analytics-header">
        <div className="analytics-header-left">
          <h1>Analytics Overview</h1>
          <p>Performance insights for {filterLabel.toLowerCase()}</p>
        </div>
        <div className="analytics-filters">
          {tabs.map(t => (
            <button
              key={t.id}
              className={`analytics-filter-btn ${filter === t.id ? 'active' : ''}`}
              onClick={() => handleFilterChange(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !metrics ? (
        <div className="skeleton-container">
          <div className="skeleton-grid">
            <div className="skeleton skeleton-card"></div>
            <div className="skeleton skeleton-card"></div>
            <div className="skeleton skeleton-card"></div>
            <div className="skeleton skeleton-card"></div>
          </div>
          <div className="skeleton-grid" style={{ marginTop: '24px' }}>
            <div className="skeleton skeleton-card" style={{ height: '320px', gridColumn: 'span 2' }}></div>
            <div className="skeleton skeleton-card" style={{ height: '320px' }}></div>
          </div>
        </div>
      ) : error && !metrics ? (
        <div className="analytics-empty">
          <h3>Failed to load analytics</h3>
          <p>{error}</p>
          <button className="analytics-filter-btn active" style={{marginTop: '16px'}} onClick={handleRetry}>Retry</button>
        </div>
      ) : metrics ? (
        <>
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-icon-wrap revenue">💰</div>
              <div className="kpi-info">
                <span className="kpi-label">Total Revenue</span>
                <span className="kpi-value">{formatCurrency(metrics.revenueTotal)}</span>
                {metrics.revenuePending > 0 ? (
                  <span className="kpi-sub neutral">{formatCurrency(metrics.revenuePending)} pending</span>
                ) : (
                  <span className="kpi-sub positive">From {metrics.completedOrders} completed</span>
                )}
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-icon-wrap orders">📦</div>
              <div className="kpi-info">
                <span className="kpi-label">Total Orders</span>
                <span className="kpi-value">{metrics.ordersTotal}</span>
                <span className="kpi-sub neutral">{metrics.completedOrders} completed • {metrics.pendingOrders} pending</span>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-icon-wrap avg">📈</div>
              <div className="kpi-info">
                <span className="kpi-label">Average Order</span>
                <span className="kpi-value">{formatCurrency(metrics.avgOrder)}</span>
                <span className="kpi-sub positive">Per successful order</span>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-icon-wrap items">🍽️</div>
              <div className="kpi-info">
                <span className="kpi-label">Items Sold</span>
                <span className="kpi-value">{metrics.itemsSold}</span>
                <span className="kpi-sub neutral">Across all categories</span>
              </div>
            </div>
          </div>

          <div className="charts-grid">
            <div className="chart-card">
              <div className="chart-header">
                <h3>Revenue & Order Trend</h3>
                <p>Daily performance over the selected period</p>
              </div>
              <div className="chart-body">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={metrics.chartData}>
                    <defs>
                      <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.revenue} stopOpacity={0.3}/>
                        <stop offset="95%" stopColor={CHART_COLORS.revenue} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="label" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                    <YAxis yAxisId="left" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} dx={-10} tickFormatter={(value) => `₹${value}`} />
                    <YAxis yAxisId="right" orientation="right" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} dx={10} />
                    <Tooltip 
                      contentStyle={{ background: 'rgba(24, 24, 27, 0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)', backdropFilter: 'blur(8px)' }}
                      labelStyle={{ color: '#a1a1aa', fontWeight: 'bold', marginBottom: '8px' }}
                      itemStyle={{ fontWeight: '500' }}
                    />
                    <Area yAxisId="left" type="monotone" name="Revenue" dataKey="revenue" stroke={CHART_COLORS.revenue} strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                    <Line yAxisId="right" type="monotone" name="Orders" dataKey="orders" stroke={CHART_COLORS.orders} strokeWidth={2} dot={{r: 4, strokeWidth: 2}} activeDot={{r: 6}} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="chart-card">
              <div className="chart-header">
                <h3>Payment Breakdown</h3>
                <p>Orders and revenue by payment mode</p>
              </div>
              <div className="chart-body" style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px'}}>
                <div style={{ width: '100%', display: 'flex', justifyContent: 'space-around', padding: '0 10px' }}>
                  <div style={{ textAlign: 'center', padding: '12px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '12px', flex: 1, marginRight: '8px', border: `1px solid ${CHART_COLORS.online}30` }}>
                    <p style={{ color: '#a1a1aa', fontSize: '13px', margin: '0 0 4px 0' }}>Online Revenue</p>
                    <p style={{ color: CHART_COLORS.online, fontWeight: 'bold', fontSize: '20px', margin: 0 }}>{formatCurrency(metrics.paymentRevenue?.online || 0)}</p>
                  </div>
                  <div style={{ textAlign: 'center', padding: '12px', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '12px', flex: 1, marginLeft: '8px', border: `1px solid ${CHART_COLORS.counter}30` }}>
                    <p style={{ color: '#a1a1aa', fontSize: '13px', margin: '0 0 4px 0' }}>Counter Revenue</p>
                    <p style={{ color: CHART_COLORS.counter, fontWeight: 'bold', fontSize: '20px', margin: 0 }}>{formatCurrency(metrics.paymentRevenue?.counter || 0)}</p>
                  </div>
                </div>
                {metrics.payData?.length ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={metrics.payData}
                        cx="50%"
                        cy="50%"
                        innerRadius={65}
                        outerRadius={90}
                        paddingAngle={5}
                        dataKey="value"
                        stroke="none"
                      >
                        {metrics.payData.map(entry => <Cell key={entry.name} fill={entry.fill} />)}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ background: 'rgba(24, 24, 27, 0.9)', border: '1px solid #27272a', borderRadius: '8px' }}
                        itemStyle={{ color: '#fff', fontWeight: 600 }}
                      />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" formatter={v => <span style={{ color: '#e4e4e7', fontWeight: 500 }}>{v}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="analytics-empty" style={{width: '100%', padding: '20px', border: 'none'}}>No payment data</div>
                )}
              </div>
            </div>
          </div>

          <div className="insights-grid">
            <div className="chart-card" style={{padding: '32px'}}>
              <div className="chart-header" style={{marginBottom: '32px'}}>
                <h3>🏆 Top Selling Items</h3>
                <p>Most popular items by quantity sold</p>
              </div>
              {metrics.topItems?.length ? (
                <div className="top-items-list">
                  {metrics.topItems.map((item, i) => (
                    <div key={item.name} className="top-item-row">
                      <span className={`top-item-rank rank-${i + 1}`}>#{i + 1}</span>
                      <div className="top-item-details">
                        <div className="top-item-name-row">
                          <span className="top-item-name">{item.name}</span>
                          <span className="top-item-count">{item.count} Sold</span>
                        </div>
                        <div className="top-item-bar-bg">
                          <div 
                            className="top-item-bar-fill" 
                            style={{ width: `${(item.count / metrics.topItems[0].count) * 100}%` }} 
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="analytics-empty" style={{border: 'none', padding: '20px'}}>No item sales yet</div>
              )}
            </div>

            <div className="chart-card" style={{padding: '32px'}}>
              <div className="chart-header" style={{marginBottom: '32px'}}>
                <h3>📊 Key Conversion</h3>
                <p>Analysis of successful order fulfillment</p>
              </div>
              <div style={{display:'flex', flexDirection:'column', gap:'24px', flex:1, justifyContent:'center'}}>
                <div>
                  <div style={{display:'flex', justifyContent:'space-between', marginBottom:'8px'}}>
                    <span style={{color: '#a1a1aa', fontWeight: 500}}>Completion Rate</span>
                    <span style={{color: '#fff', fontWeight: 700}}>{fmtPct(metrics.completedOrders, metrics.ordersTotal)}%</span>
                  </div>
                  <div className="top-item-bar-bg" style={{height:'12px', borderRadius:'6px'}}>
                    <div className="top-item-bar-fill" style={{ width: `${fmtPct(metrics.completedOrders, metrics.ordersTotal)}%`, background: 'linear-gradient(90deg, #22c55e, #86efac)' }} />
                  </div>
                </div>

                <div>
                  <div style={{display:'flex', justifyContent:'space-between', marginBottom:'8px'}}>
                    <span style={{color: '#a1a1aa', fontWeight: 500}}>Avg. Items Per Order</span>
                    <span style={{color: '#fff', fontWeight: 700}}>
                      {metrics.ordersTotal ? (metrics.itemsSold / metrics.ordersTotal).toFixed(1) : '0'}
                    </span>
                  </div>
                </div>

                {metrics.pendingOrders > 0 && (
                  <div style={{padding:'16px', background:'rgba(245, 158, 11, 0.1)', border:'1px solid rgba(245, 158, 11, 0.2)', borderRadius:'12px'}}>
                    <h4 style={{color:'#f59e0b', fontSize:'14px', marginBottom:'4px'}}>Action Needed</h4>
                    <p style={{color:'#d4d4d8', fontSize:'13px'}}>You have {metrics.pendingOrders} pending orders waiting to be processed.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}