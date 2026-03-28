import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import ConfirmModal from './ConfirmModal'

export default function MenuItemCard({ item, onSave, onDelete, categories = [] }) {
  const [formData, setFormData] = useState({
    name: item.name,
    description: item.description || '',
    price: item.price,
    is_veg: item.is_veg,
    is_available: item.is_available,
    image_url: item.image_url || '',
    category_id: item.category_id || ''
  })
  const [saving, setSaving] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const debouncedSave = useCallback(
    debounce(async (id, updates) => {
      setSaving(true)
      await onSave(id, updates)
      setSaving(false)
    }, 500),
    [onSave]
  )

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    debouncedSave(item.id, { ...formData, [field]: value })
  }

  const handleImageChange = async (value) => {
    setFormData(prev => ({ ...prev, image_url: value }))
    setImageError(false)
    if (value) {
      await supabase
        .from('menu_items')
        .update({ image_url: value })
        .eq('id', item.id)
    } else {
      await supabase
        .from('menu_items')
        .update({ image_url: null })
        .eq('id', item.id)
    }
    onSave(item.id, { ...formData, image_url: value })
  }

  const handleDelete = async () => {
    setDeleting(true)
    await onDelete(item.id)
    setDeleting(false)
    setShowDeleteModal(false)
  }

  const getInitials = (name) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  const handleImageLoadError = () => {
    setImageError(true)
  }

  return (
    <>
      <div className={`menu-card-glass ${!formData.is_available ? 'unavailable' : ''}`}>
        <div className="card-inner">
          <div className="card-left">
            <div className="image-container">
              {formData.image_url && !imageError ? (
                <img 
                  src={formData.image_url} 
                  alt={formData.name} 
                  className="item-image"
                  onError={handleImageLoadError}
                />
              ) : (
                <div className={`item-initials ${formData.is_veg ? 'veg-bg' : 'nonveg-bg'}`}>
                  {getInitials(formData.name)}
                </div>
              )}
              <span className={`veg-badge ${formData.is_veg ? 'veg' : 'nonveg'}`}>
                {formData.is_veg ? '🟢' : '🔴'}
              </span>
            </div>
            
            <input
              type="url"
              className="image-url-input"
              value={formData.image_url}
              onChange={(e) => handleImageChange(e.target.value)}
              placeholder="Paste image URL..."
            />
          </div>
          
          <div className="card-center">
            <input
              type="text"
              className="name-input premium-input"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="Item name"
            />
            
            <textarea
              className="desc-input premium-input"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Add a delicious description..."
              rows="2"
            />

            {categories.length > 0 && (
              <select
                value={formData.category_id || ''}
                onChange={(e) => handleChange('category_id', e.target.value || null)}
              >
                <option value="">No Category</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            )}
            
            <div className="price-row">
              <span className="rupee-icon">₹</span>
              <input
                type="number"
                className="price-input premium-input"
                value={formData.price}
                onChange={(e) => handleChange('price', Number(e.target.value))}
                min="0"
                step="1"
              />
            </div>
          </div>
          
          <div className="card-right">
            <div className="toggle-section">
              <span className="toggle-label">Type</span>
              <div className="veg-toggle">
                <button
                  className={`veg-btn ${formData.is_veg ? 'active' : ''}`}
                  onClick={() => handleChange('is_veg', true)}
                >
                  <span className="veg-dot-small">🟢</span>
                  Veg
                </button>
                <button
                  className={`nonveg-btn ${!formData.is_veg ? 'active' : ''}`}
                  onClick={() => handleChange('is_veg', false)}
                >
                  <span className="veg-dot-small">🔴</span>
                  Non-Veg
                </button>
              </div>
            </div>
            
            <div className="toggle-section">
              <span className="toggle-label">Status</span>
              <button
                className={`status-toggle ${formData.is_available ? 'available' : 'out-of-stock'}`}
                onClick={() => handleChange('is_available', !formData.is_available)}
              >
                {formData.is_available ? (
                  <>
                    <span className="status-icon">✓</span>
                    Available
                  </>
                ) : (
                  <>
                    <span className="status-icon">✗</span>
                    Out of Stock
                  </>
                )}
              </button>
            </div>

            <div className="save-indicator">
              {saving && <span className="saving-text">Saving...</span>}
              {!saving && formData.name !== item.name && (
                <span className="saved-text">✓ Saved</span>
              )}
            </div>

            <button 
              className="remove-btn"
              onClick={() => setShowDeleteModal(true)}
            >
              🗑️ Remove
            </button>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={showDeleteModal}
        title="Delete Item?"
        message={`Are you sure you want to delete "${formData.name}"? This action cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteModal(false)}
        loading={deleting}
      />
    </>
  )
}

function debounce(func, wait) {
  let timeout
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}
