import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { fetchWithTimeout } from '../lib/apiUtils'
import ConfirmModal from '../components/ConfirmModal'
import CloudinaryUpload from '../components/CloudinaryUpload'
import { getOptimizedUrl, extractPublicId, deleteFromCloudinary } from '../services/cloudinaryService'
import { IconAlertTriangle, IconFolder } from '../components/Icons'

const API_TIMEOUT = 30000

export default function CategoriesPage({ restaurantId }) {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newMainCategoryId, setNewMainCategoryId] = useState('')
  const [itemCounts, setItemCounts] = useState({})
  const [showToast, setShowToast] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [editingCategory, setEditingCategory] = useState(null)
  const [editName, setEditName] = useState('')
  const [editImage, setEditImage] = useState('')
  const [editSortOrder, setEditSortOrder] = useState(0)
  const [editMainCategoryId, setEditMainCategoryId] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [mainCategories, setMainCategories] = useState([])

  const mountedRef = useRef(false)
  const abortControllerRef = useRef(null)

  const currentRestId = restaurantId

  const showToastMsg = (message, type = 'success') => {
    setShowToast({ message, type })
    setTimeout(() => setShowToast(null), 3000)
  }

  const loadCategories = async (signal = null) => {
    if (!signal && mountedRef.current) setLoading(true)
    setError(null)
    try {
      const categoriesPromise = supabase
        .from('categories')
        .select('*')
        .eq('restaurant_id', currentRestId)
        .order('sort_order', { ascending: true })
      const { data, error } = await fetchWithTimeout(categoriesPromise, API_TIMEOUT)
      if (signal?.aborted) return
      if (error) throw error
      setCategories(data || [])
      const counts = {}
      for (const cat of data || []) {
        const countPromise = supabase
          .from('menu_items')
          .select('*', { count: 'exact', head: true })
          .eq('category_id', cat.id)
        const { count } = await fetchWithTimeout(countPromise, API_TIMEOUT)
        if (!signal?.aborted) {
          counts[cat.id] = count || 0
        }
      }
      if (!signal?.aborted) {
        setItemCounts(counts)
      }
      const mcPromise = supabase
        .from('main_categories')
        .select('id, name, sort_order')
        .eq('restaurant_id', currentRestId)
        .order('sort_order', { ascending: true })
      const { data: mcData } = await fetchWithTimeout(mcPromise, API_TIMEOUT)
      if (!signal?.aborted && mcData) {
        setMainCategories(mcData)
      }
    } catch (err) {
      console.error('Failed to load categories:', err)
      if (!signal?.aborted) {
        setError(err.name === 'AbortError' ? 'Request cancelled' : 'Failed to load categories')
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    if (!currentRestId) return
    mountedRef.current = true
    const controller = new AbortController()
    abortControllerRef.current = controller
    loadCategories(controller.signal)
    return () => {
      mountedRef.current = false
      controller.abort()
      abortControllerRef.current = null
    }
  }, [currentRestId])

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return
    const maxSortOrder = categories.reduce((max, c) => Math.max(max, c.sort_order || 0), 0)
    try {
      const { error } = await supabase
        .from('categories')
        .insert({
          name: newCategoryName.trim(),
          restaurant_id: currentRestId,
          sort_order: maxSortOrder + 1,
          main_category_id: newMainCategoryId || null
        })
      if (error) throw error
      setNewCategoryName('')
      setNewMainCategoryId('')
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
        .eq('restaurant_id', currentRestId)
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', deleteTarget.id)
        .eq('restaurant_id', currentRestId)
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

  const handleEditClick = (category) => {
    setEditingCategory(category)
    setEditName(category.name)
    setEditImage(category.image || '')
    setEditSortOrder(category.sort_order || 0)
    setEditMainCategoryId(category.main_category_id || '')
  }

  const handleCancelEdit = () => {
    setEditingCategory(null)
    setEditName('')
    setEditImage('')
    setEditSortOrder(0)
    setEditMainCategoryId('')
  }

  const handleSaveEdit = async () => {
    if (!editName.trim() || !editingCategory) return
    setSavingEdit(true)
    try {
      const { error } = await supabase
        .from('categories')
        .update({
          name: editName.trim(),
          image: editImage || null,
          sort_order: Number(editSortOrder) || 0,
          main_category_id: editMainCategoryId || null
        })
        .eq('id', editingCategory.id)
        .eq('restaurant_id', currentRestId)
      if (error) throw error
      showToastMsg('Category updated')
      setEditingCategory(null)
      loadCategories()
    } catch (err) {
      const publicId = extractPublicId(editImage)
      if (publicId) deleteFromCloudinary(publicId)
      showToastMsg('Failed to update category', 'error')
    } finally {
      setSavingEdit(false)
    }
  }

  const filteredCategories = categories.filter(cat =>
    cat.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (loading) {
    return (
      <div className="categories-page">
        <div className="skeleton-container">
          <div className="skeleton-grid">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="skeleton skeleton-card"></div>
            ))}
          </div>
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

      <div className="categories-header">
        <div className="categories-header-left">
          <h2 className="categories-title">Categories</h2>
          <span className="categories-count">{categories.length} categories</span>
        </div>
        <div className="categories-header-right">
          <input
            type="text"
            className="categories-search"
            placeholder="Search categories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button className="categories-add-btn" onClick={() => setShowAddModal(true)}>
            + Add Category
          </button>
        </div>
      </div>

      {error ? (
        <div className="empty-state">
          <div className="empty-icon"><IconAlertTriangle size={48} /></div>
          <h3>Failed to load categories</h3>
          <p>{error}</p>
          <button className="categories-add-btn" onClick={() => loadCategories()}>
            Retry
          </button>
        </div>
      ) : filteredCategories.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon-large"><IconFolder size={48} /></div>
          <h3>No categories found</h3>
          <p>{searchQuery ? 'Try a different search term' : 'Create categories to organize your menu items'}</p>
          <button className="categories-add-btn" onClick={() => setShowAddModal(true)}>
            + Add Category
          </button>
        </div>
      ) : (
        <div className="categories-grid">
          {filteredCategories.map(cat => (
            <CategoryCard
              key={cat.id}
              category={cat}
              itemCount={itemCounts[cat.id] || 0}
              mainCategories={mainCategories}
              onEditClick={() => handleEditClick(cat)}
              onDeleteClick={() => handleDeleteClick(cat)}
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
              {mainCategories.length > 0 && (
                <div className="form-group">
                  <label>Main Category</label>
                  <select
                    value={newMainCategoryId}
                    onChange={(e) => setNewMainCategoryId(e.target.value)}
                  >
                    <option value="">None</option>
                    {mainCategories.map(mc => (
                      <option key={mc.id} value={mc.id}>{mc.name}</option>
                    ))}
                  </select>
                </div>
              )}
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

      {editingCategory && (
        <div className="modal-overlay" onClick={handleCancelEdit}>
          <div className="add-modal category-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Category</h3>
              <button className="modal-close" onClick={handleCancelEdit}>×</button>
            </div>
            <div className="modal-form">
              <div className="form-group">
                <label>Category Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Category name"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                />
              </div>
              {mainCategories.length > 0 && (
                <div className="form-group">
                  <label>Main Category</label>
                  <select
                    value={editMainCategoryId}
                    onChange={(e) => setEditMainCategoryId(e.target.value)}
                  >
                    <option value="">None</option>
                    {mainCategories.map(mc => (
                      <option key={mc.id} value={mc.id}>{mc.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label>Image</label>
                <CloudinaryUpload
                  restaurantId={currentRestId}
                  subfolder="Categories"
                  type="image"
                  value={editImage}
                  onChange={(url) => setEditImage(url)}
                />
              </div>
              <div className="form-group">
                <label>Sort Order</label>
                <input
                  type="number"
                  value={editSortOrder}
                  onChange={(e) => setEditSortOrder(e.target.value)}
                  placeholder="0"
                  min="0"
                />
              </div>
              <div className="modal-actions">
                <button className="cancel-btn" onClick={handleCancelEdit}>
                  Cancel
                </button>
                <button className="save-btn" onClick={handleSaveEdit} disabled={!editName.trim() || savingEdit}>
                  {savingEdit ? 'Saving...' : 'Save Changes'}
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

function CategoryCard({ category, itemCount, mainCategories = [], onEditClick, onDeleteClick }) {
  const [imageError, setImageError] = useState(false)
  const mainCat = mainCategories.find(mc => mc.id === category.main_category_id)

  const getInitials = (name) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  return (
    <div className="category-card">
      <div className="category-image-wrapper">
        {category.image && !imageError ? (
          <img
            src={getOptimizedUrl(category.image)}
            alt={category.name}
            className="category-image"
            loading="lazy"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="category-placeholder">
            {getInitials(category.name)}
          </div>
        )}
      </div>
      <div className="category-info">
        <span className="category-name">{category.name}</span>
        <span className="category-meta">{itemCount} items</span>
        {mainCat && (
          <span className="category-main-cat">{mainCat.name}</span>
        )}
        {category.status && (
          <span className={`category-status ${category.status}`}>{category.status}</span>
        )}
      </div>
      <div className="category-actions">
        <button className="category-btn category-btn-edit" onClick={onEditClick}>
          Edit
        </button>
        <button className="category-btn category-btn-delete" onClick={onDeleteClick}>
          Delete
        </button>
      </div>
    </div>
  )
}
