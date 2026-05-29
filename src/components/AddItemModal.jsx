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
  const [nameError, setNameError] = useState('')
  const [descError, setDescError] = useState('')
  const [priceError, setPriceError] = useState('')

  const handleChange = (field, value) => {
    if (field === 'name') {
      const filtered = value.replace(/[^a-zA-Z0-9]/g, '')
      const truncated = filtered.slice(0, 15)
      let error = ''
      if (filtered !== value) {
        error = 'Only letters and numbers allowed'
      } else if (filtered.length > 15) {
        error = 'Maximum 15 characters'
      }
      setNameError(error)
      setFormData(prev => ({ ...prev, name: truncated }))
      return
    }
    if (field === 'description') {
      const filtered = value.replace(/[^a-zA-Z0-9]/g, '')
      const truncated = filtered.slice(0, 35)
      let error = ''
      if (filtered !== value) {
        error = 'Only letters and numbers allowed'
      } else if (truncated.length >= 35) {
        error = 'Maximum 35 characters'
      }
      setDescError(error)
      setFormData(prev => ({ ...prev, description: truncated }))
      return
    }
    if (field === 'price') {
      const filtered = value.replace(/\D/g, '')
      const truncated = filtered.slice(0, 4)
      let error = ''
      if (value !== '' && filtered !== value) {
        error = 'Only digits allowed'
      } else if (truncated.length > 4) {
        error = 'Maximum 4 digits'
      }
      setPriceError(error)
      setFormData(prev => ({ ...prev, price: truncated }))
      return
    }
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.name || !formData.price) {
      return
    }
    if (!/^[a-zA-Z0-9]{1,15}$/.test(formData.name)) {
      setNameError('Name must be 1-15 alphanumeric characters')
      return
    }
    if (formData.description && !/^[a-zA-Z0-9]{1,35}$/.test(formData.description)) {
      setDescError('Description must be 1-35 alphanumeric characters')
      return
    }
    if (!/^\d{1,4}$/.test(formData.price)) {
      setPriceError('Price must be 1-4 digits')
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
            {nameError && <span className="form-error">{nameError}</span>}
          </div>
          
          <div className="form-group">
            <label>Description</label>
            <textarea
              value={formData.description}
              onChange={e => handleChange('description', e.target.value)}
              placeholder="Brief description..."
              rows="2"
            />
            {descError && <span className="form-error">{descError}</span>}
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
              {priceError && <span className="form-error">{priceError}</span>}
            </div>
            
            <div className="form-group">
              <label>Type</label>
              <button
                type="button"
                className={`type-btn ${formData.is_veg ? 'veg' : 'nonveg'}`}
                onClick={() => handleChange('is_veg', !formData.is_veg)}
              >
                {formData.is_veg ? 'Veg' : 'Non-Veg'}
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
            <button type="submit" className="save-btn" disabled={saving || !formData.name || !formData.price || !!nameError || !!descError || !!priceError}>
              {saving ? 'Adding...' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
