import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { fetchWithTimeout } from '../lib/apiUtils'
import { useAuth } from '../contexts/AuthContext'
import CloudinaryUpload from '../components/CloudinaryUpload'
import { COUNTRY_CONFIGS, DEFAULT_CURRENCY, formatCurrency } from '../utils/formatCurrency'
import { useRestaurant } from '../contexts/RestaurantContext'

import { IconPackage, IconBarChart, IconSettings, IconBell, IconLock, IconUtensils, IconFolder, IconCheck, IconX, IconPhone, IconMail, IconStore, IconCopy, IconLogOut, IconStar, IconHelpCircle, IconFileText, IconPalette, IconInfo, IconImage, IconDollarSign } from '../components/Icons'

const API_TIMEOUT = 30000

const ORDER_SOUNDS = [
  { id: 'classic-notification', name: 'Classic Notification', freq: [800, 1000], duration: 0.2 },
  { id: 'restaurant-alert', name: 'Restaurant Alert', freq: [600, 900, 1200], duration: 0.4 },
  { id: 'soft-chime', name: 'Soft Chime', freq: [523, 659, 784], duration: 0.5 },
  { id: 'digital-alert', name: 'Digital Alert', freq: [1000, 1500, 2000], duration: 0.3 }
]

const WAITER_SOUNDS = [
  { id: 'service-bell', name: 'Service Bell', freq: [800, 1200], duration: 0.5 },
  { id: 'counter-bell', name: 'Counter Bell', freq: [1000, 1500], duration: 0.4 },
  { id: 'reception-bell', name: 'Reception Bell', freq: [600, 900, 1200], duration: 0.6 },
  { id: 'soft-bell', name: 'Soft Bell', freq: [700, 1000], duration: 0.4 }
]

const HELP_TOPICS = [
  { id: 'orders', icon: <IconPackage size={20} />, label: 'Order Issues', keywords: ['order', 'orders', 'not showing', 'missing'], answers: [
    'Check your internet connection and refresh the Live Orders page',
    'New orders appear automatically when received - ensure you are logged in',
    'If orders still don\'t show, try clearing browser cache and logging in again'
  ]},
  { id: 'dashboard', icon: <IconBarChart size={20} />, label: 'Dashboard Help', keywords: ['dashboard', 'how', 'use', 'app', 'help'], answers: [
    'Live Orders: Accept or decline incoming orders',
    'Analytics: View sales performance and reports',
    'Menu Items: Manage your food menu and categories',
    'Use sidebar to navigate between sections'
  ]},
  { id: 'technical', icon: <IconSettings size={20} />, label: 'Technical Errors', keywords: ['error', 'bug', 'technical', 'issue'], answers: [
    'Refresh the page to resolve minor display issues',
    'Check console for error messages',
    'Contact support with screenshot of the error'
  ]},
  { id: 'notifications', icon: <IconBell size={20} />, label: 'Notification Issues', keywords: ['notification', 'sound', 'alert', 'bell'], answers: [
    'Make sure Order Notification Sound is enabled in Settings > Notifications',
    'Check if browser notifications are allowed',
    'Try selecting a different order or waiter sound'
  ]},
  { id: 'login', icon: <IconLock size={20} />, label: 'Login Problems', keywords: ['login', 'password', 'access'], answers: [
    'Default password is: 1234',
    'Clear browser cache and try logging in again',
    'Contact support if you cannot access your account'
  ]},
  { id: 'menu', icon: <IconUtensils size={20} />, label: 'Menu Items', keywords: ['menu', 'item', 'add', 'delete', 'edit'], answers: [
    'Go to Menu Items in sidebar to add new items',
    'Click on an item to edit its details',
    'Use categories to organize your menu'
  ]},
  { id: 'categories', icon: <IconFolder size={20} />, label: 'Category Management', keywords: ['category', 'category', 'organize', 'group'], answers: [
    'Navigate to Categories to create new categories',
    'Assign menu items to categories for better organization',
    'Categories appear in the order you set'
  ]},
  { id: 'orders_accept', icon: <IconCheck size={20} />, label: 'Accepting Orders', keywords: ['accept', 'confirm', 'approve'], answers: [
    'Click Accept button on pending orders',
    'Accepted orders show in green with confirmation',
    'Once accepted, order moves to active status'
  ]},
  { id: 'orders_decline', icon: <IconX size={20} />, label: 'Declining Orders', keywords: ['decline', 'reject', 'cancel'], answers: [
    'Click Decline button on pending orders',
    'Declined orders are permanently removed',
    'This action cannot be undone'
  ]}
]

const HELP_RESPONSES = {
  orders: {
    title: 'Order Issues',
    description: 'Common problems with order display and management',
    answers: [
      { q: 'Orders not showing?', a: 'Check your internet connection and refresh the Live Orders page. Ensure you are logged in.' },
      { q: 'How do I receive orders?', a: 'New orders appear automatically when received. Make sure notifications are enabled in Settings.' },
      { q: 'Orders disappear after accepting?', a: 'Refresh the page or check if the order was cancelled by the customer.' },
      { q: 'Can I see order history?', a: 'Current session orders are shown. For history, check Analytics page.'
      }
    ]
  },
  dashboard: {
    title: 'Dashboard Help',
    description: 'How to use the dashboard effectively',
    answers: [
      { q: 'How to accept an order?', a: 'Click the Accept button on pending orders in the Live Orders page.' },
      { q: 'Where to manage menu items?', a: 'Use the Menu Items section in the sidebar to add, edit, or delete items.' },
      { q: 'How to view analytics?', a: 'Navigate to Analytics in the sidebar to see sales performance and reports.' },
      { q: 'How do I search orders?', a: 'Use the search box on Live Orders page to search by Order ID.' }
    ]
  },
  technical: {
    title: 'Technical Errors',
    description: 'Troubleshooting technical issues',
    answers: [
      { q: 'Page not loading properly?', a: 'Refresh the page or clear browser cache. Try using a modern browser.' },
      { q: 'Getting error messages?', a: 'Take a screenshot of the error and contact support with details.' },
      { q: 'App running slow?', a: 'Check your internet connection. Close unused browser tabs.' },
      { q: 'How to report a bug?', a: 'Contact support with a description and screenshot of the issue.' }
    ]
  },
  notifications: {
    title: 'Notification Issues',
    description: 'Problems with sounds and alerts',
    answers: [
      { q: 'No sound on new orders?', a: 'Go to Settings > Notifications and enable Order Notification Sound. Also check your device volume.' },
      { q: 'Sound not playing?', a: 'Click anywhere on the page first to initialize audio. Some browsers require user interaction.' },
      { q: 'How to change notification sound?', a: 'Go to Settings > Notifications to select an order or waiter sound.' },
      { q: 'Can I disable notifications?', a: 'Yes, toggle off Order Notifications or the individual sound toggles in Settings.' }
    ]
  },
  login: {
    title: 'Login Problems',
    description: 'Access and authentication issues',
    answers: [
      { q: 'What is the default password?', a: 'The default password is: 1234' },

      { q: 'Session expired repeatedly?', a: 'Clear browser cache and ensure cookies are enabled.' },
      { q: 'Can I change my password?', a: 'Contact support to update your password.' }
    ]
  },
  menu: {
    title: 'Menu Items',
    description: 'Managing your food menu',
    answers: [
      { q: 'How to add new item?', a: 'Go to Menu Items > click Add Item button > fill details > Save.' },
      { q: 'Edit existing item?', a: 'Click on any menu item to edit its name, price, description, etc.' },
      { q: 'Delete menu item?', a: 'Click on item > Delete button. This cannot be undone.' },
      { q: 'Mark item as veg/non-veg?', a: 'When adding/editing item, toggle the veg switch. Green = veg, Red = non-veg.' }
    ]
  },
  categories: {
    title: 'Category Management',
    description: 'Organizing menu items',
    answers: [
      { q: 'How to create categories?', a: 'Go to Categories in sidebar > Add Category > enter name and optional image.' },
      { q: 'Assign items to category?', a: 'When editing a menu item, select a category from the dropdown.' },
      { q: 'Reorder categories?', a: 'Drag and drop categories to change their order.' },
      { q: 'Delete a category?', a: 'Click on category > Delete. Items in category will become uncategorized.' }
    ]
  },
  orders_accept: {
    title: 'Accepting Orders',
    description: 'Order acceptance process',
    answers: [
      { q: 'What happens when I accept?', a: 'Order status changes to accepted. Customer is notified of confirmation.' },
      { q: 'Can I accept only specific items?', a: 'Accept or decline applies to the entire order, not individual items.' },
      { q: 'Where do accepted orders go?', a: 'Accepted orders remain visible with green accepted status.' },
      { q: 'Can I undo accept?', a: 'No, once accepted the order is confirmed. Contact customer for changes.' }
    ]
  },
  orders_decline: {
    title: 'Declining Orders',
    description: 'Order decline process',
    answers: [
      { q: 'How to decline an order?', a: 'Click Decline button on pending order. Confirm when prompted.' },
      { q: 'Can I decline specific items?', a: 'Decline applies to entire order. Contact customer for partial changes.' },
      { q: 'Is decline reversible?', a: 'No, declined orders are permanently removed from your dashboard.' },
      { q: 'Why would I decline?', a: 'Common reasons: item unavailable, customer requested cancellation.' }
    ]
  },
}

