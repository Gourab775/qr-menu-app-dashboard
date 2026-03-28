import { useState, useEffect } from 'react'
import { supabase, RESTAURANT_ID } from '../lib/supabase'
import ConfirmModal from '../components/ConfirmModal'

export default function CategoriesPage() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [itemCounts, setItemCounts] = useState({})
  const [showToast, setShowToast] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const showToastMsg = (message, type = 'success') => {
    setShowToast({ message, type })
    setTimeout(() => setShowToast(null), 3000)
  }

  const loadCategories = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('restaurant_id', RESTAURANT_ID)
        .order('sort_order', { ascending: true })

      if (error) throw error
      setCategories(data || [])

      const counts = {}
      for (const cat of data || []) {
        const { count } = await supabase
          .from('menu_items')
          .select('*', { count: 'exact', head: true })
          .eq('category_id', cat.id)
        counts[cat.id] = count || 0
      }
      setItemCounts(counts)
    } catch (err) {
      showToastMsg('Failed to load categories', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCategories()
  }, [])

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return
    
    const maxSortOrder = categories.reduce((max, c) => Math.max(max, c.sort_order || 0), 0)
    
    try {
      const { error } = await supabase
        .from('categories')
        .insert({
          name: newCategoryName.trim(),
          restaurant_id: RESTAURANT_ID,
          sort_order: maxSortOrder + 1
        })

      if (error) throw error
      
      setNewCategoryName('')
      setShowAddModal(false)
      showToastMsg('Category added')
      loadCategories()
    } catch (err) {
      showToastMsg('Failed to add category', 'error')
    }
  }

  const handleDeleteClick = (category) => {
    setDeleteTarget(category)
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    
    setDeleting(true)
    try {
      await supabase
        .from('menu_items')
        .update({ category_id: null })
        .eq('category_id', deleteTarget.id)

      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', deleteTarget.id)

      if (error) throw error
      
      showToastMsg('Category deleted')
      setDeleteTarget(null)
      loadCategories()
    } catch (err) {
      showToastMsg('Failed to delete category', 'error')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="categories-page">
        <div className="loading-grid">
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton-card">
              <div className="skeleton-line"></div>
              <div className="skeleton-line short"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="categories-page">
      {showToast && (
        <div className={`toast toast-${showToast.type}`}>
          <span className="toast-icon">{showToast.type === 'success' ? '✓' : '✗'}</span>
          <span className="toast-message">{showToast.message}</span>
        </div>
      )}

      <div className="page-header">
        <div className="header-left">
          <h2 className="page-title">Categories</h2>
          <span className="item-count">{categories.length} categories</span>
        </div>
        <button className="add-btn" onClick={() => setShowAddModal(true)}>
          <span className="btn-icon">+</span>
          Add Category
        </button>
      </div>

      {categories.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon-large">📂</div>
          <h3>No Categories Yet</h3>
          <p>Create categories to organize your menu items</p>
          <button className="add-btn" onClick={() => setShowAddModal(true)}>
            Create your first category
          </button>
        </div>
      ) : (
        <div className="categories-grid">
          {categories.map(cat => (
            <CategoryCard
              key={cat.id}
              category={cat}
              itemCount={itemCounts[cat.id] || 0}
              onUpdate={loadCategories}
              onDeleteClick={() => handleDeleteClick(cat)}
              showToast={showToastMsg}
            />
          ))}
        </div>
      )}

      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="add-modal category-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add New Category</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>×</button>
            </div>
            <div className="modal-form">
              <div className="form-group">
                <label>Category Name</label>
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="e.g., Main Course, Beverages"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                />
              </div>
              <div className="modal-actions">
                <button className="cancel-btn" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button className="save-btn" onClick={handleAddCategory} disabled={!newCategoryName.trim()}>
                  Create Category
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete Category?"
        message={
          deleteTarget && itemCounts[deleteTarget.id] > 0
            ? `"${deleteTarget?.name}" has ${itemCounts[deleteTarget.id]} item(s). Items will be uncategorized. This cannot be undone.`
            : `Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`
        }
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </div>
  )
}

function CategoryCard({ category, itemCount, onUpdate, onDeleteClick, showToast }) {
  const [isEditing, setIsEditing] = useState(false)
  const [editData, setEditData] = useState({
    name: category.name,
    image: category.image || '',
    sort_order: category.sort_order || 0
  })
  const [saving, setSaving] = useState(false)
  const [imageError, setImageError] = useState(false)

  const handleChange = (field, value) => {
    setEditData(prev => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const { error } = await supabase
        .from('categories')
        .update({
          name: editData.name.trim(),
          image: editData.image || null,
          sort_order: Number(editData.sort_order) || 0
        })
        .eq('id', category.id)

      if (error) throw error
      
      setIsEditing(false)
      showToast('Category updated')
      onUpdate()
    } catch (err) {
      showToast('Failed to update', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEditData({
      name: category.name,
      image: category.image || '',
      sort_order: category.sort_order || 0
    })
    setIsEditing(false)
    setImageError(false)
  }

  const getInitials = (name) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  return (
    <div className={`category-card ${isEditing ? 'editing' : ''}`}>
      <div className="category-card-left">
        <div className="category-image-wrapper">
          {editData.image && !imageError ? (
            <img 
              src={editData.image} 
              alt={editData.name}
              className="category-image"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className={`category-placeholder ${editData.name.toLowerCase().includes('main') ? 'main' : ''}`}>
              {getInitials(editData.name)}
            </div>
          )}
        </div>
        
        <div className="category-info">
          {isEditing ? (
            <input
              type="text"
              className="category-name-input"
              value={editData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              autoFocus
            />
          ) : (
            <h3 className="category-name">{editData.name}</h3>
          )}
          
          <span className="category-count">{itemCount} items</span>
          
          <input
            type="url"
            className="category-image-url"
            value={editData.image}
            onChange={(e) => handleChange('image', e.target.value)}
            placeholder="Paste image URL..."
            disabled={!isEditing}
          />
        </div>
      </div>

      <div className="category-card-right">
        <div className="sort-order-wrapper">
          <span className="sort-label">Order</span>
          <input
            type="number"
            className="sort-order-input"
            value={editData.sort_order}
            onChange={(e) => handleChange('sort_order', e.target.value)}
            disabled={!isEditing}
            min="0"
          />
        </div>

        {isEditing ? (
          <div className="edit-actions">
            <button 
              className="edit-save-btn" 
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? '...' : '✓'}
            </button>
            <button className="edit-cancel-btn" onClick={handleCancel}>
              ✗
            </button>
          </div>
        ) : (
          <div className="category-card-actions">
            <button 
              className="edit-toggle-btn"
              onClick={() => setIsEditing(true)}
            >
              Edit
            </button>
            <button 
              className="remove-btn-category"
              onClick={onDeleteClick}
            >
              🗑️ Remove
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
