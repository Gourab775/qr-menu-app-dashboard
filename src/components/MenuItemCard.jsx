import { useState } from 'react'
import ConfirmModal from './ConfirmModal'

const VegIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
    <rect x="1.5" y="1.5" width="13" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.5"/>
    <circle cx="8" cy="8" r="3.5" fill="currentColor"/>
  </svg>
)

const NonVegIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
    <rect x="1.5" y="1.5" width="13" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M8 4.5L11.5 10.5H4.5L8 4.5Z" fill="currentColor"/>
  </svg>
)

export default function MenuItemCard({ item, onSave, onDelete, categories = [] }) {
  const [editing, setEditing] = useState(false)
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
  const [nameError, setNameError] = useState('')
  const [descError, setDescError] = useState('')
  const [priceError, setPriceError] = useState('')
  const [imageError, setImageError] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [disabling, setDisabling] = useState(false)

  const categoryName = categories.find(c => c.id === item.category_id)?.name || ''

  const getInitials = (name) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  const handleSave = async () => {
    const name = formData.name.trim()
    if (!name || !/^[a-zA-Z0-9]+(?: [a-zA-Z0-9]+)*$/.test(name) || name.length > 16) {
      setNameError('Name must be 1-16 characters (letters, numbers, single spaces)')
      return
    }
    const desc = (formData.description || '').replace(/\s+/g, ' ').trim()
    if (desc && (desc.length > 36 || !/^[a-zA-Z0-9 .,!?;:'"\-()&\/@#]+$/.test(desc))) {
      setDescError('Only letters, numbers, spaces, and punctuation allowed (max 36)')
      return
    }
    setSaving(true)
    await onSave(item.id, { ...formData, name, description: desc })
    setSaving(false)
    setEditing(false)
  }

  const handleDelete = async () => {
    setDeleting(true)
    await onDelete(item.id)
    setDeleting(false)
    setShowDeleteModal(false)
  }

  const handleCancel = () => {
    setFormData({
      name: item.name,
      description: item.description || '',
      price: item.price,
      is_veg: item.is_veg,
      is_available: item.is_available,
      image_url: item.image_url || '',
      category_id: item.category_id || ''
    })
    setNameError('')
    setDescError('')
    setPriceError('')
    setEditing(false)
  }

  const handleToggleAvailability = async () => {
    setDisabling(true)
    await onSave(item.id, { is_available: !item.is_available })
    setDisabling(false)
  }

  if (!editing) {
    return (
      <>
        <div className={`menu-item-card ${!item.is_available ? 'unavailable' : ''}`}>
          <div className="mic-image">
            {item.image_url && !imageError ? (
              <img src={item.image_url} alt={item.name} onError={() => setImageError(true)} />
            ) : (
              <div className={`mic-initials ${item.is_veg ? 'veg' : 'nonveg'}`}>
                {getInitials(item.name)}
              </div>
            )}
            <span className={`mic-type-badge ${item.is_veg ? 'veg' : 'nonveg'}`}>
              {item.is_veg ? <VegIcon /> : <NonVegIcon />}
            </span>
          </div>
          <div className="mic-body">
            <div className="mic-name">{item.name}</div>
            {categoryName && <div className="mic-category">{categoryName}</div>}
            <div className="mic-price">₹{item.price}</div>
            <span className={`mic-status ${item.is_available ? 'available' : 'unavailable'}`}>
              {item.is_available ? 'Available' : 'Unavailable'}
            </span>
          </div>
          <div className="mic-actions">
            <button className="mic-edit-btn" title="Edit item" onClick={() => setEditing(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
            <button className="mic-delete-btn" title="Delete item" onClick={() => setShowDeleteModal(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
            <button
              className="mic-disable-btn"
              onClick={handleToggleAvailability}
              disabled={disabling}
              title={item.is_available ? 'Disable item' : 'Enable item'}
            >
              {disabling ? '...' : (item.is_available ? 'Disable' : 'Enable')}
            </button>
          </div>
        </div>
        <ConfirmModal
          isOpen={showDeleteModal}
          title="Delete Item?"
          message={`Are you sure you want to delete "${item.name}"?`}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteModal(false)}
          loading={deleting}
        />
      </>
    )
  }

  return (
    <div className="menu-item-card editing">
      <div className="mic-edit-form">
        <div className="mief-row">
          <label>Image URL</label>
          <input type="url" value={formData.image_url} onChange={e => setFormData(p => ({ ...p, image_url: e.target.value }))} placeholder="https://..." />
        </div>
        <div className="mief-row">
          <label>Name</label>
          <input type="text" value={formData.name} onChange={e => {
            const value = e.target.value
            let cleaned = value.replace(/[^a-zA-Z0-9 ]/g, '')
            let error = ''
            if (cleaned !== value) {
              error = 'Only letters, numbers, and spaces allowed'
            }
            cleaned = cleaned.replace(/\s{2,}/g, ' ').replace(/^\s+/, '')
            const truncated = cleaned.slice(0, 16)
            if (truncated.length >= 16) {
              error = 'Maximum 16 characters'
            }
            setNameError(error)
            setFormData(p => ({ ...p, name: truncated }))
          }} />
          {nameError && <span className="form-error">{nameError}</span>}
        </div>
        <div className="mief-row">
          <label>Description</label>
          <textarea
            value={formData.description}
            onChange={e => {
              const value = e.target.value
              let cleaned = value.replace(/[^a-zA-Z0-9 .,!?;:'"\-()&\/@#\s]/g, '')
              let error = ''
              if (cleaned !== value) {
                error = 'Only letters, numbers, spaces, and punctuation allowed'
              }
              cleaned = cleaned.replace(/\s+/g, ' ').replace(/^\s+/, '')
              const truncated = cleaned.slice(0, 36)
              if (truncated.length >= 36) {
                error = 'Maximum 36 characters'
              }
              setDescError(error)
              setFormData(p => ({ ...p, description: truncated }))
            }}
            placeholder="Brief description..."
            rows="2"
          />
          {descError && <span className="form-error">{descError}</span>}
        </div>
        <div className="mief-row">
          <label>Category</label>
          <select value={formData.category_id || ''} onChange={e => setFormData(p => ({ ...p, category_id: e.target.value || null }))}>
            <option value="">No Category</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="mief-row">
          <label>Price (₹)</label>
          <input type="number" value={formData.price} onChange={e => {
            const raw = e.target.value
            const strVal = String(raw)
            const digits = strVal.replace(/\D/g, '')
            const truncated = digits.slice(0, 4)
            let error = ''
            if (strVal !== '' && digits !== strVal) {
              error = 'Only digits allowed'
            } else if (truncated.length > 4) {
              error = 'Maximum 4 digits'
            }
            setPriceError(error)
            setFormData(p => ({ ...p, price: truncated === '' ? '' : Number(truncated) }))
          }} min="0" />
          {priceError && <span className="form-error">{priceError}</span>}
        </div>
        <div className="mief-row">
          <label>Type</label>
          <div className="mief-toggle">
            <button type="button" className={`mief-type-btn ${formData.is_veg ? 'active veg' : ''}`} onClick={() => setFormData(p => ({ ...p, is_veg: true }))}>Veg</button>
            <button type="button" className={`mief-type-btn ${!formData.is_veg ? 'active nonveg' : ''}`} onClick={() => setFormData(p => ({ ...p, is_veg: false }))}>Non-Veg</button>
          </div>
        </div>
        <div className="mief-row">
          <label>Status</label>
          <button type="button" className={`mief-status-btn ${formData.is_available ? 'available' : 'unavailable'}`} onClick={() => setFormData(p => ({ ...p, is_available: !p.is_available }))}>
            {formData.is_available ? 'Available' : 'Unavailable'}
          </button>
        </div>
        <div className="mief-actions">
          <button className="mief-cancel" onClick={handleCancel}>Cancel</button>
          <button className="mief-save" onClick={handleSave} disabled={saving || !formData.name || !!nameError || !!descError || !!priceError}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