const PRIVACY_POLICY = `Data Collection
We collect the following information:
 Restaurant details (name, address, contact)
 Order information (items, prices)
 User preferences and settings

How We Use Your Data
Your data is used to:
 Process and manage incoming orders
 Provide real-time order notifications
 Generate analytics and reports
 Improve our services

Data Storage & Security
 All data is stored securely in our database
 We use industry-standard encryption
 Data is retained as long as your account is active

Third-Party Services
We use Supabase for database and authentication services. Your data is processed according to their privacy policy.

User Rights
You have the right to:
 Access your data
 Request data correction
 Request data deletion
 Export your data

Contact Information
For privacy concerns, contact us at: gourabneogi7775@gmail.com`

const TERMS_OF_SERVICE = `User Responsibilities
 Provide accurate information
 Maintain account security
 Use the service for legitimate business purposes

Acceptable Usage
 Use the dashboard only for order management
 Do not attempt to hack or exploit the system
 Do not share your account credentials

Limitations of Service
 We strive for 99.9% uptime but cannot guarantee availability
 Service may be interrupted for maintenance
 We are not responsible for lost profits or business interruption

Account Responsibilities
 Keep your password secure
 Report any unauthorized access immediately
 Ensure compliance with local regulations

Disclaimers
 Service is provided "as is" without warranties
 We are not responsible for third-party service failures

Limitation of Liability
 Our liability is limited to the amount paid for services
 We are not liable for indirect or consequential damages`

