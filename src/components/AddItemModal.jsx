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
  const [categoryError, setCategoryError] = useState('')

  const handleChange = (field, value) => {
    if (field === 'name') {
      let cleaned = value.replace(/[^a-zA-Z0-9 ]/g, '')
      let error = ''
      if (cleaned !== value) {
        error = 'Only letters, numbers, and spaces allowed'
      }
      cleaned = cleaned.replace(/\s{2,}/g, ' ').replace(/^\s+/, '')
      const truncated = cleaned.slice(0, 16)
      if (truncated.length > 16) {
        error = 'Maximum 16 characters'
      }
      setNameError(error)
      setFormData(prev => ({ ...prev, name: truncated }))
      return
    }
    if (field === 'description') {
      let cleaned = value.replace(/[^a-zA-Z0-9 .,!?;:'"\-()&\/@#\s]/g, '')
      let error = ''
      if (cleaned !== value) {
        error = 'Only letters, numbers, spaces, and punctuation allowed'
      }
      cleaned = cleaned.replace(/\s+/g, ' ').replace(/^\s+/, '')
      const truncated = cleaned.slice(0, 50)
      if (truncated.length > 50) {
        error = 'Maximum 50 characters'
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
    if (field === 'category_id') {
      setCategoryError('')
    }
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    let hasError = false

    const name = formData.name.trim()
    if (!name) {
      setNameError('Item name is required')
      hasError = true
    } else if (name.length > 16) {
      setNameError('Name must be at most 16 characters')
      hasError = true
    } else if (!/^[a-zA-Z0-9]+(?: [a-zA-Z0-9]+)*$/.test(name)) {
      setNameError('Only letters, numbers, and single spaces allowed')
      hasError = true
    }

    const desc = formData.description.replace(/\s+/g, ' ').trim()
    if (!desc) {
      setDescError('Description is required')
      hasError = true
    } else if (desc.length > 50) {
      setDescError('Description must be at most 50 characters')
      hasError = true
    } else if (!/^[a-zA-Z0-9 .,!?;:'"\-()&\/@#]+$/.test(desc)) {
      setDescError('Only letters, numbers, spaces, and punctuation allowed')
      hasError = true
    }

    if (!formData.category_id) {
      setCategoryError('Please select a category')
      hasError = true
    }

    if (!formData.price) {
      setPriceError('Price is required')
      hasError = true
    } else if (!/^\d{1,4}$/.test(formData.price)) {
      setPriceError('Price must be 1-4 digits')
      hasError = true
    }

    if (hasError) return

    setSaving(true)
    try {
      await onSave({
        ...formData,
        name,
        description: desc,
        price: Number(formData.price),
        category_id: formData.category_id
      })
    } catch {
      // submission failed, silently handled by parent
    }
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
            <label>Name {!formData.name && <><span className="required-star">*</span><span className="mandatory-text"> Mandatory</span></>}</label>
            <input
              type="text"
              value={formData.name}
              onChange={e => handleChange('name', e.target.value)}
              placeholder="e.g. Chicken Burger"
              autoFocus
            />
            <span className="form-helper">Max 16 characters</span>
            {nameError && <span className="form-error">{nameError}</span>}
          </div>
          
          <div className="form-group">
             <label>Description {!formData.description && <><span className="required-star">*</span><span className="mandatory-text"> Mandatory</span></>}</label>
            <textarea
              value={formData.description}
              onChange={e => handleChange('description', e.target.value)}
              placeholder="e.g. Crispy chicken with cheese"
              rows="2"
            />
            <span className="form-helper">Max 50 characters</span>
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
               <label>Category {!formData.category_id && <><span className="required-star">*</span><span className="mandatory-text"> Mandatory</span></>}</label>
              <select
                value={formData.category_id}
                onChange={e => handleChange('category_id', e.target.value)}
              >
                <option value="">Select category</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              {categoryError && <span className="form-error">{categoryError}</span>}
            </div>
          )}
          
          <div className="form-row">
            <div className="form-group">
              <label>Price (₹) {!formData.price && <><span className="required-star">*</span><span className="mandatory-text"> Mandatory</span></>}</label>
              <input
                type="number"
                value={formData.price}
                onChange={e => handleChange('price', e.target.value)}
                placeholder="e.g. 199"
                min="0"
              />
              <span className="form-helper">Numbers only (Max 4 digits)</span>
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
            <button type="submit" className="save-btn" disabled={saving || !formData.name || !formData.description || !formData.price || (categories.length > 0 && !formData.category_id) || !!nameError || !!descError || !!priceError || !!categoryError}>
              {saving ? 'Adding...' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
