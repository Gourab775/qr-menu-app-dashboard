import { useState, useEffect, useRef } from 'react'
import { supabase, RESTAURANT_ID } from './lib/supabase'
import MenuItemCard from './components/MenuItemCard'
import AddItemModal from './components/AddItemModal'
import Toast from './components/Toast'
import Login from './components/Login'
import Analytics from './components/Analytics'
import BillModal from './components/BillModal'
import OfflineBanner from './components/OfflineBanner'
import FeaturedItemsPanel from './components/FeaturedItemsPanel'
import CategoriesPage from './pages/CategoriesPage'
import { formatDateTime } from './utils/formatDateTime'
import './App.css'

const ORDER_CACHE_KEY = 'dashboard_orders'

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [orders, setOrders] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [menuLoading, setMenuLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('live_orders')
  const [showProfile, setShowProfile] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [orderSearch, setOrderSearch] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [toast, setToast] = useState(null)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const profileRef = useRef(null)
  const prevOrderCount = useRef(0)
  const audioRef = useRef(null)

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    audioRef.current = new Audio('/sounds/notification.mp3')
  }, [])

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
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const loadOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('live_orders')
        .select('id, restaurant_id, total_price, payment_mode, status, items, created_at, order_code')
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error
      
      localStorage.setItem(ORDER_CACHE_KEY, JSON.stringify(data || []))
      setOrders(data || [])
    } catch (err) {
      const cached = localStorage.getItem(ORDER_CACHE_KEY)
      if (cached) {
        setOrders(JSON.parse(cached))
        showToast('Showing cached data', 'error')
      }
    } finally {
      setLoading(false)
    }
  }

  const loadCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, image, sort_order')
        .eq('restaurant_id', RESTAURANT_ID)
        .order('sort_order', { ascending: true })

      if (!error) setCategories(data || [])
    } catch (err) {
    }
  }

  const loadMenuItems = async () => {
    setMenuLoading(true)
    
    try {
      const { data, error } = await supabase
        .from('menu_items')
        .select('id, name, price, description, is_veg, is_available, category_id, image_url')
        .eq('restaurant_id', RESTAURANT_ID)
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
    if (isLoggedIn) {
      loadOrders()
      loadCategories()
      loadMenuItems()
    }
  }, [isLoggedIn])

  useEffect(() => {
    if (!isLoggedIn) return

    const channel = supabase
      .channel('live-orders')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'live_orders' },
        (payload) => {
          if (orders.length > prevOrderCount.current || prevOrderCount.current === 0) {
            if (prevOrderCount.current > 0 && audioRef.current) {
              audioRef.current.play().catch(() => {})
            }
          }
          prevOrderCount.current = orders.length + 1
          setOrders(prev => [payload.new, ...prev])
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
      .subscribe()

    prevOrderCount.current = orders.length

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isLoggedIn, orders.length])

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
          restaurant_id: RESTAURANT_ID
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

  if (!isLoggedIn) {
    return <Login onLogin={() => setIsLoggedIn(true)} />
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
          <div className="loading">Loading...</div>
        </main>
      </div>
    )
  }

  return (
    <div className="app">
      {toast && <Toast message={toast.message} type={toast.type} />}
      <OfflineBanner />
      
      <header className="header">
        <button className="menu-btn" onClick={() => setSidebarOpen(true)}>☰</button>
        <h2 className="header-title">
          {activeTab === 'live_orders' && '📦 Live Orders'}
          {activeTab === 'menu_items' && '🍽️ Menu Items'}
          {activeTab === 'categories' && '📂 Categories'}
        </h2>
        <div className="profile-wrapper" ref={profileRef}>
          <div className="profile-icon" onClick={() => setShowProfile(!showProfile)}>👤</div>
          {showProfile && (
            <div className="profile-dropdown">
              <div className="profile-info">
                <p className="profile-name"><strong>Restaurant</strong></p>
                <p className="profile-id">ID: {RESTAURANT_ID.slice(0, 8)}...</p>
              </div>
              <div className="profile-divider"></div>
              <button className="profile-btn" onClick={() => {
                localStorage.removeItem('dashboard_auth')
                setIsLoggedIn(false)
              }}>Logout</button>
            </div>
          )}
        </div>
      </header>
      
      <main className="main-content">
        <div className="tab-bar">
          <button 
            className={`tab-btn ${activeTab === 'live_orders' ? 'active' : ''}`}
            onClick={() => setActiveTab('live_orders')}
          >
            📦 Orders ({orders.length})
          </button>
          <button 
            className={`tab-btn ${activeTab === 'menu_items' ? 'active' : ''}`}
            onClick={() => setActiveTab('menu_items')}
          >
            🍽️ Menu ({menuItems.length})
          </button>
          <button 
            className={`tab-btn ${activeTab === 'categories' ? 'active' : ''}`}
            onClick={() => setActiveTab('categories')}
          >
            📂 Categories ({categories.length})
          </button>
          <button 
            className={`tab-btn ${activeTab === 'featured' ? 'active' : ''}`}
            onClick={() => setActiveTab('featured')}
          >
            🎯 Featured
          </button>
        </div>

        {activeTab === 'live_orders' && (
          <div className="orders-section">
            <Analytics />
            
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
                  {filteredOrders.map(order => (
                    <div key={order.id} className="order-card">
                      <div className="order-header">
                        <span className="order-code">#{order.order_code || order.id.slice(0, 8).toUpperCase()}</span>
                        <div className="order-datetime">
                          {formatDateTime(order.created_at)}
                        </div>
                      </div>
                      
                      <div className="order-items">
                        {order.items?.map((item, i) => (
                          <div key={i} className="order-item">
                            <span>{item.is_veg ? '🟢' : '🔴'}</span>
                            <span className="item-name">{item.name}</span>
                            <span className="item-qty">× {item.quantity}</span>
                          </div>
                        ))}
                      </div>
                      
                      <div className="order-bottom">
                        <p className="order-price">₹{order.total_price}</p>
                        
                        <div className="order-actions">
                          <button className="bill-btn" onClick={() => setSelectedOrder(order)}>
                            🧾
                          </button>
                          <button className="decline-btn" onClick={() => handleDecline(order.id, order.order_code)}>Decline</button>
                          <button className="accept-btn" onClick={() => handleAccept(order.id)}>Accept</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'menu_items' && (
          <div className="menu-section">
            <div className="menu-controls">
              <div className="search-box">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  placeholder="Search items..."
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
                ➕ Add Item
              </button>
            </div>
            
            <button onClick={loadMenuItems} className="refresh-btn">
              🔄 Refresh
            </button>
            
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
                <div className="empty-icon">🍽️</div>
                <p>{searchQuery || filterType !== 'all' ? 'No items match your search' : 'No menu items yet'}</p>
                {menuItems.length === 0 && (
                  <p className="hint-text">Click "Add Item" to create your first menu item!</p>
                )}
                <button className="add-btn" onClick={() => setShowAddModal(true)} style={{marginTop: '16px'}}>
                  Add your first item
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
          </div>
        )}

        {activeTab === 'categories' && <CategoriesPage />}

        {activeTab === 'featured' && <FeaturedItemsPanel />}
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
          order={selectedOrder}
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
            className={`nav-item ${activeTab === 'live_orders' ? 'active' : ''}`}
            onClick={() => { setActiveTab('live_orders'); onClose(); }}
          >
            📦 Live Orders
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
        </nav>
      </aside>
    </>
  )
}

export default App
