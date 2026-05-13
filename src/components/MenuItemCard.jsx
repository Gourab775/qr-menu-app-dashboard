import { useState, useCallback, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import ConfirmModal from './ConfirmModal'

const VegIcon = ({ className }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1.5" y="1.5" width="13" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.5"/>
    <circle cx="8" cy="8" r="3.5" fill="currentColor"/>
  </svg>
);

const NonVegIcon = ({ className }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1.5" y="1.5" width="13" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M8 4.5L11.5 10.5H4.5L8 4.5Z" fill="currentColor"/>
  </svg>
);

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
  const debouncedSaveRef = useRef(null)

  useEffect(() => {
    debouncedSaveRef.current = debounce(async (id, updates) => {
      setSaving(true)
      await onSave(id, updates)
      setSaving(false)
    }, 500)

    return () => {
      if (debouncedSaveRef.current) {
        debouncedSaveRef.current.cancel?.()
      }
    }
  }, [onSave])

  const debouncedSave = useCallback((id, updates) => {
    debouncedSaveRef.current?.(id, updates)
  }, [])

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
              <div className={`veg-badge-container ${formData.is_veg ? 'veg' : 'nonveg'}`}>
                {formData.is_veg ? <VegIcon className="veg-badge-icon" /> : <NonVegIcon className="veg-badge-icon" />}
              </div>
            </div>
            
            <input
              type="url"
              className="image-url-input premium-input-small"
              value={formData.image_url}
              onChange={(e) => handleImageChange(e.target.value)}
              placeholder="Paste image URL..."
            />
          </div>
          
          <div className="card-center">
            <div className="card-center-header">
              <input
                type="text"
                className="name-input premium-input"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="Item name"
              />
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
            
            <textarea
              className="desc-input premium-input"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Add a delicious description..."
              rows="2"
            />

            {categories.length > 0 && (
              <select
                className="category-select premium-input"
                value={formData.category_id || ''}
                onChange={(e) => handleChange('category_id', e.target.value || null)}
              >
                <option value="">No Category</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            )}
          </div>
          
          <div className="card-right">
            <div className="toggle-section">
              <span className="toggle-label">Type</span>
              <div className="veg-toggle-group">
                <button
                  className={`type-btn-glass ${formData.is_veg ? 'active veg' : ''}`}
                  onClick={() => handleChange('is_veg', true)}
                >
                  <VegIcon className="btn-icon-svg" />
                  Veg
                </button>
                <button
                  className={`type-btn-glass ${!formData.is_veg ? 'active nonveg' : ''}`}
                  onClick={() => handleChange('is_veg', false)}
                >
                  <NonVegIcon className="btn-icon-svg" />
                  Non-Veg
                </button>
              </div>
            </div>
            
            <div className="toggle-section">
              <span className="toggle-label">Availability</span>
              <button
                className={`status-toggle-glass ${formData.is_available ? 'available' : 'out-of-stock'}`}
                onClick={() => handleChange('is_available', !formData.is_available)}
              >
                {formData.is_available ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="status-icon"><path d="M11.6667 3.5L5.25001 9.91667L2.33334 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Available
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="status-icon"><path d="M10.5 3.5L3.5 10.5M3.5 3.5L10.5 10.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Out of Stock
                  </>
                )}
              </button>
            </div>

            <div className="action-row">
              <div className="save-indicator">
                {saving ? (
                  <span className="saving-text">Saving...</span>
                ) : formData.name !== item.name ? (
                  <span className="saved-text">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Saved
                  </span>
                ) : null}
              </div>

              <button 
                className="remove-btn-icon"
                onClick={() => setShowDeleteModal(true)}
                title="Remove Item"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M2 4H14M5.33333 4V2.66667C5.33333 2.29853 5.63181 2 6 2H10C10.3682 2 10.6667 2.29853 10.6667 2.66667V4M6.66667 7.33333V11.3333M9.33333 7.33333V11.3333M3.33333 4L4 12.6667C4 13.403 4.59695 14 5.33333 14H10.6667C11.403 14 12 13.403 12 12.6667L12.6667 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
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
  const debounced = function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
  debounced.cancel = () => {
    clearTimeout(timeout)
    timeout = null
  }
  return debounced
}
