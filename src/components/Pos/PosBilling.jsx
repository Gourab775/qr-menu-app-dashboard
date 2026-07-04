import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { fetchWithTimeout } from '../../lib/apiUtils'
import { IconSearch, IconShoppingBag, IconX } from '../../components/Icons'
import PosCart from './PosCart'
import PosPaymentModal from './PosPaymentModal'

const API_TIMEOUT = 30000

function formatCurrency(v) {
  return '\u20B9' + (v || 0).toLocaleString('en-IN')
}

export default function PosBilling({ restaurantId }) {
  const [categories, setCategories] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [activeCategory, setActiveCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [cartItems, setCartItems] = useState([])
  const [showPayment, setShowPayment] = useState(false)
  const [heldBills, setHeldBills] = useState([])
  const [resumeBill, setResumeBill] = useState(null)

  const mountedRef = useRef(false)

  const HELD_BILLS_KEY = `pos_held_bills_${restaurantId}`

  useEffect(() => {
    mountedRef.current = true
    const loadData = async () => {
      setLoading(true)
      setError(null)
      try {
        const [catResult, menuResult] = await Promise.all([
          fetchWithTimeout(
            supabase.from('categories').select('id, name, sort_order').eq('restaurant_id', restaurantId).order('sort_order', { ascending: true }),
            API_TIMEOUT
          ),
          fetchWithTimeout(
            supabase.from('menu_items').select('id, name, price, is_veg, is_available, category_id').eq('restaurant_id', restaurantId).order('name', { ascending: true }),
            API_TIMEOUT
          )
        ])

        if (!mountedRef.current) return

        if (catResult.error) throw new Error(catResult.error.message)
        if (menuResult.error) throw new Error(menuResult.error.message)

        setCategories(catResult.data || [])
        setMenuItems(menuResult.data || [])
      } catch (err) {
        if (mountedRef.current) setError(err.message || 'Failed to load menu')
      } finally {
        if (mountedRef.current) setLoading(false)
      }
    }

    loadData()
    loadHeldBills()

    return () => { mountedRef.current = false }
  }, [restaurantId])

  const loadHeldBills = () => {
    try {
      const stored = localStorage.getItem(HELD_BILLS_KEY)
      if (stored) setHeldBills(JSON.parse(stored))
    } catch {}
  }

  const saveHeldBills = (bills) => {
    try {
      localStorage.setItem(HELD_BILLS_KEY, JSON.stringify(bills))
      setHeldBills(bills)
    } catch {}
  }

  const filteredItems = useMemo(() => {
    return menuItems.filter(item => {
      if (activeCategory !== 'all' && item.category_id !== activeCategory) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        if (!item.name.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [menuItems, activeCategory, searchQuery])

  const handleAddItem = (item) => {
    setCartItems(prev => {
      const existing = prev.find(i => i.menu_item_id === item.id)
      if (existing) {
        return prev.map(i =>
          i.menu_item_id === item.id ? { ...i, quantity: i.quantity + 1 } : i
        )
      }
      return [...prev, {
        menu_item_id: item.id,
        name: item.name,
        price: item.price,
        quantity: 1,
        notes: '',
        discount: 0,
      }]
    })
  }

  const handleUpdateQty = (itemId, delta) => {
    setCartItems(prev => {
      const updated = prev.map(i => {
        if (i.menu_item_id !== itemId) return i
        const newQty = i.quantity + delta
        if (newQty <= 0) return null
        return { ...i, quantity: newQty }
      }).filter(Boolean)
      return updated
    })
  }

  const handleRemoveItem = (itemId) => {
    setCartItems(prev => prev.filter(i => i.menu_item_id !== itemId))
  }

  const handleUpdateNotes = (itemId, notes) => {
    setCartItems(prev => prev.map(i =>
      i.menu_item_id === itemId ? { ...i, notes } : i
    ))
  }

  const handleUpdateItemDiscount = (itemId, discount) => {
    const val = Math.max(0, Math.min(100, Number(discount) || 0))
    setCartItems(prev => prev.map(i =>
      i.menu_item_id === itemId ? { ...i, discount: val } : i
    ))
  }

  const handleHoldBill = () => {
    if (cartItems.length === 0) return
    const held = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      items: [...cartItems],
      createdAt: new Date().toISOString(),
    }
    const updated = [...heldBills, held]
    saveHeldBills(updated)
    setCartItems([])
  }

  const handleResumeBill = (held) => {
    setCartItems(held.items)
    setResumeBill(null)
    const updated = heldBills.filter(b => b.id !== held.id)
    saveHeldBills(updated)
  }

  const handlePaymentComplete = async (paymentData) => {
    try {
      const lineItems = cartItems.map(i => ({
        menu_item_id: i.menu_item_id,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        notes: i.notes || '',
        item_discount: i.discount || 0,
        total: i.price * i.quantity * (1 - (i.discount || 0) / 100),
      }))

      const subtotal = lineItems.reduce((s, i) => s + i.price * i.quantity, 0)
      const itemDiscountTotal = subtotal - lineItems.reduce((s, i) => s + i.total, 0)
      const billDiscountAmount = paymentData.discountAmount || 0
      const taxableAmount = subtotal - itemDiscountTotal - billDiscountAmount
      const taxAmount = paymentData.taxAmount || 0
      const grandTotal = paymentData.grandTotal

      const orderData = {
        restaurant_id: restaurantId,
        items: [
          ...lineItems,
          {
            _pos_meta: true,
            subtotal,
            item_discount_total: itemDiscountTotal,
            discount_type: paymentData.discountType || 'flat',
            discount_value: paymentData.discountValue || 0,
            discount_amount: billDiscountAmount,
            tax_rate: paymentData.taxRate || 0,
            tax_amount: taxAmount,
            net_total: grandTotal,
            payment_method: paymentData.method,
            payment_amount: paymentData.amountTendered || grandTotal,
            change: paymentData.change || 0,
            customer_name: paymentData.customerName || 'Walk-in',
            bill_type: 'dine_in',
          }
        ],
        total_price: Math.round(grandTotal),
        status: 'completed',
        order_type: 'pos',
        note: `POS ${paymentData.method.toUpperCase()} ${formatCurrency(grandTotal)}`,
      }

      const { error: insertError } = await fetchWithTimeout(
        supabase.from('live_orders').insert(orderData).select('id').single(),
        API_TIMEOUT
      )

      if (insertError) throw insertError

      setCartItems([])
      setShowPayment(false)
    } catch (err) {
      console.error('[POS] Failed to save bill:', err)
      throw err
    }
  }

  if (loading) {
    return (
      <div className="pos-billing">
        <div className="pos-menu-panel">
          <div className="pos-loading">
            <div className="loading-spinner"></div>
            <p>Loading menu...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="pos-billing">
        <div className="pos-menu-panel">
          <div className="pos-empty">
            <p>Failed to load menu</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{error}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pos-billing">
      {/* Menu Panel */}
      <div className="pos-menu-panel">
        {resumeBill && (
          <div className="pos-held-bar">
            <span>Resume bill from {new Date(resumeBill.createdAt).toLocaleString('en-IN')}</span>
            <button onClick={() => handleResumeBill(resumeBill)}>Resume</button>
            <button onClick={() => setResumeBill(null)}>Dismiss</button>
          </div>
        )}

        {heldBills.length > 0 && !resumeBill && (
          <div className="pos-held-bar">
            <span>{heldBills.length} held bill{heldBills.length > 1 ? 's' : ''}</span>
            <button onClick={() => setResumeBill(heldBills[heldBills.length - 1])}>Resume Latest</button>
          </div>
        )}

        {/* Category tabs */}
        <div className="pos-category-bar">
          <button
            className={`pos-category-btn ${activeCategory === 'all' ? 'active' : ''}`}
            onClick={() => setActiveCategory('all')}
          >
            All
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              className={`pos-category-btn ${activeCategory === cat.id ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat.id)}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="pos-search-bar">
          <input
            type="text"
            className="pos-search-input"
            placeholder="Search menu items..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            autoFocus
          />
        </div>

        {/* Menu grid */}
        <div className="pos-menu-grid">
          {filteredItems.length === 0 ? (
            <div className="pos-menu-empty">
              <IconSearch size={32} />
              <span>No items found</span>
            </div>
          ) : (
            filteredItems.map(item => (
              <button
                key={item.id}
                className="pos-menu-item"
                onClick={() => handleAddItem(item)}
                disabled={!item.is_available}
              >
                <div className={`item-veg ${item.is_veg ? 'veg' : 'nonveg'}`} />
                <span className="item-name">{item.name}</span>
                <span className="item-price">{formatCurrency(item.price)}</span>
                {!item.is_available && <span className="item-unavailable">Unavailable</span>}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Cart Panel */}
      <PosCart
        items={cartItems}
        onUpdateQty={handleUpdateQty}
        onRemoveItem={handleRemoveItem}
        onUpdateNotes={handleUpdateNotes}
        onUpdateItemDiscount={handleUpdateItemDiscount}
        onHoldBill={handleHoldBill}
        onPayment={() => setShowPayment(true)}
      />

      {/* Payment Modal */}
      {showPayment && (
        <PosPaymentModal
          cartItems={cartItems}
          onClose={() => setShowPayment(false)}
          onComplete={handlePaymentComplete}
        />
      )}
    </div>
  )
}
