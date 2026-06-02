import { useState, useEffect, useCallback, useRef } from 'react'
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, BarChart, Bar, CartesianGrid
} from 'recharts'
import { supabase } from '../lib/supabase'
import { fetchWithTimeout, deduplicateRequest } from '../lib/apiUtils'
import { useAuth } from '../contexts/AuthContext'
import { IconTrendingUp, IconPackage, IconShoppingBag, IconStar, IconBarChart, IconClock, IconTable } from '../components/Icons'
import './OverviewPage.css'

const API_TIMEOUT = 30000

function formatCurrency(v) {
  return '\u20B9' + (v || 0).toLocaleString('en-IN')
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

function getHoursInRange(startDate, endDate) {
  const hours = []
  const start = new Date(startDate)
  const end = new Date(endDate)
  const current = new Date(start)
  current.setMinutes(0, 0, 0)
  while (current <= end) {
    hours.push(new Date(current))
    current.setHours(current.getHours() + 1)
  }
  return hours
}

function isHourlyFilter(filter) {
  return filter === 'today' || filter === 'lastday'
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
      case 'lastday': start = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); start.setHours(0,0,0,0); break
      case '7days': start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000); start.setHours(0,0,0,0); break
      case '30days': start = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000); start.setHours(0,0,0,0); break
      default: start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000); start.setHours(0,0,0,0)
    }
    return { start: start.toISOString(), end: end.toISOString(), startDate: start, endDate: end }
  }, [])

  const fetchAnalytics = useCallback(async (signal = null) => {
    const filterKey = currentFilterRef.current

    if (isFetchingRef.current && !signal) return

    if (!initialized || !isAuthenticated || !restaurantId) {
      setLoading(false)
      setMetrics(null)
      return
    }

    const dateRange = getDateRange(filterKey)
    if (!dateRange || !dateRange.start || !dateRange.end) {
      const now = new Date()
      dateRange.start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).toISOString()
      dateRange.end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString()
      dateRange.startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
      dateRange.endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    }

    const { start, end, startDate, endDate } = dateRange

    isFetchingRef.current = true

    if (!signal) {
      setLoading(true)
      setError(null)
    }

    const requestKey = `analytics-${restaurantId}-${filterKey}`

    try {
      const fetchFn = async () => {
        const ordersPromise = supabase
          .from('live_orders')
          .select('id, restaurant_id, total_price, status, items, created_at, table_id')
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

      const hourlyFilter = isHourlyFilter(filterKey)

      let timePoints, revMap, ordMap, getTimeKey, formatLabel

      if (hourlyFilter) {
        timePoints = getHoursInRange(startDate, endDate)
        revMap = {}
        ordMap = {}
        timePoints.forEach(h => {
          const hourKey = h.getHours().toString()
          revMap[hourKey] = 0
          ordMap[hourKey] = 0
        })
        getTimeKey = (date) => new Date(date).getHours().toString()
        formatLabel = (h) => `${h.getHours().toString().padStart(2, '0')}:00`
      } else {
        timePoints = getDaysInRange(startDate, endDate)
        revMap = {}
        ordMap = {}
        timePoints.forEach(day => {
          const dayKey = getLocalDateString(day)
          revMap[dayKey] = 0
          ordMap[dayKey] = 0
        })
        getTimeKey = (date) => getLocalDateString(date)
        formatLabel = (d) => d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
      }

      list.forEach(o => {
        if (!o?.created_at) return
        if (o.status === 'rejected') return

        const timeKey = getTimeKey(o.created_at)
        revMap[timeKey] = (revMap[timeKey] || 0) + (Number(o.total_price) || 0)
        ordMap[timeKey] = (ordMap[timeKey] || 0) + 1
      })

      if (!mountedRef.current) return

      const completed = list.filter(o => o.status === 'accepted' || o.status === 'confirmed' || o.status === 'completed')
      const pending = list.filter(o => o.status === 'pending')

      const items = {}

      list.forEach(o => {
        if (o.status === 'rejected') return

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

      const leastOrderedItems = Object.entries(items)
        .sort((a, b) => a[1] - b[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }))

      const hourCounts = {}
      list.forEach(o => {
        if (!o?.created_at) return
        const hour = new Date(o.created_at).getHours()
        hourCounts[hour] = (hourCounts[hour] || 0) + 1
      })

      const peakHourData = Array.from({length: 24}, (_, i) => ({
        hour: `${i.toString().padStart(2, '0')}:00`,
        orders: hourCounts[i] || 0
      }))

      const peakHourEntry = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]
      const peakOrderTime = peakHourEntry
        ? `${peakHourEntry[0].padStart(2, '0')}:00 - ${(parseInt(peakHourEntry[0]) + 1).toString().padStart(2, '0')}:00`
        : '--:--'

      const mostOrderedItem = topItems.length > 0 ? topItems[0].name : '—'

      const activeTableIds = new Set(list.filter(o => o.table_id).map(o => o.table_id))

      const tableCountMap = {}
      list.forEach(o => {
        if (!o.table_id) return
        tableCountMap[o.table_id] = (tableCountMap[o.table_id] || 0) + 1
      })
      const topTables = Object.entries(tableCountMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id, count]) => ({ id: id.slice(0, 8), count }))

      const chartData = timePoints.map(point => {
        const timeKey = hourlyFilter ? point.getHours().toString() : getLocalDateString(point)
        return {
          date: timeKey,
          label: formatLabel(point),
          revenue: revMap[timeKey] || 0,
          orders: ordMap[timeKey] || 0
        }
      })

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
        peakHourData,
        peakOrderTime,
        mostOrderedItem,
        activeTables: activeTableIds.size,
        leastOrderedItems,
        topTables
      })
    } catch (err) {
      console.error('Analytics fetch failed:', err)
      if (!mountedRef.current) return
      setError(err.name === 'AbortError' ? 'Request cancelled' : err.message)
      setMetrics(null)
    } finally {
      if (mountedRef.current) {
        isFetchingRef.current = false
        setLoading(false)
        initialFetchDoneRef.current = true
      }
    }
  }, [restaurantId, getDateRange])

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

  const tabs = [
    { id: 'today', label: 'Today' },
    { id: 'lastday', label: 'Last Day' },
    { id: '7days', label: 'Last 7 Days' },
    { id: '30days', label: 'Last 30 Days' }
  ]

  const filterLabel = tabs.find(t => t.id === filter)?.label || 'Overview'

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null
    return (
      <div className="chart-tooltip">
        <div className="chart-tooltip-label">{label}</div>
        {payload.map((p, i) => (
          <div key={i} className="chart-tooltip-row">
            <span className="chart-tooltip-dot" style={{ background: p.color }} />
            <span>{p.name}: {p.name === 'Revenue' ? formatCurrency(p.value) : p.value}</span>
          </div>
        ))}
      </div>
    )
  }

  if (!initialized || !isAuthenticated) {
    return (
      <div className="analytics-dashboard">
        <div className="skeleton-container">
          <div className="skeleton-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
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
          <h1>Analytics</h1>
          <p>Performance overview for {filterLabel.toLowerCase()}</p>
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
            <div className="skeleton skeleton-card"></div>
            <div className="skeleton skeleton-card"></div>
          </div>
          <div className="skeleton-grid" style={{ marginTop: '24px' }}>
            <div className="skeleton skeleton-chart"></div>
            <div className="skeleton skeleton-chart"></div>
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
              <div className="kpi-icon-wrap orders"><IconPackage size={20} /></div>
              <div className="kpi-info">
                <span className="kpi-label">Total Orders</span>
                <span className="kpi-value">{metrics.ordersTotal}</span>
                <span className="kpi-sub">{metrics.completedOrders} completed</span>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-icon-wrap revenue"><IconTrendingUp size={20} /></div>
              <div className="kpi-info">
                <span className="kpi-label">Total Revenue</span>
                <span className="kpi-value">{formatCurrency(metrics.revenueTotal)}</span>
                <span className="kpi-sub">{metrics.completedOrders} paid orders</span>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-icon-wrap avg"><IconBarChart size={20} /></div>
              <div className="kpi-info">
                <span className="kpi-label">Avg Order Value</span>
                <span className="kpi-value">{formatCurrency(metrics.avgOrder)}</span>
                <span className="kpi-sub">per completed order</span>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-icon-wrap tables"><IconTable size={20} /></div>
              <div className="kpi-info">
                <span className="kpi-label">Active Tables</span>
                <span className="kpi-value">{metrics.activeTables}</span>
                <span className="kpi-sub">tables with orders</span>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-icon-wrap time"><IconClock size={20} /></div>
              <div className="kpi-info">
                <span className="kpi-label">Peak Order Time</span>
                <span className="kpi-value kpi-value-sm">{metrics.peakOrderTime}</span>
                <span className="kpi-sub">busiest hour</span>
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-icon-wrap items"><IconShoppingBag size={20} /></div>
              <div className="kpi-info">
                <span className="kpi-label">Most Ordered Item</span>
                <span className="kpi-value kpi-value-sm kpi-value-text">{metrics.mostOrderedItem}</span>
                <span className="kpi-sub">{metrics.itemsSold} total items sold</span>
              </div>
            </div>
          </div>

          <div className="charts-grid">
            <div className="chart-card">
              <div className="chart-header">
                <h3>Revenue Trend</h3>
                <p>Revenue over time</p>
              </div>
              <div className="chart-body">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={metrics.chartData}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--green)" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="var(--green)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="label" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} dy={8} />
                    <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} dx={-8} tickFormatter={(v) => `\u20B9${v}`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="revenue" stroke="var(--green)" strokeWidth={2.5} fill="url(#revGrad)" name="Revenue" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="chart-card">
              <div className="chart-header">
                <h3>Orders Trend</h3>
                <p>Orders over time</p>
              </div>
              <div className="chart-body">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={metrics.chartData}>
                    <defs>
                      <linearGradient id="ordGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--blue)" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="var(--blue)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="label" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} dy={8} />
                    <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} dx={-8} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="orders" stroke="var(--blue)" strokeWidth={2.5} fill="url(#ordGrad)" name="Orders" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="chart-card">
              <div className="chart-header">
                <h3>Peak Hours</h3>
                <p>Orders by hour of day</p>
              </div>
              <div className="chart-body">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metrics.peakHourData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="hour" stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} dy={8} interval={2} />
                    <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} dx={-8} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="orders" fill="var(--orange)" radius={[4, 4, 0, 0]} name="Orders" maxBarSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="chart-card">
              <div className="chart-header">
                <h3>Top Items</h3>
                <p>Most ordered items</p>
              </div>
              <div className="chart-body">
                {metrics.topItems.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={metrics.topItems} layout="vertical" margin={{ left: 0, right: 16, top: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                      <XAxis type="number" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="name" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} width={90} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="count" fill="var(--primary)" radius={[0, 4, 4, 0]} name="Sold" maxBarSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="chart-empty">No item data available</div>
                )}
              </div>
            </div>
          </div>

          <div className="insights-grid">
            <div className="chart-card">
              <div className="chart-header">
                <h3>Top Selling Items</h3>
                <p>Most popular items by quantity</p>
              </div>
              {metrics.topItems.length > 0 ? (
                <div className="top-items-list">
                  {metrics.topItems.map((item, i) => (
                    <div key={item.name} className="top-item-row">
                      <span className={`top-item-rank rank-${i + 1}`}>#{i + 1}</span>
                      <div className="top-item-details">
                        <div className="top-item-name-row">
                          <span className="top-item-name">{item.name}</span>
                          <span className="top-item-count">{item.count} sold</span>
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
                <div className="chart-empty">No items sold yet</div>
              )}
            </div>

            <div className="chart-card">
              <div className="chart-header">
                <h3>Restaurant Insights</h3>
                <p>Key operational metrics</p>
              </div>
              <div className="insights-content">
                <div className="insight-item">
                  <div className="insight-item-header">
                    <IconClock size={16} />
                    <span>Busy Hours</span>
                  </div>
                  <div className="insight-item-value">{metrics.peakOrderTime}</div>
                  <div className="insight-item-sub">Peak order time slot</div>
                </div>

                <div className="insight-item">
                  <div className="insight-item-header">
                    <IconShoppingBag size={16} />
                    <span>Least Ordered Items</span>
                  </div>
                  {metrics.leastOrderedItems.length > 0 ? (
                    <div className="insight-item-list">
                      {metrics.leastOrderedItems.slice(0, 3).map((item, i) => (
                        <span key={item.name} className="insight-tag">{item.name} ({item.count})</span>
                      ))}
                    </div>
                  ) : (
                    <div className="insight-item-value">—</div>
                  )}
                </div>

                <div className="insight-item">
                  <div className="insight-item-header">
                    <IconTable size={16} />
                    <span>Table Usage</span>
                  </div>
                  {metrics.topTables.length > 0 ? (
                    <div className="insight-item-list">
                      {metrics.topTables.map((t, i) => (
                        <span key={t.id} className="insight-tag">Table #{i + 1} ({t.count} orders)</span>
                      ))}
                    </div>
                  ) : (
                    <div className="insight-item-value">No table data</div>
                  )}
                </div>

                <div className="insight-item">
                  <div className="insight-item-header">
                    <IconBarChart size={16} />
                    <span>Order Trends</span>
                  </div>
                  <div className="insight-metrics">
                    <div className="insight-metric">
                      <span className="insight-metric-label">Items Sold</span>
                      <span className="insight-metric-value">{metrics.itemsSold}</span>
                    </div>
                    <div className="insight-metric">
                      <span className="insight-metric-label">Pending</span>
                      <span className="insight-metric-value">{metrics.pendingOrders}</span>
                    </div>
                    <div className="insight-metric">
                      <span className="insight-metric-label">Completed</span>
                      <span className="insight-metric-value">{metrics.completedOrders}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