export default function SettingsPage({ preferences, setPreferences, onToast, restaurantId }) {
  const { signOut, role, session } = useAuth()
  const { restaurantConfig, refreshRestaurantConfig, loading: restaurantLoading, taxes: contextTaxes, refreshTaxes } = useRestaurant()
  const isSuperAdmin = role === 'admin'
  const [saving, setSaving] = useState(false)
  const [showModal, setShowModal] = useState(null)
  const [formData, setFormData] = useState({})
  const [helpTopic, setHelpTopic] = useState(null)

  const [mainCategories, setMainCategories] = useState([])
  const [mainCatLoading, setMainCatLoading] = useState(false)
  const [newMainCatName, setNewMainCatName] = useState('')
  const [editingMainCatId, setEditingMainCatId] = useState(null)
  const [editMainCatName, setEditMainCatName] = useState('')
  const [deleteMainCatTarget, setDeleteMainCatTarget] = useState(null)

  const [waiterRequestTypes, setWaiterRequestTypes] = useState([])
  const [wrtLoading, setWrtLoading] = useState(false)
  const [newWrtName, setNewWrtName] = useState('')
  const [editingWrtId, setEditingWrtId] = useState(null)
  const [editWrtName, setEditWrtName] = useState('')
  const [deleteWrtTarget, setDeleteWrtTarget] = useState(null)

  const [taxes, setTaxes] = useState([])
  const [newTaxName, setNewTaxName] = useState('')
  const [newTaxPercentage, setNewTaxPercentage] = useState('')
  const [newTaxType, setNewTaxType] = useState('percentage')
  const [editingTaxId, setEditingTaxId] = useState(null)
  const [editTaxName, setEditTaxName] = useState('')
  const [editTaxPercentage, setEditTaxPercentage] = useState('')
  const [editTaxType, setEditTaxType] = useState('percentage')
  const [deleteTaxTarget, setDeleteTaxTarget] = useState(null)

  const mountedRef = useRef(false)
  const abortControllerRef = useRef(null)

  const currentRestId = restaurantId

  useEffect(() => {
    if (currentRestId) {
      loadMainCategories()
      loadWaiterRequestTypes()
    }
  }, [currentRestId])

  const showToast = (message, type = 'success') => {
    if (onToast) {
      onToast(message, type)
    }
  }

  // Restaurant config is provided by RestaurantProvider — no local fetch needed

  const loadMainCategories = async () => {
    setMainCatLoading(true)
    try {
      const { data } = await supabase
        .from('main_categories')
        .select('*')
        .eq('restaurant_id', currentRestId)
        .order('sort_order', { ascending: true })
      if (data) setMainCategories(data)
    } catch (err) {
      console.error('Failed to load main categories:', err.message)
    } finally {
      setMainCatLoading(false)
    }
  }

  const handleAddMainCategory = async () => {
    if (typeof newMainCatName !== 'string' || !newMainCatName.trim()) return
    const maxOrder = mainCategories.reduce((max, c) => Math.max(max, c.sort_order || 0), 0)
    try {
      const { error } = await supabase
        .from('main_categories')
        .insert({
          name: typeof newMainCatName === 'string' ? newMainCatName.trim() : newMainCatName,
          restaurant_id: currentRestId,
          sort_order: maxOrder + 1
        })
      if (error) throw error
      setNewMainCatName('')
      showToast('Main category added')
      loadMainCategories()
    } catch (err) {
      showToast('Failed to add main category', 'error')
    }
  }

  const handleSaveMainCategoryEdit = async (id) => {
    if (typeof editMainCatName !== 'string' || !editMainCatName.trim()) return
    try {
      const { error } = await supabase
        .from('main_categories')
        .update({ name: typeof editMainCatName === 'string' ? editMainCatName.trim() : editMainCatName })
        .eq('id', id)
        .eq('restaurant_id', currentRestId)
      if (error) throw error
      setEditingMainCatId(null)
      setEditMainCatName('')
      showToast('Main category updated')
      loadMainCategories()
    } catch (err) {
      showToast('Failed to update main category', 'error')
    }
  }

  const handleDeleteMainCategory = async (id) => {
    try {
      await supabase
        .from('categories')
        .update({ main_category_id: null })
        .eq('main_category_id', id)
        .eq('restaurant_id', currentRestId)
      const { error } = await supabase
        .from('main_categories')
        .delete()
        .eq('id', id)
        .eq('restaurant_id', currentRestId)
      if (error) throw error
      setDeleteMainCatTarget(null)
      showToast('Main category deleted')
      loadMainCategories()
    } catch (err) {
      showToast('Failed to delete main category', 'error')
    }
  }

  const loadWaiterRequestTypes = async () => {
    setWrtLoading(true)
    try {
      const { data } = await supabase
        .from('waiter_request_types')
        .select('*')
        .eq('restaurant_id', currentRestId)
        .order('sort_order', { ascending: true })
      if (data) setWaiterRequestTypes(data)
    } catch (err) {
      console.error('Failed to load waiter request types:', err.message)
    } finally {
      setWrtLoading(false)
    }
  }

  const handleAddWaiterRequestType = async () => {
    if (typeof newWrtName !== 'string' || !newWrtName.trim()) return
    const maxOrder = waiterRequestTypes.reduce((max, t) => Math.max(max, t.sort_order || 0), 0)
    const optimistic = {
      id: 'temp-' + Date.now(),
      name: newWrtName.trim(),
      restaurant_id: currentRestId,
      is_active: true,
      sort_order: maxOrder + 1,
      created_at: new Date().toISOString()
    }
    setWaiterRequestTypes(prev => [...prev, optimistic])
    setNewWrtName('')
    try {
      const { data, error } = await supabase
        .from('waiter_request_types')
        .insert({
          name: newWrtName.trim(),
          restaurant_id: currentRestId,
          sort_order: maxOrder + 1
        })
        .select()
        .single()
      if (error) throw error
      if (data) {
        setWaiterRequestTypes(prev => prev.map(t => t.id === optimistic.id ? data : t))
      }
      showToast('Request type added')
    } catch (err) {
      setWaiterRequestTypes(prev => prev.filter(t => t.id !== optimistic.id))
      showToast('Failed to add request type', 'error')
    }
  }

  const handleSaveWaiterRequestTypeEdit = async (id) => {
    if (typeof editWrtName !== 'string' || !editWrtName.trim()) return
    const prevName = waiterRequestTypes.find(t => t.id === id)?.name || ''
    setWaiterRequestTypes(prev => prev.map(t => t.id === id ? { ...t, name: editWrtName.trim() } : t))
    setEditingWrtId(null)
    setEditWrtName('')
    try {
      const { error } = await supabase
        .from('waiter_request_types')
        .update({ name: editWrtName.trim() })
        .eq('id', id)
        .eq('restaurant_id', currentRestId)
      if (error) throw error
      showToast('Request type updated')
    } catch (err) {
      setWaiterRequestTypes(prev => prev.map(t => t.id === id ? { ...t, name: prevName } : t))
      showToast('Failed to update request type', 'error')
    }
  }

  const handleToggleWaiterRequestType = async (id, currentActive) => {
    setWaiterRequestTypes(prev => prev.map(t => t.id === id ? { ...t, is_active: !currentActive } : t))
    try {
      const { error } = await supabase
        .from('waiter_request_types')
        .update({ is_active: !currentActive })
        .eq('id', id)
        .eq('restaurant_id', currentRestId)
      if (error) throw error
      showToast(!currentActive ? 'Request type enabled' : 'Request type disabled')
    } catch (err) {
      setWaiterRequestTypes(prev => prev.map(t => t.id === id ? { ...t, is_active: currentActive } : t))
      showToast('Failed to update request type', 'error')
    }
  }

  const handleDeleteWaiterRequestType = async (id) => {
    const prev = waiterRequestTypes.find(t => t.id === id)
    setWaiterRequestTypes(prev => prev.filter(t => t.id !== id))
    setDeleteWrtTarget(null)
    try {
      const { error } = await supabase
        .from('waiter_request_types')
        .delete()
        .eq('id', id)
        .eq('restaurant_id', currentRestId)
      if (error) throw error
      showToast('Request type deleted')
    } catch (err) {
      if (prev) setWaiterRequestTypes(prev => [...prev, prev])
      showToast('Failed to delete request type', 'error')
    }
  }

  const handleMoveWrtUp = async (index) => {
    if (index <= 0) return
    const items = [...waiterRequestTypes]
    const temp = items[index]
    items[index] = { ...items[index - 1], sort_order: items[index].sort_order }
    items[index - 1] = { ...temp, sort_order: items[index - 1].sort_order }
    setWaiterRequestTypes(items)
    try {
      await supabase
        .from('waiter_request_types')
        .update({ sort_order: items[index].sort_order })
        .eq('id', items[index].id)
        .eq('restaurant_id', currentRestId)
      await supabase
        .from('waiter_request_types')
        .update({ sort_order: items[index - 1].sort_order })
        .eq('id', items[index - 1].id)
        .eq('restaurant_id', currentRestId)
    } catch (err) {
      loadWaiterRequestTypes()
      showToast('Failed to reorder', 'error')
    }
  }

  const handleMoveWrtDown = async (index) => {
    if (index >= waiterRequestTypes.length - 1) return
    const items = [...waiterRequestTypes]
    const temp = items[index]
    items[index] = { ...items[index + 1], sort_order: items[index].sort_order }
    items[index + 1] = { ...temp, sort_order: items[index + 1].sort_order }
    setWaiterRequestTypes(items)
    try {
      await supabase
        .from('waiter_request_types')
        .update({ sort_order: items[index].sort_order })
        .eq('id', items[index].id)
        .eq('restaurant_id', currentRestId)
      await supabase
        .from('waiter_request_types')
        .update({ sort_order: items[index + 1].sort_order })
        .eq('id', items[index + 1].id)
        .eq('restaurant_id', currentRestId)
    } catch (err) {
      loadWaiterRequestTypes()
      showToast('Failed to reorder', 'error')
    }
  }

  const handleAddTax = async () => {
    if (typeof newTaxName !== 'string' || !newTaxName.trim()) return
    const pct = parseFloat(newTaxPercentage)
    if (isNaN(pct) || pct < 0 || pct > 100) return
    const maxOrder = taxes.reduce((max, t) => Math.max(max, t.display_order || 0), 0)
    const optimistic = {
      id: 'temp-' + Date.now(),
      tax_name: newTaxName.trim(),
      tax_percentage: Math.round(pct * 100) / 100,
      tax_type: newTaxType,
      restaurant_id: currentRestId,
      is_enabled: true,
      display_order: maxOrder + 1,
      created_at: new Date().toISOString()
    }
    setTaxes(prev => [...prev, optimistic])
    setNewTaxName('')
    setNewTaxPercentage('')
    setNewTaxType('percentage')
    try {
      const { data, error } = await supabase
        .from('restaurant_taxes')
        .insert({
          tax_name: newTaxName.trim(),
          tax_percentage: Math.round(pct * 100) / 100,
          tax_type: newTaxType,
          restaurant_id: currentRestId,
          display_order: maxOrder + 1
        })
        .select()
        .single()
      if (error) throw error
      if (data) {
        setTaxes(prev => prev.map(t => t.id === optimistic.id ? data : t))
      }
      showToast('Tax added')
    } catch (err) {
      setTaxes(prev => prev.filter(t => t.id !== optimistic.id))
      showToast('Failed to add tax', 'error')
    }
  }

  const handleSaveTaxEdit = async (id) => {
    if (typeof editTaxName !== 'string' || !editTaxName.trim()) return
    const pct = parseFloat(editTaxPercentage)
    if (isNaN(pct) || pct < 0 || pct > 100) return
    const prev = taxes.find(t => t.id === id)
    const updated = {
      ...prev,
      tax_name: editTaxName.trim(),
      tax_percentage: Math.round(pct * 100) / 100,
      tax_type: editTaxType,
    }
    setTaxes(prev => prev.map(t => t.id === id ? updated : t))
    setEditingTaxId(null)
    setEditTaxName('')
    setEditTaxPercentage('')
    setEditTaxType('percentage')
    try {
      const { error } = await supabase
        .from('restaurant_taxes')
        .update({
          tax_name: editTaxName.trim(),
          tax_percentage: Math.round(pct * 100) / 100,
          tax_type: editTaxType,
        })
        .eq('id', id)
        .eq('restaurant_id', currentRestId)
      if (error) throw error
      showToast('Tax updated')
    } catch (err) {
      if (prev) setTaxes(prev => prev.map(t => t.id === id ? prev : t))
      showToast('Failed to update tax', 'error')
    }
  }

  const handleToggleTax = async (id, currentActive) => {
    setTaxes(prev => prev.map(t => t.id === id ? { ...t, is_enabled: !currentActive } : t))
    try {
      const { error } = await supabase
        .from('restaurant_taxes')
        .update({ is_enabled: !currentActive })
        .eq('id', id)
        .eq('restaurant_id', currentRestId)
      if (error) throw error
      showToast(!currentActive ? 'Tax enabled' : 'Tax disabled')
    } catch (err) {
      console.log(err);
      console.log('error.code:', err?.code);
      console.log('error.message:', err?.message);
      console.log('error.details:', err?.details);
      console.log('error.hint:', err?.hint);

      const payload = { is_enabled: !currentActive }
      const filters = { id, restaurant_id: currentRestId }
      const tax = taxes.find(t => t.id === id)
      console.log('update payload:', payload);
      console.log('filters:', filters);
      console.log('restaurant_id:', currentRestId);
      console.log('tax id:', id);
      console.log('authenticated user id:', session?.user?.id);

      setTaxes(prev => prev.map(t => t.id === id ? { ...t, is_enabled: currentActive } : t))
      showToast('Failed to update tax', 'error')
    }
  }

  const handleDeleteTax = async (id) => {
    const prev = taxes.find(t => t.id === id)
    setTaxes(prev => prev.filter(t => t.id !== id))
    setDeleteTaxTarget(null)
    try {
      const { error } = await supabase
        .from('restaurant_taxes')
        .delete()
        .eq('id', id)
        .eq('restaurant_id', currentRestId)
      if (error) throw error
      showToast('Tax deleted')
    } catch (err) {
      if (prev) setTaxes(prev => [...prev, prev])
      showToast('Failed to delete tax', 'error')
    }
  }

  const handleMoveTaxUp = async (index) => {
    if (index <= 0) return
    const items = [...taxes]
    const temp = items[index]
    items[index] = { ...items[index - 1], display_order: items[index].display_order }
    items[index - 1] = { ...temp, display_order: items[index - 1].display_order }
    setTaxes(items)
    try {
      await supabase
        .from('restaurant_taxes')
        .update({ display_order: items[index].display_order })
        .eq('id', items[index].id)
        .eq('restaurant_id', currentRestId)
      await supabase
        .from('restaurant_taxes')
        .update({ display_order: items[index - 1].display_order })
        .eq('id', items[index - 1].id)
        .eq('restaurant_id', currentRestId)
    } catch (err) {
      refreshTaxes()
      showToast('Failed to reorder', 'error')
    }
  }

  const handleMoveTaxDown = async (index) => {
    if (index >= taxes.length - 1) return
    const items = [...taxes]
    const temp = items[index]
    items[index] = { ...items[index + 1], display_order: items[index].display_order }
    items[index + 1] = { ...temp, display_order: items[index + 1].display_order }
    setTaxes(items)
    try {
      await supabase
        .from('restaurant_taxes')
        .update({ display_order: items[index].display_order })
        .eq('id', items[index].id)
        .eq('restaurant_id', currentRestId)
      await supabase
        .from('restaurant_taxes')
        .update({ display_order: items[index + 1].display_order })
        .eq('id', items[index + 1].id)
        .eq('restaurant_id', currentRestId)
    } catch (err) {
      refreshTaxes()
      showToast('Failed to reorder', 'error')
    }
  }

  const updatePreference = async (key, value) => {
    const newPrefs = { ...preferences, [key]: value }
    if (key === 'orderNotifications' && !value) {
      newPrefs.order_sound_enabled = false
      newPrefs.waiter_sound_enabled = false
      localStorage.setItem('order_sound_enabled', false)
      localStorage.setItem('waiter_sound_enabled', false)
    }
    setPreferences(newPrefs)
    localStorage.setItem('dashboard_preferences', JSON.stringify(newPrefs))
    if (key === 'order_sound_enabled') {
      localStorage.setItem('order_sound_enabled', value)
    }
    if (key === 'waiter_sound_enabled') {
      localStorage.setItem('waiter_sound_enabled', value)
    }
    showToast(key === 'orderNotifications' ? (value ? 'Notifications enabled' : 'Notifications disabled') : 
                   key === 'order_sound_enabled' ? (value ? 'Order sound enabled' : 'Order sound disabled') :
                   key === 'waiter_sound_enabled' ? (value ? 'Waiter sound enabled' : 'Waiter sound disabled') : 'Settings saved')
  }

  const playSoundPreview = (soundOptions, soundId) => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      const ctx = new AudioContext()
      
      const sound = soundOptions.find(s => s.id === soundId)
      if (!sound) return
      
      let delay = 0
      sound.freq.forEach((freq, i) => {
        setTimeout(() => {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          
          osc.connect(gain)
          gain.connect(ctx.destination)
          
          osc.frequency.value = freq
          osc.type = 'sine'
          
          gain.gain.setValueAtTime(0.25, ctx.currentTime)
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + sound.duration / sound.freq.length)
          
          osc.start(ctx.currentTime)
          osc.stop(ctx.currentTime + sound.duration / sound.freq.length)
        }, delay)
        delay += (sound.duration * 1000) / sound.freq.length
      })
    } catch (err) {
      console.warn('Preview failed:', err)
    }
  }

  const openModal = (modalName) => {
    setShowModal(modalName)
    setHelpTopic(null)
    
    if (modalName === 'maincategories') {
      loadMainCategories()
    } else if (modalName === 'waiterrequesttypes') {
      loadWaiterRequestTypes()
    } else if (modalName === 'taxes') {
      setTaxes([...contextTaxes])
    } else if (modalName === 'business') {
      setFormData({
        name: restaurantConfig?.name || '',
        slug: restaurantConfig?.slug || '',
        contact_number: restaurantConfig?.contact_number || '',
        logo: restaurantConfig?.logo || ''
      })
    } else if (modalName === 'logo') {
      setFormData({
        logo: restaurantConfig?.logo || ''
      })
    } else if (modalName === 'bgvideo') {
      loadBgVideo()
    } else if (modalName === 'currency') {
      const currentCountry = restaurantConfig?.country_code || DEFAULT_CURRENCY.country_code
      const matched = COUNTRY_CONFIGS.find(c => c.country_code === currentCountry) || COUNTRY_CONFIGS[0]
      setFormData({
        country_code: matched.country_code,
        currency_code: matched.currency_code,
        currency_symbol: matched.currency_symbol,
        locale: matched.locale,
      })
    }
  }

  const closeModal = () => {
    setShowModal(null)
    setFormData({})
    setHelpTopic(null)
    setEditingMainCatId(null)
    setEditMainCatName('')
    setNewMainCatName('')
    setDeleteMainCatTarget(null)
    setEditingWrtId(null)
    setEditWrtName('')
    setNewWrtName('')
    setDeleteWrtTarget(null)
    setEditingTaxId(null)
    setEditTaxName('')
    setEditTaxPercentage('')
    setEditTaxType('percentage')
    setNewTaxName('')
    setNewTaxPercentage('')
    setNewTaxType('percentage')
    setDeleteTaxTarget(null)
  }

  const handleLogout = async (forceLogout = false) => {
    if (forceLogout || window.confirm('Are you sure you want to logout?')) {
      try {
        localStorage.removeItem('dashboard_preferences')
        localStorage.removeItem('dashboard_keepLoggedIn')
        await signOut()
    } catch (err) {
      console.error('Logout error:', err.message)
    }
    }
  }

  const handleHelpSelect = (topicId) => {
    setHelpTopic(topicId)
  }

  const validateSlug = (slug) => {
    if (typeof slug !== 'string' || slug.trim() === '') return true
    return /^[a-z0-9-]+$/.test(slug.trim())
  }

  const handleSaveRestaurant = async (e) => {
    e.preventDefault()
    if (saving || !currentRestId) return
    setSaving(true)
    try {
      const { name, slug, contact_number, logo } = formData

      const safeTrim = (v) => typeof v === 'string' ? v.trim() : v

      const noChanges = (
        restaurantConfig &&
                safeTrim(contact_number) === safeTrim(restaurantConfig?.contact_number) &&
                safeTrim(logo) === safeTrim(restaurantConfig?.logo)
      )
      if (noChanges) {
        showToast('Business details saved')
        closeModal()
        return
      }

      if (!isSuperAdmin) {
        const { data: updated, error } = await supabase
          .from('restaurants')
          .update({ 
            contact_number: safeTrim(contact_number) || null,
            logo: safeTrim(logo) || null
          })
          .eq('id', currentRestId)
          .select('id')

        if (error) throw error
        if (!updated || updated.length === 0) {
          throw new Error('Restaurant record not found. Contact support.')
        }
        await refreshRestaurantConfig()
        showToast('Business details saved')
        closeModal()
        return
      }
      
      if (typeof name !== 'string' || name.trim() === '') {
        showToast('Restaurant name is required', 'error')
        return
      }

      if (slug && !validateSlug(slug)) {
        showToast('Invalid slug. Use lowercase letters, numbers, and hyphens only', 'error')
        return
      }

      const { data: updated, error } = await supabase
        .from('restaurants')
        .update({ 
          name: name.trim(), 
          slug: typeof slug === 'string' ? slug.trim() : slug,
          contact_number: safeTrim(contact_number) || null,
          logo: safeTrim(logo) || null
        })
        .eq('id', currentRestId)
        .select('id')

      if (error) throw error
      if (!updated || updated.length === 0) {
        throw new Error('Restaurant record not found. Contact support.')
      }
      
      await refreshRestaurantConfig()
      showToast('Business details saved')
      closeModal()
    } catch (err) {
      console.error('[Settings] Save restaurant error:', err.message)
      showToast('Failed to save: ' + (err.message || 'Unknown error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveCurrency = async (e) => {
    e.preventDefault()
    if (saving || !currentRestId) return
    setSaving(true)
    try {
      const { country_code, currency_code, currency_symbol, locale } = formData
      const { error } = await supabase
        .from('restaurants')
        .update({ country_code, currency_code, currency_symbol, locale })
        .eq('id', currentRestId)

      if (error) throw error

      await refreshRestaurantConfig()
      showToast('Currency settings saved')
      closeModal()
    } catch (err) {
      console.error('[Settings] Save currency error:', err.message)
      showToast('Failed to save currency settings', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveLogo = async (e) => {
    e.preventDefault()
    if (saving || !currentRestId) return
    const safeTrim = (v) => typeof v === 'string' ? v.trim() : v
    const logoUrl = safeTrim(formData.logo) || ''

    setSaving(true)
    try {
      const { data: updated, error } = await supabase
        .from('restaurants')
        .update({ logo: logoUrl || null })
        .eq('id', currentRestId)
        .select('id')

      if (error) throw error
      if (!updated || updated.length === 0) {
        throw new Error('Restaurant record not found. Contact support.')
      }

      await refreshRestaurantConfig()
      showToast(logoUrl ? 'Logo saved' : 'Logo cleared')
      closeModal()
    } catch (err) {
      console.error('[Settings] Save logo error:', err.message)
      showToast('Failed to save logo: ' + (err.message || 'Unknown error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const loadBgVideo = async () => {
    try {
      const { data } = await supabase
        .from('landing_page_settings')
        .select('background_video_url')
        .eq('restaurant_id', currentRestId)
        .maybeSingle()
      setFormData({
        background_video_url: data?.background_video_url || ''
      })
    } catch (err) {
      setFormData({ background_video_url: '' })
    }
  }

  const handleSaveBgVideo = async (e) => {
    e.preventDefault()
    if (saving || !currentRestId) return
    const videoUrl = typeof formData.background_video_url === 'string' ? formData.background_video_url.trim() : ''
    setSaving(true)
    try {
      const existing = await supabase
        .from('landing_page_settings')
        .select('id')
        .eq('restaurant_id', currentRestId)
        .maybeSingle()

      if (existing.data) {
        const { error } = await supabase
          .from('landing_page_settings')
          .update({ background_video_url: videoUrl || null })
          .eq('id', existing.data.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('landing_page_settings')
          .insert({ restaurant_id: currentRestId, background_video_url: videoUrl || null })
        if (error) throw error
      }

      showToast(videoUrl ? 'Background video saved' : 'Background video cleared')
      closeModal()
    } catch (err) {
      console.error('[Settings] Save bg video error:', err.message)
      showToast('Failed to save background video', 'error')
    } finally {
      setSaving(false)
    }
  }

  const videoSaveInProgressRef = useRef(false)

  const handleSaveBgVideoPreSubmit = async (videoUrl) => {
    if (!videoUrl || videoSaveInProgressRef.current || !currentRestId) return
    videoSaveInProgressRef.current = true
    try {
      const existing = await supabase
        .from('landing_page_settings')
        .select('id')
        .eq('restaurant_id', currentRestId)
        .maybeSingle()
      if (existing.data) {
        await supabase
          .from('landing_page_settings')
          .update({ background_video_url: videoUrl })
          .eq('id', existing.data.id)
      } else {
        await supabase
          .from('landing_page_settings')
          .insert({ restaurant_id: currentRestId, background_video_url: videoUrl })
      }
      showToast('Background video saved')
    } catch (err) {
      console.error('[Settings] Pre-save bg video error:', err.message)
      showToast('Failed to save background video', 'error')
    } finally {
      videoSaveInProgressRef.current = false
    }
  }

  const handleClearBgVideo = async () => {
    if (!currentRestId) return
    setFormData({ ...formData, background_video_url: '' })
    try {
      const existing = await supabase
        .from('landing_page_settings')
        .select('id')
        .eq('restaurant_id', currentRestId)
        .maybeSingle()
      if (existing.data) {
        await supabase
          .from('landing_page_settings')
          .update({ background_video_url: null })
          .eq('id', existing.data.id)
      }
      showToast('Background video removed')
    } catch (err) {
      console.error('[Settings] Clear bg video error:', err.message)
      showToast('Failed to remove background video', 'error')
    }
  }

  const renderModal = () => {
    if (!showModal) return null
    if (showModal === 'business') {
      return (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="settings-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Business Details</h3>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <div className="business-readonly-section">
              <div className="readonly-field">
                <span className="readonly-label">Restaurant Name</span>
                <span className="readonly-value">{restaurantConfig?.name || formData.name || '—'}</span>
              </div>
              <div className="readonly-field">
                <span className="readonly-label">Restaurant Slug</span>
                <span className="readonly-value">{restaurantConfig?.slug || formData.slug || '—'}</span>
              </div>
            </div>
            <form onSubmit={handleSaveRestaurant}>
              <div className="form-group">
                <label>Contact Number</label>
                <input type="tel" value={formData.contact_number || ''} onChange={e => setFormData({ ...formData, contact_number: e.target.value })} placeholder="Enter contact number" />
              </div>
              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={closeModal}>Cancel</button>
                <button type="submit" className="save-btn" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )
    }
    if (showModal === 'logo') {
      return (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="settings-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Restaurant Logo</h3>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <form onSubmit={handleSaveLogo}>
              <div className="form-group">
                <label>Logo</label>
                <CloudinaryUpload
                  restaurantId={currentRestId}
                  subfolder="res_logo"
                  type="logo"
                  value={formData.logo || ''}
                  onChange={(url) => setFormData({ ...formData, logo: url })}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={closeModal}>Cancel</button>
                <button type="submit" className="save-btn" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )
    }
    if (showModal === 'bgvideo') {
      return (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="settings-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Background Video</h3>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <form onSubmit={handleSaveBgVideo}>
              <div className="form-group">
                <label>Background Video (for landing page)</label>
                <CloudinaryUpload
                  restaurantId={currentRestId}
                  subfolder="background video"
                  type="video"
                  value={formData.background_video_url || ''}
                  onChange={(url) => {
                    setFormData({ ...formData, background_video_url: url })
                    if (url) {
                      handleSaveBgVideoPreSubmit(url)
                    }
                  }}
                  onUploadEnd={() => {
                    if (formData.background_video_url) {
                      handleSaveBgVideoPreSubmit(formData.background_video_url)
                    }
                  }}
                />
              </div>
              {formData.background_video_url && (
                <div className="form-group">
                  <label>Preview</label>
                  <video
                    src={formData.background_video_url}
                    className="cloudinary-preview"
                    muted
                    playsInline
                    controls
                    preload="metadata"
                    style={{ width: '100%', borderRadius: '8px', maxHeight: '200px' }}
                  />
                </div>
              )}
              <div className="modal-actions">
                {formData.background_video_url && (
                  <button type="button" className="delete-btn" onClick={handleClearBgVideo}>Remove Video</button>
                )}
                <button type="button" className="cancel-btn" onClick={closeModal}>Done</button>
              </div>
            </form>
          </div>
        </div>
      )
    }
    if (showModal === 'notifications') {
      return (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="settings-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Notifications</h3>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <div className="settings-toggles">
              <div className="toggle-item">
                <div className="toggle-info">
                  <span className="toggle-label">Order Notifications</span>
                  <span className="toggle-desc">Show alerts for pending orders</span>
                </div>
                <button className={`toggle-switch ${preferences.orderNotifications ? 'active' : ''}`} onClick={() => updatePreference('orderNotifications', !preferences.orderNotifications)}><span className="toggle-knob" /></button>
              </div>
              <div className={`toggle-item${!preferences.orderNotifications ? ' opacity-50 pointer-events-none' : ''}`}>
                <div className="toggle-info">
                  <span className="toggle-label">Order Notification Sound</span>
                  <span className="toggle-desc">Play sound when new order arrives</span>
                </div>
                <button className={`toggle-switch ${preferences.order_sound_enabled !== false ? 'active' : ''}`} onClick={() => updatePreference('order_sound_enabled', preferences.order_sound_enabled === false ? true : false)}><span className="toggle-knob" /></button>
              </div>
              <div className={`toggle-item${!preferences.orderNotifications ? ' opacity-50 pointer-events-none' : ''}`}>
                <div className="toggle-info">
                  <span className="toggle-label">Waiter Call Sound</span>
                  <span className="toggle-desc">Play sound on new waiter calls</span>
                </div>
                <button className={`toggle-switch ${preferences.waiter_sound_enabled !== false ? 'active' : ''}`} onClick={() => updatePreference('waiter_sound_enabled', preferences.waiter_sound_enabled === false ? true : false)}><span className="toggle-knob" /></button>
              </div>
            </div>
            <div className={`notification-sound-section${!preferences.orderNotifications ? ' opacity-50 pointer-events-none' : ''}`}>
              <label className="sound-section-label">Order Notification Sound</label>
              <div className="sound-control-row">
                <select className="sound-select" value={preferences.order_notification_sound || 'classic-notification'} onChange={e => updatePreference('order_notification_sound', e.target.value)}>
                  {ORDER_SOUNDS.map(s => (<option key={s.id} value={s.id}>{s.name}</option>))}
                </select>
                <button className="sound-preview-btn" onClick={() => playSoundPreview(ORDER_SOUNDS, preferences.order_notification_sound || 'classic-notification')}>Preview</button>
              </div>
            </div>
            <div className={`notification-sound-section${!preferences.orderNotifications ? ' opacity-50 pointer-events-none' : ''}`}>
              <label className="sound-section-label">Waiter Call Sound</label>
              <div className="sound-control-row">
                <select className="sound-select" value={preferences.waiter_notification_sound || 'service-bell'} onChange={e => updatePreference('waiter_notification_sound', e.target.value)}>
                  {WAITER_SOUNDS.map(s => (<option key={s.id} value={s.id}>{s.name}</option>))}
                </select>
                <button className="sound-preview-btn" onClick={() => playSoundPreview(WAITER_SOUNDS, preferences.waiter_notification_sound || 'service-bell')}>Preview</button>
              </div>
            </div>
          </div>
        </div>
      )
    }
    if (showModal === 'theme') {
      return (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="settings-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Theme</h3>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <div className="theme-options">
              <button className={`theme-option ${preferences.theme === 'dark' ? 'active' : ''}`} onClick={() => updatePreference('theme', 'dark')}><div className="theme-preview dark"></div><div className="theme-info"><span className="theme-name">Dark</span><span className="theme-desc">Dark background, light text</span></div></button>
              <button className={`theme-option ${preferences.theme === 'light' ? 'active' : ''}`} onClick={() => updatePreference('theme', 'light')}><div className="theme-preview light"></div><div className="theme-info"><span className="theme-name">Light</span><span className="theme-desc">Light background, dark text</span></div></button>
            </div>
          </div>
        </div>
      )
    }
    if (showModal === 'help') {
      const selectedTopic = HELP_RESPONSES[helpTopic]
      return (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="settings-modal help-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Help Center</h3>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <div className="help-content">
              {helpTopic ? (
                <div className="help-response">
                  <button className="help-back" onClick={() => setHelpTopic(null)}>← Back</button>
                  <h4>{selectedTopic?.title}</h4>
                  <p className="help-description">{selectedTopic?.description}</p>
                  <div className="help-answers">
                    {selectedTopic?.answers?.map((item, idx) => (
                      <div key={idx} className="help-answer-item">
                        <span className="help-q">{item.q}</span>
                        <span className="help-a">{item.a}</span>
                      </div>
                    ))}
                  </div>
                  <div className="help-contact-cta">
                    <p>Still need help?</p>
                    <button className="help-contact-btn" onClick={() => { closeModal(); openModal('contact') }}>Contact Support</button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="help-intro">How can we help you?</p>
                  <div className="help-topics">
                    {HELP_TOPICS.map(topic => (
                      <button key={topic.id} className="help-topic-btn" onClick={() => handleHelpSelect(topic.id)}>
                        <span className="help-topic-icon">{topic.icon}</span>
                        <div className="help-topic-info">
                          <span className="help-topic-label">{topic.label}</span>
                          <span className="help-topic-preview">{topic.answers[0]}</span>
                        </div>
                        <span className="settings-item-arrow">›</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )
    }
    if (showModal === 'contact') {
      return (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="settings-modal contact-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Contact Us</h3>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <div className="contact-content">
              <div className="contact-info">
                <div className="contact-item"><span className="contact-icon"><IconPhone size={20} /></span><div className="contact-details"><label>Phone</label><a href="tel:9477503224" className="contact-value">9477503224</a></div></div>
                <div className="contact-item"><span className="contact-icon"><IconMail size={20} /></span><div className="contact-details"><label>Email</label><a href="mailto:gourabneogi7775@gmail.com" className="contact-value">gourabneogi7775@gmail.com</a></div></div>
              </div>
              <div className="contact-message">
                <p>For any support, queries, or technical issues, feel free to contact us. We're here to help.</p>
                <p className="contact-availability">Response within 24 hours</p>
              </div>
            </div>
          </div>
        </div>
      )
    }
    if (showModal === 'privacy') {
      return (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="settings-modal policy-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Privacy Policy</h3>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <div className="policy-content">
              {PRIVACY_POLICY.split('\n\n').map((section, i) => (
                <div key={i} className="policy-section"><h4>{section.split('\n')[0]}</h4><p>{section.split('\n').slice(1).join('\n')}</p></div>
              ))}
            </div>
          </div>
        </div>
      )
    }
    if (showModal === 'terms') {
      return (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="settings-modal policy-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Terms of Service</h3>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <div className="policy-content">
              {TERMS_OF_SERVICE.split('\n\n').map((section, i) => (
                <div key={i} className="policy-section"><h4>{section.split('\n')[0]}</h4><p>{section.split('\n').slice(1).join('\n')}</p></div>
              ))}
            </div>
          </div>
        </div>
      )
    }
    if (showModal === 'maincategories') {
      return (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="settings-modal mc-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Main Categories</h3>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <div className="mc-content">
              <div className="mc-add-row">
                <input
                  type="text"
                  value={newMainCatName}
                  onChange={e => setNewMainCatName(e.target.value)}
                  placeholder="New main category name..."
                  onKeyDown={e => e.key === 'Enter' && handleAddMainCategory()}
                />
                <button className="save-btn" onClick={handleAddMainCategory} disabled={typeof newMainCatName !== 'string' || !newMainCatName.trim()}>
                  + Add
                </button>
              </div>
              {mainCatLoading ? (
                <div className="mc-loading"><div className="loading-spinner"></div><p>Loading...</p></div>
              ) : mainCategories.length === 0 ? (
                <div className="mc-empty"><p>No main categories yet. Create one above.</p></div>
              ) : (
                <div className="mc-list">
                  {mainCategories.map((mc, idx) => (
                    <div key={mc.id} className="mc-item">
                      {editingMainCatId === mc.id ? (
                        <div className="mc-edit-row">
                          <input
                            type="text"
                            value={editMainCatName}
                            onChange={e => setEditMainCatName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSaveMainCategoryEdit(mc.id)}
                            autoFocus
                          />
                          <button className="mc-btn mc-btn-save" onClick={() => handleSaveMainCategoryEdit(mc.id)}>Save</button>
                          <button className="mc-btn mc-btn-cancel" onClick={() => setEditingMainCatId(null)}>Cancel</button>
                        </div>
                      ) : (
                        <>
                          <div className="mc-item-info">
                            <span className="mc-item-name">{mc.name}</span>
                            <span className="mc-item-order">Order: {mc.sort_order || idx + 1}</span>
                          </div>
                          <div className="mc-item-actions">
                            <button className="mc-btn mc-btn-edit" onClick={() => { setEditingMainCatId(mc.id); setEditMainCatName(mc.name) }}>Edit</button>
                            <button className="mc-btn mc-btn-delete" onClick={() => setDeleteMainCatTarget(mc)}>Delete</button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {deleteMainCatTarget && (
            <div className="mc-confirm-overlay" onClick={() => setDeleteMainCatTarget(null)}>
              <div className="mc-confirm-box" onClick={e => e.stopPropagation()}>
                <h4>Delete "{deleteMainCatTarget.name}"?</h4>
                <p>Categories under this group will keep their data but lose this main category.</p>
                <div className="modal-actions">
                  <button className="cancel-btn" onClick={() => setDeleteMainCatTarget(null)}>Cancel</button>
                  <button className="delete-btn" onClick={() => handleDeleteMainCategory(deleteMainCatTarget.id)}>Delete</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )
    }
    if (showModal === 'waiterrequesttypes') {
      return (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="settings-modal mc-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Waiter Request Types</h3>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <div className="mc-content">
              <div className="mc-add-row">
                <input
                  type="text"
                  value={newWrtName}
                  onChange={e => setNewWrtName(e.target.value)}
                  placeholder="New request type name..."
                  onKeyDown={e => e.key === 'Enter' && handleAddWaiterRequestType()}
                />
                <button className="save-btn" onClick={handleAddWaiterRequestType} disabled={typeof newWrtName !== 'string' || !newWrtName.trim()}>
                  + Add
                </button>
              </div>
              {wrtLoading ? (
                <div className="mc-loading"><div className="loading-spinner"></div><p>Loading...</p></div>
              ) : waiterRequestTypes.length === 0 ? (
                <div className="mc-empty"><p>No request types yet. Create one above.</p></div>
              ) : (
                <div className="mc-list">
                  {waiterRequestTypes.map((wrt, idx) => (
                    <div key={wrt.id} className="mc-item">
                      {editingWrtId === wrt.id ? (
                        <div className="mc-edit-row">
                          <input
                            type="text"
                            value={editWrtName}
                            onChange={e => setEditWrtName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSaveWaiterRequestTypeEdit(wrt.id)}
                            autoFocus
                          />
                          <button className="mc-btn mc-btn-save" onClick={() => handleSaveWaiterRequestTypeEdit(wrt.id)}>Save</button>
                          <button className="mc-btn mc-btn-cancel" onClick={() => setEditingWrtId(null)}>Cancel</button>
                        </div>
                      ) : (
                        <>
                          <div className="mc-item-info">
                            <span className="mc-item-name">{wrt.name}</span>
                            <span className="mc-item-order">Order: {wrt.sort_order || idx + 1}</span>
                          </div>
                          <div className="mc-item-actions">
                            <button
                              className={`mc-btn ${wrt.is_active ? 'mc-btn-active' : 'mc-btn-inactive'}`}
                              onClick={() => handleToggleWaiterRequestType(wrt.id, wrt.is_active)}
                              title={wrt.is_active ? 'Click to disable' : 'Click to enable'}
                            >
                              {wrt.is_active ? '✓' : '○'}
                            </button>
                            <button className="mc-btn mc-btn-edit" onClick={() => { setEditingWrtId(wrt.id); setEditWrtName(wrt.name) }}>Edit</button>
                            <button className="mc-btn mc-btn-up" onClick={() => handleMoveWrtUp(idx)} disabled={idx === 0}>↑</button>
                            <button className="mc-btn mc-btn-down" onClick={() => handleMoveWrtDown(idx)} disabled={idx >= waiterRequestTypes.length - 1}>↓</button>
                            <button className="mc-btn mc-btn-delete" onClick={() => setDeleteWrtTarget(wrt)}>Delete</button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {deleteWrtTarget && (
            <div className="mc-confirm-overlay" onClick={() => setDeleteWrtTarget(null)}>
              <div className="mc-confirm-box" onClick={e => e.stopPropagation()}>
                <h4>Delete "{deleteWrtTarget.name}"?</h4>
                <p>This action cannot be undone. Existing waiter calls using this type will keep their data.</p>
                <div className="modal-actions">
                  <button className="cancel-btn" onClick={() => setDeleteWrtTarget(null)}>Cancel</button>
                  <button className="delete-btn" onClick={() => handleDeleteWaiterRequestType(deleteWrtTarget.id)}>Delete</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )
    }
    if (showModal === 'taxes') {
      const activeCount = taxes.filter(t => t.is_enabled).length
      return (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="settings-modal mc-modal" style={{ maxWidth: '560px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Taxes</h3>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <div className="mc-content">
              <div className="mc-add-row" style={{ flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={newTaxName}
                  onChange={e => setNewTaxName(e.target.value)}
                  placeholder="Tax name (e.g. GST)..."
                  style={{ minWidth: '140px', flex: '2' }}
                  onKeyDown={e => e.key === 'Enter' && handleAddTax()}
                />
                <input
                  type="number"
                  value={newTaxPercentage}
                  onChange={e => setNewTaxPercentage(e.target.value)}
                  placeholder="%"
                  min="0"
                  max="100"
                  step="0.01"
                  style={{ minWidth: '70px', flex: '1', maxWidth: '90px' }}
                  onKeyDown={e => e.key === 'Enter' && handleAddTax()}
                />
                <select
                  value={newTaxType}
                  onChange={e => setNewTaxType(e.target.value)}
                  style={{ minWidth: '110px', flex: '1', padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text)', fontSize: '14px', cursor: 'pointer' }}
                >
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed</option>
                </select>
                <button className="save-btn" onClick={handleAddTax} disabled={typeof newTaxName !== 'string' || !newTaxName.trim() || isNaN(parseFloat(newTaxPercentage)) || parseFloat(newTaxPercentage) < 0 || parseFloat(newTaxPercentage) > 100}>
                  + Add
                </button>
              </div>
              {taxes.length === 0 ? (
                <div className="mc-empty"><p>No taxes configured. Add one above.</p></div>
              ) : (
                <div className="mc-list" style={{ maxHeight: '400px' }}>
                  {taxes.map((tax, idx) => (
                    <div key={tax.id} className="mc-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
                      {editingTaxId === tax.id ? (
                        <div className="mc-edit-row" style={{ flexWrap: 'wrap' }}>
                          <input
                            type="text"
                            value={editTaxName}
                            onChange={e => setEditTaxName(e.target.value)}
                            style={{ flex: '2', minWidth: '120px' }}
                            onKeyDown={e => e.key === 'Enter' && handleSaveTaxEdit(tax.id)}
                            autoFocus
                          />
                          <input
                            type="number"
                            value={editTaxPercentage}
                            onChange={e => setEditTaxPercentage(e.target.value)}
                            min="0"
                            max="100"
                            step="0.01"
                            style={{ flex: '1', minWidth: '60px', maxWidth: '80px' }}
                            onKeyDown={e => e.key === 'Enter' && handleSaveTaxEdit(tax.id)}
                          />
                          <select
                            value={editTaxType}
                            onChange={e => setEditTaxType(e.target.value)}
                            style={{ flex: '1', minWidth: '100px', padding: '8px 10px', background: 'var(--bg)', border: '1px solid var(--primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text)', fontSize: '13px', cursor: 'pointer' }}
                          >
                            <option value="percentage">Percentage</option>
                            <option value="fixed">Fixed</option>
                          </select>
                          <button className="mc-btn mc-btn-save" onClick={() => handleSaveTaxEdit(tax.id)}>Save</button>
                          <button className="mc-btn mc-btn-cancel" onClick={() => setEditingTaxId(null)}>Cancel</button>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', width: '100%' }}>
                            <div className="mc-item-info">
                              <span className="mc-item-name">{tax.tax_name}</span>
                              <span style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
                                <span>{tax.tax_percentage}%</span>
                                <span style={{ opacity: 0.3 }}>|</span>
                                <span style={{ textTransform: 'capitalize' }}>{tax.tax_type}</span>
                              </span>
                            </div>
                            <div className="mc-item-actions">
                              <button
                                className={`mc-btn ${tax.is_enabled ? 'mc-btn-active' : 'mc-btn-inactive'}`}
                                onClick={() => handleToggleTax(tax.id, tax.is_enabled)}
                                title={tax.is_enabled ? 'Click to disable' : 'Click to enable'}
                              >
                                {tax.is_enabled ? 'Enabled' : 'Disabled'}
                              </button>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', width: '100%' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Order: {tax.display_order || idx + 1}</span>
                            <div className="mc-item-actions">
                              <button className="mc-btn mc-btn-edit" onClick={() => { setEditingTaxId(tax.id); setEditTaxName(tax.tax_name); setEditTaxPercentage(String(tax.tax_percentage)); setEditTaxType(tax.tax_type) }}>Edit</button>
                              <button className="mc-btn mc-btn-up" onClick={() => handleMoveTaxUp(idx)} disabled={idx === 0}>↑</button>
                              <button className="mc-btn mc-btn-down" onClick={() => handleMoveTaxDown(idx)} disabled={idx >= taxes.length - 1}>↓</button>
                              <button className="mc-btn mc-btn-delete" onClick={() => setDeleteTaxTarget(tax)}>Delete</button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {deleteTaxTarget && (
            <div className="mc-confirm-overlay" onClick={() => setDeleteTaxTarget(null)}>
              <div className="mc-confirm-box" onClick={e => e.stopPropagation()}>
                <h4>Delete "{deleteTaxTarget.tax_name}"?</h4>
                <p>This action cannot be undone. Existing orders using this tax will keep their data.</p>
                <div className="modal-actions">
                  <button className="cancel-btn" onClick={() => setDeleteTaxTarget(null)}>Cancel</button>
                  <button className="delete-btn" onClick={() => handleDeleteTax(deleteTaxTarget.id)}>Delete</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )
    }
    if (showModal === 'currency') {
      const currentConfig = COUNTRY_CONFIGS.find(c => c.country_code === formData.country_code) || COUNTRY_CONFIGS[0]
      return (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="settings-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Currency & Region</h3>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <div className="currency-preview">
              <span className="currency-preview-label">Example:</span>
              <span className="currency-preview-value">
                {formatCurrency(299, currentConfig.locale, currentConfig.currency_code)}
              </span>
              <span className="currency-preview-detail">
                {currentConfig.currency_code} &middot; {currentConfig.locale}
              </span>
            </div>
            <form onSubmit={handleSaveCurrency}>
              <div className="form-group">
                <label>Country</label>
                <select
                  value={formData.country_code || ''}
                  onChange={e => {
                    const selected = COUNTRY_CONFIGS.find(c => c.country_code === e.target.value)
                    if (selected) {
                      setFormData({
                        country_code: selected.country_code,
                        currency_code: selected.currency_code,
                        currency_symbol: selected.currency_symbol,
                        locale: selected.locale,
                      })
                    }
                  }}
                >
                  {COUNTRY_CONFIGS.map(c => (
                    <option key={c.country_code} value={c.country_code}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="currency-readonly-fields">
                <div className="readonly-field">
                  <span className="readonly-label">Currency Code</span>
                  <span className="readonly-value">{formData.currency_code || '\u2014'}</span>
                </div>
                <div className="readonly-field">
                  <span className="readonly-label">Currency Symbol</span>
                  <span className="readonly-value">{formData.currency_symbol || '\u2014'}</span>
                </div>
                <div className="readonly-field">
                  <span className="readonly-label">Locale</span>
                  <span className="readonly-value">{formData.locale || '\u2014'}</span>
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={closeModal}>Cancel</button>
                <button type="submit" className="save-btn" disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</button>
              </div>
            </form>
          </div>
        </div>
      )
    }
    return null
  }

  if (restaurantLoading) {
    return (
      <div className="settings-page">
        <div className="settings-header">
          <h1 className="page-main-title">Settings</h1>
        </div>
        <div className="settings-loading">
          <div className="loading-spinner"></div>
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  const settingsSections = [
    {
      title: 'Business',
      items: [
        { icon: <IconStore size={20} />, label: 'Business Details', description: restaurantConfig?.name || 'Configure', onClick: () => openModal('business') },
        { icon: <IconImage size={20} />, label: 'Logo', description: restaurantConfig?.logo ? 'Set' : 'Not set', onClick: () => openModal('logo'), badge: restaurantConfig?.logo ? 'Set' : '' },
        { icon: <IconImage size={20} />, label: 'Background Video', description: 'Landing page video', onClick: () => openModal('bgvideo') }
      ]
    },
    {
      title: 'Currency & Region',
      items: [
        { icon: <IconDollarSign size={20} />, label: 'Currency & Region', description: (restaurantConfig?.currency_code || DEFAULT_CURRENCY.currency_code) + ' \u00B7 ' + (restaurantConfig?.currency_symbol || DEFAULT_CURRENCY.currency_symbol) + ' \u00B7 ' + (restaurantConfig?.locale || DEFAULT_CURRENCY.locale), onClick: () => openModal('currency') }
      ]
    },
    {
      title: 'Menu Organization',
      items: [
        { icon: <IconFolder size={20} />, label: 'Main Categories', description: 'Menu, Hookah, Drinks', onClick: () => openModal('maincategories') },
        { icon: <IconBell size={20} />, label: 'Waiter Request Types', description: 'Manage waiter options', onClick: () => openModal('waiterrequesttypes') }
      ]
    },
    {
      title: 'Taxes',
      items: [
        { icon: <IconDollarSign size={20} />, label: 'Taxes', description: 'Manage GST, VAT, Service Charge & more', onClick: () => openModal('taxes') }
      ]
    },
    {
      title: 'Preferences',
      items: [
        { icon: <IconBell size={20} />, label: 'Notifications', description: 'Sound & alerts', onClick: () => openModal('notifications') },
        { icon: <IconPalette size={20} />, label: 'Theme', description: preferences.theme === 'light' ? 'Light' : 'Dark', onClick: () => openModal('theme') }
      ]
    },
    {
      title: 'Privacy & Security',
      items: [
        { icon: <IconFileText size={20} />, label: 'Privacy Policy', description: 'Data handling', onClick: () => openModal('privacy') },
        { icon: <IconFileText size={20} />, label: 'Terms of Service', description: 'Usage terms', onClick: () => openModal('terms') }
      ]
    },
    {
      title: 'Support',
      items: [
        { icon: <IconHelpCircle size={20} />, label: 'Help Center', description: 'FAQs & support', onClick: () => openModal('help') },
        { icon: <IconPhone size={20} />, label: 'Contact Us', description: 'Get in touch', onClick: () => openModal('contact') },
        { icon: <IconInfo size={20} />, label: 'About', description: 'v1.0.0', onClick: () => showToast('Restaurant Dashboard v1.0.0') }
      ]
    }
  ]

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h1 className="page-main-title">Settings</h1>
      </div>

      <div className="settings-id-card">
        <div className="settings-id-icon"><IconStore size={24} /></div>
        <div className="settings-id-info">
          <span className="settings-id-label">Restaurant ID</span>
          <span className="settings-id-value">{(currentRestId || '').slice(0, 12)}...</span>
        </div>
        <button className="copy-id-btn" onClick={() => { navigator.clipboard.writeText(currentRestId || ''); showToast('ID copied') }}><IconCopy size={18} /></button>
      </div>

      <div className="settings-sections">
        {settingsSections.map((section, idx) => (
          <div key={idx} className="settings-section">
            <h3 className="settings-section-title">{section.title}</h3>
            <div className="settings-items">
              {section.items.map((item, itemIdx) => (
                <button key={itemIdx} className="settings-item" onClick={item.onClick}>
                  <span className="settings-item-icon">{item.icon}</span>
                  <div className="settings-item-content">
                    <span className="settings-item-label">{item.label}</span>
                    <span className="settings-item-desc">{item.description}</span>
                  </div>
                  {item.badge && <span className={`settings-badge ${item.badge === 'Set' ? 'success' : ''}`}>{item.badge}</span>}
                  <span className="settings-item-arrow">›</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="settings-logout-section">
        <button className="settings-logout-btn" onClick={handleLogout}>
          <span className="settings-item-icon"><IconLogOut size={20} /></span>
          <span className="settings-logout-text">Logout</span>
          <span className="settings-item-arrow">›</span>
        </button>
      </div>

      <div className="settings-footer">
        <p className="settings-version">Restaurant Dashboard v1.0.0</p>
      </div>

      {renderModal()}
    </div>
  )
}
