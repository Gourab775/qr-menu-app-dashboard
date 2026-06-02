import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import CloudinaryUpload from './CloudinaryUpload'
import { getOptimizedUrl, extractPublicId, deleteFromCloudinary } from '../services/cloudinaryService'

const generateSlug = (text) => {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, '-')
}

export default function FeaturedItemsPanel({ restaurantId }) {
  const [featuredItems, setFeaturedItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')

  const currentRestId = restaurantId

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const loadData = async () => {
    if (!currentRestId) {
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
        .eq('restaurant_id', currentRestId)
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
          restaurant_id: currentRestId,
          image_url: '',
          redirect_url: '',
          display_order: maxOrder + 1,
          is_active: true
        })
        .select()
        .single()

      if (error) throw error

      const newItem = { ...data, target: '' }
      setFeaturedItems(prev => [...prev, newItem])
      setEditingId(newItem.id)
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

      setEditingId(null)
      showToast('Saved successfully')
    } catch (err) {
      const publicId = extractPublicId(item.image_url)
      if (publicId) deleteFromCloudinary(publicId)
      console.error('Save error:', err)
      showToast('Failed to save', 'error')
    }
  }

  const handleDeleteItem = async (itemId) => {
    if (!confirm('Remove this item from featured?')) return

    try {
      const { error } = await supabase
        .from('featured_items')
        .delete()
        .eq('id', itemId)

      if (error) throw error

      setFeaturedItems(prev => prev.filter(item => item.id !== itemId))
      if (editingId === itemId) setEditingId(null)
      showToast('Item removed from featured')
    } catch (err) {
      console.error('Delete error:', err)
      showToast('Failed to remove', 'error')
    }
  }

  useEffect(() => {
    if (currentRestId) loadData()
  }, [currentRestId])

  const filteredItems = featuredItems.filter(item => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      (item.target && item.target.toLowerCase().includes(q)) ||
      (item.redirect_url && item.redirect_url.toLowerCase().includes(q))
    )
  })

  if (loading) {
    return (
      <div className="featured-panel">
        <div className="featured-loading">Loading featured items...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="featured-panel">
        <div className="featured-header">
          <h2 className="featured-title">Featured Items</h2>
        </div>
        <div className="featured-empty">
          <p className="featured-empty-title">Error loading data</p>
          <p className="featured-empty-desc">{error}</p>
          <button className="featured-btn featured-btn-primary" onClick={loadData}>
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="featured-panel">
      {toast && (
        <div className={`featured-toast featured-toast-${toast.type}`}>
          {toast.message}
        </div>
      )}

      <div className="featured-header">
        <div className="featured-header-left">
          <h2 className="featured-title">Featured Items</h2>
          <span className="featured-count">{featuredItems.length}</span>
        </div>
        <div className="featured-header-right">
          <input
            type="text"
            className="featured-search"
            placeholder="Search items..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <button className="featured-btn featured-btn-primary" onClick={handleAddItem}>
            + Add Featured Item
          </button>
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="featured-empty">
          {searchQuery ? (
            <>
              <p className="featured-empty-title">No results found</p>
              <p className="featured-empty-desc">Try a different search term</p>
            </>
          ) : (
            <>
              <p className="featured-empty-title">No featured items found</p>
              <p className="featured-empty-desc">
                Add your first featured item to get started
              </p>
              <button className="featured-btn featured-btn-primary" onClick={handleAddItem}>
                + Add Featured Item
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="featured-grid">
          {filteredItems.map(item => (
            <FeaturedItemCard
              key={item.id}
              item={item}
              restaurantId={currentRestId}
              isEditing={editingId === item.id}
              onEdit={() => setEditingId(item.id)}
              onCancel={() => setEditingId(null)}
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

function FeaturedItemCard({
  item,
  restaurantId,
  isEditing,
  onEdit,
  onCancel,
  onImageUrlChange,
  onTargetChange,
  onOrderChange,
  onSave,
  onDelete
}) {
  const canSave = item.target && item.image_url

  if (isEditing) {
    return (
      <div className="featured-card">
        <div className="featured-card-img-wrap">
          {item.image_url ? (
            <img src={getOptimizedUrl(item.image_url)} alt="" className="featured-card-img" loading="lazy" />
          ) : (
            <div className="featured-card-img-placeholder">No Image</div>
          )}
        </div>
        <div className="featured-card-body">
          <div className="featured-field">
            <label className="featured-field-label">Image</label>
            <CloudinaryUpload
              restaurantId={restaurantId}
              subfolder="Featured images"
              type="image"
              value={item.image_url || ''}
              onChange={(url) => onImageUrlChange(item.id, url)}
            />
          </div>
          <div className="featured-field">
            <label className="featured-field-label">Item Name</label>
            <input
              type="text"
              className="featured-field-input"
              placeholder="e.g. biryani, tandoor"
              value={item.target || ''}
              onChange={e => onTargetChange(item.id, e.target.value)}
            />
          </div>
          <div className="featured-field featured-field-short">
            <label className="featured-field-label">Display Order</label>
            <input
              type="number"
              className="featured-field-input"
              value={item.display_order || 0}
              onChange={e => onOrderChange(item.id, e.target.value)}
              min="0"
            />
          </div>
          <div className="featured-card-actions">
            <button
              className="featured-btn featured-btn-save"
              onClick={() => onSave(item)}
              disabled={!canSave}
            >
              Save
            </button>
            <button className="featured-btn featured-btn-cancel" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="featured-card">
      <div className="featured-card-img-wrap">
        {item.image_url ? (
          <img src={getOptimizedUrl(item.image_url)} alt={item.target || 'Featured'} className="featured-card-img" loading="lazy" />
        ) : (
          <div className="featured-card-img-placeholder">No Image</div>
        )}
      </div>
      <div className="featured-card-body">
        <div className="featured-card-header">
          <h3 className="featured-card-name">{item.target || 'Unnamed Item'}</h3>
          <span className="featured-badge">Featured</span>
        </div>
        <div className="featured-card-info">
          <span>Order: {item.display_order || 0}</span>
          {item.redirect_url && <span>Links to: {item.redirect_url}</span>}
          <span className="featured-card-status">Active</span>
        </div>
        <div className="featured-card-actions">
          <button className="featured-btn featured-btn-edit" onClick={onEdit}>
            Edit
          </button>
          <button className="featured-btn featured-btn-remove" onClick={() => onDelete(item.id)}>
            Remove
          </button>
        </div>
      </div>
    </div>
  )
}
