import { useState } from 'react'

export default function AddItemModal({ onSave, onClose, categories = [] }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    image_url: '',
    category_id: '',
    is_veg: true,
    is_available: true
  })
  const [saving, setSaving] = useState(false)

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.name || !formData.price) {
      return
    }
    setSaving(true)
    await onSave({
      ...formData,
      price: Number(formData.price),
      category_id: formData.category_id || null
    })
    setSaving(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="add-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Add New Item</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={e => handleChange('name', e.target.value)}
              placeholder="e.g. Paneer Tikka"
              autoFocus
            />
          </div>
          
          <div className="form-group">
            <label>Description</label>
            <textarea
              value={formData.description}
              onChange={e => handleChange('description', e.target.value)}
              placeholder="Brief description..."
              rows="2"
            />
          </div>

          <div className="form-group">
            <label>Image URL</label>
            <input
              type="url"
              value={formData.image_url}
              onChange={e => handleChange('image_url', e.target.value)}
              placeholder="https://example.com/image.jpg"
            />
          </div>

          {categories.length > 0 && (
            <div className="form-group">
              <label>Category</label>
              <select
                value={formData.category_id}
                onChange={e => handleChange('category_id', e.target.value)}
              >
                <option value="">No Category</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
          )}
          
          <div className="form-row">
            <div className="form-group">
              <label>Price (₹) *</label>
              <input
                type="number"
                value={formData.price}
                onChange={e => handleChange('price', e.target.value)}
                placeholder="0"
                min="0"
              />
            </div>
            
            <div className="form-group">
              <label>Type</label>
              <button
                type="button"
                className={`type-btn ${formData.is_veg ? 'veg' : 'nonveg'}`}
                onClick={() => handleChange('is_veg', !formData.is_veg)}
              >
                {formData.is_veg ? '🟢 Veg' : '🔴 Non-Veg'}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label>Status</label>
            <button
              type="button"
              className={`type-btn ${formData.is_available ? 'available' : 'unavailable'}`}
              onClick={() => handleChange('is_available', !formData.is_available)}
            >
              {formData.is_available ? '✓ Available' : '✗ Out of Stock'}
            </button>
          </div>
          
          <div className="modal-actions">
            <button type="button" className="cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="save-btn" disabled={saving || !formData.name || !formData.price}>
              {saving ? 'Adding...' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
