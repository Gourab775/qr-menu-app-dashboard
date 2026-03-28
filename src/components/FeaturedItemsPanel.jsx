import { useState, useEffect } from 'react'
import { supabase, RESTAURANT_ID } from '../lib/supabase'

const generateSlug = (text) => {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, '-')
}

export default function FeaturedItemsPanel() {
  const [featuredItems, setFeaturedItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const loadData = async () => {
    if (!RESTAURANT_ID) {
      setError('Restaurant ID not available')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { data: featuredData, error: featuredError } = await supabase
        .from('featured_items')
        .select('*')
        .eq('restaurant_id', RESTAURANT_ID)
        .eq('is_active', true)
        .order('display_order', { ascending: true })

      if (featuredError) {
        console.error('Featured items error:', featuredError.message)
        throw featuredError
      }

      const itemsWithState = (featuredData || []).map(item => ({
        ...item,
        target: item.redirect_url ? item.redirect_url.replace('#', '') : ''
      }))

      setFeaturedItems(itemsWithState)
    } catch (err) {
      console.error('Load data error:', err)
      setError(err.message)
      showToast('Failed to load data', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleAddItem = async () => {
    try {
      const maxOrder = featuredItems.reduce((max, item) => 
        Math.max(max, item.display_order || 0), 0)

      const { data, error } = await supabase
        .from('featured_items')
        .insert({
          restaurant_id: RESTAURANT_ID,
          image_url: '',
          redirect_url: '',
          display_order: maxOrder + 1,
          is_active: true
        })
        .select()
        .single()

      if (error) throw error

      setFeaturedItems(prev => [...prev, { ...data, target: '' }])
      showToast('New featured item added')
    } catch (err) {
      console.error('Add item error:', err)
      showToast('Failed to add item', 'error')
    }
  }

  const handleImageUrlChange = (itemId, value) => {
    setFeaturedItems(prev =>
      prev.map(item =>
        item.id === itemId ? { ...item, image_url: value } : item
      )
    )
  }

  const handleTargetChange = (itemId, value) => {
    const slug = generateSlug(value)
    const redirect = value ? `#${slug}` : ''

    setFeaturedItems(prev =>
      prev.map(item =>
        item.id === itemId
          ? { ...item, target: value, redirect_url: redirect }
          : item
      )
    )
  }

  const handleOrderChange = (itemId, value) => {
    const order = parseInt(value) || 0
    setFeaturedItems(prev =>
      prev.map(item =>
        item.id === itemId ? { ...item, display_order: order } : item
      )
    )
  }

  const handleSave = async (item) => {
    if (!item.target) {
      showToast('Enter target first', 'error')
      return
    }

    try {
      const { error } = await supabase
        .from('featured_items')
        .update({
          image_url: item.image_url || '',
          redirect_url: item.redirect_url || '',
          display_order: item.display_order || 0
        })
        .eq('id', item.id)

      if (error) throw error

      showToast('Saved successfully')
    } catch (err) {
      console.error('Save error:', err)
      showToast('Failed to save', 'error')
    }
  }

  const handleDeleteItem = async (itemId) => {
    if (!confirm('Delete this featured item?')) return

    try {
      const { error } = await supabase
        .from('featured_items')
        .delete()
        .eq('id', itemId)

      if (error) throw error

      setFeaturedItems(prev => prev.filter(item => item.id !== itemId))
      showToast('Item deleted')
    } catch (err) {
      console.error('Delete error:', err)
      showToast('Failed to delete', 'error')
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  if (loading) {
    return (
      <div className="featured-panel">
        <div className="loading">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="featured-panel">
        <div className="panel-header-row">
          <div className="panel-header">
            <h2 className="panel-title">🎯 Featured Items Setup</h2>
            <p className="panel-subtitle">Set image URL and target for featured items</p>
          </div>
          <button className="add-btn" onClick={handleAddItem}>
            ➕ Add Item
          </button>
        </div>
        <div className="empty-state">
          <div className="empty-icon">⚠️</div>
          <h3>Error Loading Data</h3>
          <p>{error}</p>
          <button className="add-btn" onClick={loadData} style={{ marginTop: '16px' }}>
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="featured-panel">
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          <span className="toast-icon">{toast.type === 'success' ? '✓' : '✗'}</span>
          <span className="toast-message">{toast.message}</span>
        </div>
      )}

      <div className="panel-header-row">
        <div className="panel-header">
          <h2 className="panel-title">🎯 Featured Items Setup</h2>
          <p className="panel-subtitle">Set image URL and target for featured items</p>
        </div>
        <button className="add-btn" onClick={handleAddItem}>
          ➕ Add Item
        </button>
      </div>

      {featuredItems.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🎯</div>
          <h3>No Featured Items</h3>
          <p>Click "Add Item" to create your first featured item</p>
          <button className="add-btn" onClick={handleAddItem} style={{ marginTop: '16px' }}>
            Add your first item
          </button>
        </div>
      ) : (
        <div className="featured-list">
          {featuredItems.map((item) => (
            <FeaturedItemCard
              key={item.id}
              item={item}
              onImageUrlChange={handleImageUrlChange}
              onTargetChange={handleTargetChange}
              onOrderChange={handleOrderChange}
              onSave={handleSave}
              onDelete={handleDeleteItem}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FeaturedItemCard({ item, onImageUrlChange, onTargetChange, onOrderChange, onSave, onDelete }) {
  const canSave = item.target && item.image_url
  const redirectPreview = item.redirect_url || '#not-set'

  return (
    <div className="featured-card">
      <div className="featured-card-left">
        <div className="featured-image-section">
          {item.image_url ? (
            <img src={item.image_url} alt="Featured" className="featured-thumb" />
          ) : (
            <div className="featured-thumb-placeholder">🎯</div>
          )}
        </div>

        <div className="featured-info">
          <h3 className="featured-title">Featured #{item.display_order || 1}</h3>
          <span className="featured-position">Redirect: {redirectPreview}</span>
        </div>
      </div>

      <div className="featured-card-right">
        <div className="input-group">
          <label className="input-label">Image URL</label>
          <input
            type="text"
            className="url-input"
            placeholder="https://example.com/image.jpg"
            value={item.image_url || ''}
            onChange={(e) => onImageUrlChange(item.id, e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="input-label">Target (e.g. biryani, tandoor)</label>
          <input
            type="text"
            className="target-input"
            placeholder="Enter target name"
            value={item.target || ''}
            onChange={(e) => onTargetChange(item.id, e.target.value)}
          />
        </div>

        <div className="order-input-group">
          <label className="order-label">Order</label>
          <input
            type="number"
            className="order-input"
            value={item.display_order || 0}
            onChange={(e) => onOrderChange(item.id, e.target.value)}
            min="0"
          />
        </div>

        <div className="featured-actions">
          <button
            className={`save-redirect-btn ${!canSave ? 'disabled' : ''}`}
            onClick={() => onSave(item)}
            disabled={!canSave}
          >
            💾 Save
          </button>
          <button
            className="delete-item-btn"
            onClick={() => onDelete(item.id)}
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  )
}