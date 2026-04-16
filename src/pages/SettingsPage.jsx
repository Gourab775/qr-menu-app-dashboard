import { useState, useEffect } from 'react'
import { supabase, RESTAURANT_ID } from '../lib/supabase'

const SOUND_OPTIONS = [
  { id: 'beep', name: 'Default Beep', freq: [800, 1000], duration: 0.3 },
  { id: 'chime', name: 'Soft Chime', freq: [600, 800, 1000], duration: 0.5 },
  { id: 'bell', name: 'Bell Ring', freq: [500, 700], duration: 0.6 },
  { id: 'alert', name: 'Alert Tone', freq: [1000, 1200, 800], duration: 0.4 },
  { id: 'digital', name: 'Digital Ping', freq: [1500, 2000], duration: 0.2 },
  { id: 'pop', name: 'Notification Pop', freq: [400, 600], duration: 0.25 },
  { id: 'ding', name: 'Classic Ding', freq: [700, 900], duration: 0.35 },
  { id: 'subtle', name: 'Subtle Click', freq: [300], duration: 0.15 },
  { id: 'triple', name: 'Triple Alert', freq: [800, 800, 800], duration: 0.45 },
  { id: ' ascend', name: 'Ascending Tone', freq: [400, 600, 800], duration: 0.4 }
]

const HELP_TOPICS = [
  { id: 'orders', icon: '📦', label: 'Order Issues', keywords: ['order', 'orders', 'not showing', 'missing'], answers: [
    'Check your internet connection and refresh the Live Orders page',
    'New orders appear automatically when received - ensure you are logged in',
    'If orders still don\'t show, try clearing browser cache and logging in again'
  ]},
  { id: 'payment', icon: '💳', label: 'Payment Problems', keywords: ['payment', 'pay', 'upi', 'qr'], answers: [
    'Verify payment settings in Settings > Payment Settings',
    'For counter orders, ensure customer pays at the counter',
    'Contact customer for UPI payment confirmation'
  ]},
  { id: 'dashboard', icon: '📊', label: 'Dashboard Help', keywords: ['dashboard', 'how', 'use', 'app', 'help'], answers: [
    'Live Orders: Accept or decline incoming orders',
    'Analytics: View sales performance and reports',
    'Menu Items: Manage your food menu and categories',
    'Use sidebar to navigate between sections'
  ]},
  { id: 'technical', icon: '⚙️', label: 'Technical Errors', keywords: ['error', 'bug', 'technical', 'issue'], answers: [
    'Refresh the page to resolve minor display issues',
    'Check console for error messages',
    'Contact support with screenshot of the error'
  ]},
  { id: 'notifications', icon: '🔔', label: 'Notification Issues', keywords: ['notification', 'sound', 'alert', 'bell'], answers: [
    'Make sure sound is enabled in Settings > Notifications',
    'Check if browser notifications are allowed',
    'Try selecting a different notification sound'
  ]},
  { id: 'login', icon: '🔑', label: 'Login Problems', keywords: ['login', 'password', 'forgot', 'access'], answers: [
    'Default password is: 1234',
    'Clear browser cache and try logging in again',
    'Contact support if you cannot access your account'
  ]},
  { id: 'qrcode', icon: '⬛', label: 'QR Code Issues', keywords: ['qr', 'code', 'scan', 'payment'], answers: [
    'Ensure QR code image is hosted on a public URL',
    'Use Settings > Payment Settings to update QR code',
    'Test the QR code by scanning with a phone'
  ]},
  { id: 'menu', icon: '🍽️', label: 'Menu Items', keywords: ['menu', 'item', 'add', 'delete', 'edit'], answers: [
    'Go to Menu Items in sidebar to add new items',
    'Click on an item to edit its details',
    'Use categories to organize your menu'
  ]},
  { id: 'categories', icon: '📂', label: 'Category Management', keywords: ['category', 'category', 'organize', 'group'], answers: [
    'Navigate to Categories to create new categories',
    'Assign menu items to categories for better organization',
    'Categories appear in the order you set'
  ]},
  { id: 'orders_accept', icon: '✅', label: 'Accepting Orders', keywords: ['accept', 'confirm', 'approve'], answers: [
    'Click Accept button on pending orders',
    'Accepted orders show in green with confirmation',
    'Once accepted, order moves to active status'
  ]},
  { id: 'orders_decline', icon: '❌', label: 'Declining Orders', keywords: ['decline', 'reject', 'cancel'], answers: [
    'Click Decline button on pending orders',
    'Declined orders are permanently removed',
    'This action cannot be undone'
  ]},
  { id: 'timeout', icon: '⏱️', label: 'Auto-Decline Timeout', keywords: ['timeout', 'auto', 'decline', 'pending'], answers: [
    'Set timeout in Settings > Auto-Decline',
    'Pending orders auto-decline after set time',
    'Options: 5, 10, 15, 20, or 30 minutes'
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
  payment: {
    title: 'Payment Problems',
    description: 'Issues with payments and QR codes',
    answers: [
      { q: 'How to configure payment QR?', a: 'Go to Settings > Payment Settings and add your QR code image URL (must be publicly accessible).' },
      { q: 'Customer paid but order shows unpaid?', a: 'For counter orders, manually confirm payment. For UPI, wait for bank notification.' },
      { q: 'Payment not working?', a: 'Verify your payment settings and ensure the QR code is accessible via public URL.' },
      { q: 'What payment modes are supported?', a: 'Online (UPI) and Counter (Pay at Counter) modes are supported.'
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
      { q: 'No sound on new orders?', a: 'Go to Settings > Notifications and enable Sound Alerts. Also check your device volume.' },
      { q: 'Sound not playing?', a: 'Click anywhere on the page first to initialize audio. Some browsers require user interaction.' },
      { q: 'How to change notification sound?', a: 'Go to Settings > Notifications > Notification Sound to preview and select a sound.' },
      { q: 'Can I disable notifications?', a: 'Yes, toggle off Sound Alerts or Order Notifications in Settings.' }
    ]
  },
  login: {
    title: 'Login Problems',
    description: 'Access and authentication issues',
    answers: [
      { q: 'What is the default password?', a: 'The default password is: 1234' },
      { q: 'Forgot password, what to do?', a: 'Contact support for password reset assistance.' },
      { q: 'Session expired repeatedly?', a: 'Clear browser cache and ensure cookies are enabled.' },
      { q: 'Can I change my password?', a: 'Yes, go to Settings > Change Password to update your password.' }
    ]
  },
  qrcode: {
    title: 'QR Code Issues',
    description: 'Payment QR code troubleshooting',
    answers: [
      { q: 'How to add payment QR?', a: 'Go to Settings > Payment Settings and enter the URL of your QR code image.' },
      { q: 'QR code not showing?', a: 'Ensure the image URL is publicly accessible (not behind login).' },
      { q: 'Customer cannot scan QR?', a: 'Test the QR code yourself with a phone scanner. Ensure image is clear.' },
      { q: 'Remove payment QR?', a: 'Clear the QR URL field and save to remove payment option.' }
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
      { q: 'Why would I decline?', a: 'Common reasons: item unavailable, kitchen closed, customer requested cancellation.' }
    ]
  },
  timeout: {
    title: 'Auto-Decline Timeout',
    description: 'Automatic order timeout settings',
    answers: [
      { q: 'What is auto-decline?', a: 'Orders pending beyond set time are automatically declined.' },
      { q: 'Set timeout duration?', a: 'Go to Settings > Auto-Decline and choose 5/10/15/20/30 minutes.' },
      { q: 'Disable auto-decline?', a: 'Set timeout to maximum (30 min) or contact support to disable.' },
      { q: 'Why use auto-decline?', a: 'Prevents stale orders from cluttering your dashboard and ensures fresh orders.' }
    ]
  }
}

const PRIVACY_POLICY = `Data Collection
We collect the following information:
 Restaurant details (name, address, contact)
 Order information (items, prices, payment mode)
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

Payment Terms
 All payments are processed through third-party providers
 We do not store payment credentials
 Payment disputes should be handled with the payment provider

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
  const [restaurant, setRestaurant] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showModal, setShowModal] = useState(null)
  const [formData, setFormData] = useState({})
  const [helpTopic, setHelpTopic] = useState(null)
  const [passwordErrors, setPasswordErrors] = useState({})
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  })

  const currentRestId = restaurantId || RESTAURANT_ID

  const showToast = (message, type = 'success') => {
    if (onToast) {
      onToast(message, type)
    }
  }

  useEffect(() => {
    loadRestaurant()
  }, [])

  const loadRestaurant = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('restaurants')
        .select('*')
        .eq('id', currentRestId)
        .single()

      if (error && error.code !== 'PGRST116') {
        console.warn('Restaurant not found, using defaults')
      }
      
      if (data) {
        setRestaurant(data)
      } else {
        setRestaurant({
          id: currentRestId,
          name: 'Your Restaurant',
          slug: '',
          address: '',
          phone: '',
          contact_number: '',
          email: '',
          logo: ''
        })
      }
    } catch (err) {
      console.error('Failed to load restaurant:', err)
      setRestaurant({
        id: RESTAURANT_ID,
        name: 'Your Restaurant',
        slug: '',
        address: '',
        phone: '',
        contact_number: '',
        email: '',
        logo: ''
      })
    } finally {
      setLoading(false)
    }
  }

  const refreshRestaurant = async () => {
    const { data } = await supabase
      .from('restaurants')
      .select('*')
      .eq('id', RESTAURANT_ID)
      .single()
    
    if (data) {
      setRestaurant(data)
    }
  }

  const updatePreference = async (key, value) => {
    const newPrefs = { ...preferences, [key]: value }
    setPreferences(newPrefs)
    localStorage.setItem('dashboard_preferences', JSON.stringify(newPrefs))
    showToast(key === 'soundEnabled' ? (value ? 'Sound enabled' : 'Sound disabled') : 
                   key === 'orderNotifications' ? (value ? 'Notifications enabled' : 'Notifications disabled') : 'Settings saved')
  }

  const playSoundPreview = (soundId) => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      const ctx = new AudioContext()
      
      const sound = SOUND_OPTIONS.find(s => s.id === soundId)
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

  const clearLocalData = () => {
    if (window.confirm('This will clear all local data. Continue?')) {
      localStorage.clear()
      showToast('Local data cleared')
      window.location.reload()
    }
  }

  const openModal = (modalName) => {
    setShowModal(modalName)
    setHelpTopic(null)
    
    if (modalName === 'business' && restaurant) {
      setFormData({
        name: restaurant.name || '',
        slug: restaurant.slug || '',
        address: restaurant.address || '',
        phone: restaurant.phone || restaurant.contact_number || '',
        email: restaurant.email || '',
        logo: restaurant.logo || ''
      })
    } else if (modalName === 'logo' && restaurant) {
      setFormData({
        logo: restaurant.logo || ''
      })
    } else if (modalName === 'payments' && restaurant) {
      setFormData({
        payment_id: restaurant.payment_id || ''
      })
    } else if (modalName === 'changepassword') {
      setFormData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      })
      setPasswordErrors({})
    }
  }

  const closeModal = () => {
    setShowModal(null)
    setFormData({})
    setHelpTopic(null)
    setPasswordErrors({})
  }

const handlePasswordChange = async (e) => {
    e.preventDefault()
    const { currentPassword, newPassword, confirmPassword } = formData
    const errors = {}

    if (!currentPassword || currentPassword.trim() === '') {
      errors.currentPassword = 'Current password is required'
    }
    if (!newPassword || newPassword.trim() === '') {
      errors.newPassword = 'New password is required'
    } else if (newPassword.length < 6) {
      errors.newPassword = 'Password must be at least 6 characters'
    }
    if (!confirmPassword || confirmPassword.trim() === '') {
      errors.confirmPassword = 'Please confirm your password'
    } else if (newPassword !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match'
    }

    if (Object.keys(errors).length > 0) {
      setPasswordErrors(errors)
      return
    }

    setSaving(true)
    setPasswordErrors({})

    try {
      console.log('[Password Change] Verifying Supabase session...')
      
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError) {
        console.warn('[Password Change] Session check error:', sessionError.message)
      }
       
      if (!session) {
        showToast('Session expired. Please login again.', 'error')
        handleLogout(true)
        return
      }

      console.log('[Password Change] Session verified, user:', session.user?.email)
      console.log('[Password Change] Updating password via Supabase...')
      
      const userEmail = session.user?.email
      
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: currentPassword
      })

      console.log('[Password Change] Re-auth response:', { 
        user: signInData?.user?.email, 
        hasSession: !!signInData?.session,
        error: signInError?.message 
      })

      if (signInError) {
        console.error('[Password Change] Re-authentication failed:', signInError.message)
        setPasswordErrors({ currentPassword: 'Current password is incorrect' })
        setSaving(false)
        return
      }
      
      console.log('[Password Change] Updating password via Supabase updateUser...')
      
      const { data: updateData, error: updateError } = await supabase.auth.updateUser({ 
        password: newPassword 
      })

      console.log('[Password Change] Update response:', { 
        user: updateData?.user?.email, 
        updated: !!updateData?.user,
        error: updateError?.message 
      })

      if (updateError) {
        console.error('[Password Change] Supabase update failed:', updateError.message)
        setPasswordErrors({ general: 'Failed to update password: ' + updateError.message })
        setSaving(false)
        return
      }
      
      console.log('[Password Change] Password updated in Supabase successfully!')
      
      showToast('Password updated successfully')
      closeModal()
      setFormData({})
      
      console.log('[Password Change] Step 3: Signing out from Supabase...')
      
      await supabase.auth.signOut()
      console.log('[Password Change] Signed out from Supabase')
      
      localStorage.removeItem('dashboard_auth')
      localStorage.removeItem('dashboard_password')
      localStorage.removeItem('dashboard_preferences')
      
      showToast('Password updated. Please login with new password.')
      closeModal()
      
      setTimeout(() => {
        console.log('[Password Change] Redirecting to login...')
        window.location.href = '/'
      }, 1500)
      
    } catch (err) {
      console.error('[Password Change] Error:', err)
      setPasswordErrors({ general: 'An unexpected error occurred' })
    } finally {
      setSaving(false)
    }
  }

  const handleLogout = async (forceLogout = false) => {
    if (forceLogout || window.confirm('Are you sure you want to logout?')) {
      try {
        localStorage.removeItem('dashboard_auth')
        localStorage.removeItem('dashboard_password')
        localStorage.removeItem('dashboard_preferences')
        showToast('Logged out successfully')
        window.location.href = '/'
      } catch (err) {
        console.error('Logout error:', err)
        window.location.href = '/'
      }
    }
  }

  const handleHelpSelect = (topicId) => {
    setHelpTopic(topicId)
  }

  const validateSlug = (slug) => {
    if (!slug || slug.trim() === '') return true
    return /^[a-z0-9-]+$/.test(slug.trim())
  }

  const handleSaveRestaurant = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const { name, slug, address, phone, email, logo } = formData
      
      if (!name || name.trim() === '') {
        showToast('Restaurant name is required', 'error')
        setSaving(false)
        return
      }

      if (slug && !validateSlug(slug)) {
        showToast('Invalid slug. Use lowercase letters, numbers, and hyphens only', 'error')
        setSaving(false)
        return
      }

      const { error } = await supabase
        .from('restaurants')
        .upsert({ 
          id: currentRestId, 
          name: name.trim(), 
          slug: slug?.trim() || null,
          address: address?.trim() || null, 
          phone: phone?.trim() || null,
          contact_number: phone?.trim() || null,
          email: email?.trim() || null,
          logo: logo?.trim() || null
        }, { onConflict: 'id' })

      if (error) throw error
      
      await refreshRestaurant()
      showToast('Business details saved')
      closeModal()
    } catch (err) {
      console.error('Save error:', err)
      showToast('Failed to save: ' + (err.message || 'Unknown error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleSavePayments = async (e) => {
    e.preventDefault()
    const { payment_id } = formData
    const paymentId = payment_id?.trim() || ''

    setSaving(true)
    try {
      const { error } = await supabase
        .from('restaurants')
        .upsert({ 
          id: currentRestId, 
          upi_id: null,
          payment_id: paymentId 
        }, { onConflict: 'id' })

      if (error) throw error
      
      await refreshRestaurant()
      showToast('Payment settings saved')
      closeModal()
    } catch (err) {
      console.error('Payment save error:', err)
      showToast('Failed to save: ' + (err.message || 'Unknown error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveLogo = async (e) => {
    e.preventDefault()
    const logoUrl = formData.logo?.trim() || ''
    
    if (logoUrl && !/^(https?:\/\/)/.test(logoUrl)) {
      showToast('Logo must be a valid URL', 'error')
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase
        .from('restaurants')
        .upsert({ id: RESTAURANT_ID, logo: logoUrl }, { onConflict: 'id' })

      if (error) throw error
      
      await refreshRestaurant()
      showToast(logoUrl ? 'Logo saved' : 'Logo cleared')
      closeModal()
    } catch (err) {
      showToast('Failed to save', 'error')
    } finally {
      setSaving(false)
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
            <form onSubmit={handleSaveRestaurant}>
              <div className="form-group">
                <label>Restaurant Name *</label>
                <input type="text" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Enter restaurant name" required />
              </div>
              <div className="form-group">
                <label>Slug (URL)</label>
                <input type="text" value={formData.slug || ''} onChange={e => setFormData({ ...formData, slug: e.target.value.toLowerCase() })} placeholder="e.g., my-restaurant" />
              </div>
              <div className="form-group">
                <label>Address</label>
                <textarea value={formData.address || ''} onChange={e => setFormData({ ...formData, address: e.target.value })} placeholder="Enter address" rows={2} />
              </div>
              <div className="form-group">
                <label>Phone Number</label>
                <input type="tel" value={formData.phone || ''} onChange={e => setFormData({ ...formData, phone: e.target.value })} placeholder="Enter phone number" />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={formData.email || ''} onChange={e => setFormData({ ...formData, email: e.target.value })} placeholder="Enter email" />
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
    if (showModal === 'payments') {
      return (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="settings-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Payment Settings</h3>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <form onSubmit={handleSavePayments}>
              <div className="form-group">
                <label>QR Code Image URL</label>
                <input type="text" value={formData.payment_id || ''} onChange={e => setFormData({ ...formData, payment_id: e.target.value })} placeholder="https://..." />
                <span className="input-hint">Link to payment QR code image</span>
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
                <label>Logo URL</label>
                <input type="url" value={formData.logo || ''} onChange={e => setFormData({ ...formData, logo: e.target.value })} placeholder="https://example.com/logo.png" />
              </div>
              {restaurant?.logo && <div className="logo-preview"><img src={restaurant.logo} alt="Logo preview" onError={(e) => e.target.style.display = 'none'} /></div>}
              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={closeModal}>Cancel</button>
                <button type="submit" className="save-btn" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
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
                  <span className="toggle-label">Sound Alerts</span>
                  <span className="toggle-desc">Play sound for new orders</span>
                </div>
                <button className={`toggle-switch ${preferences.soundEnabled ? 'active' : ''}`} onClick={() => updatePreference('soundEnabled', !preferences.soundEnabled)}><span className="toggle-knob" /></button>
              </div>
              <div className="toggle-item">
                <div className="toggle-info">
                  <span className="toggle-label">Order Notifications</span>
                  <span className="toggle-desc">Show alerts for pending orders</span>
                </div>
                <button className={`toggle-switch ${preferences.orderNotifications ? 'active' : ''}`} onClick={() => updatePreference('orderNotifications', !preferences.orderNotifications)}><span className="toggle-knob" /></button>
              </div>
            </div>
            <div className="notification-info">
              <button className="sound-select-btn" onClick={() => setShowModal('soundPicker')}>
                <span>🔔 Notification Sound</span>
                <span className="sound-current">{SOUND_OPTIONS.find(s => s.id === preferences.notificationSound)?.name || 'Default Beep'}</span>
              </button>
            </div>
          </div>
        </div>
      )
    }
    if (showModal === 'soundPicker') {
      return (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="settings-modal sound-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Notification Sound</h3>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <div className="sound-options">
              {SOUND_OPTIONS.map(sound => (
                <button key={sound.id} className={`sound-option ${preferences.notificationSound === sound.id ? 'active' : ''}`} onClick={() => { updatePreference('notificationSound', sound.id); playSoundPreview(sound.id); }}>
                  <span className="sound-name">{sound.name}</span>
                  {preferences.notificationSound === sound.id && <span className="sound-check">✓</span>}
                </button>
              ))}
            </div>
            <div className="sound-preview-note"><p>Tap to preview and select</p></div>
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
              <button className="theme-option active"><div className="theme-preview dark"></div><div className="theme-info"><span className="theme-name">Default Dark</span><span className="theme-desc">Dark mode (current)</span></div></button>
              <button className="theme-option disabled" disabled><div className="theme-preview light"></div><div className="theme-info"><span className="theme-name">Light Mode</span><span className="theme-desc">Coming soon</span></div></button>
              <button className="theme-option disabled" disabled><div className="theme-preview system"></div><div className="theme-info"><span className="theme-name">System</span><span className="theme-desc">Coming soon</span></div></button>
            </div>
          </div>
        </div>
      )
    }
    if (showModal === 'autodecline') {
      return (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="settings-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Auto-Decline Timeout</h3>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <div className="timeout-options">
              <p className="timeout-desc">Automatically decline orders that remain pending for:</p>
              {[5, 10, 15, 20, 30].map(mins => (
                <button key={mins} className={`timeout-btn ${preferences.autoDeclineTimeout === mins ? 'active' : ''}`} onClick={() => updatePreference('autoDeclineTimeout', mins)}>{mins} min</button>
              ))}
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
    if (showModal === 'changepassword') {
      return (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="settings-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Change Password</h3>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <form onSubmit={handlePasswordChange}>
              <div className="form-group">
                <label>Current Password</label>
                <div className="password-input-wrapper">
                  <input 
                    type={showPasswords.current ? 'text' : 'password'} 
                    value={formData.currentPassword || ''} 
                    onChange={e => setFormData({ ...formData, currentPassword: e.target.value })} 
                    placeholder="Enter current password"
                    className={passwordErrors.currentPassword ? 'error' : ''}
                    autoComplete="current-password"
                  />
                  <button 
                    type="button" 
                    className="password-toggle"
                    onClick={() => setShowPasswords(prev => ({ ...prev, current: !prev.current }))}
                  >
                    {showPasswords.current ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
                {passwordErrors.currentPassword && <span className="form-error">{passwordErrors.currentPassword}</span>}
              </div>
              <div className="form-group">
                <label>New Password</label>
                <div className="password-input-wrapper">
                  <input 
                    type={showPasswords.new ? 'text' : 'password'} 
                    value={formData.newPassword || ''} 
                    onChange={e => setFormData({ ...formData, newPassword: e.target.value })} 
                    placeholder="Enter new password (min 6 characters)"
                    className={passwordErrors.newPassword ? 'error' : ''}
                    autoComplete="new-password"
                  />
                  <button 
                    type="button" 
                    className="password-toggle"
                    onClick={() => setShowPasswords(prev => ({ ...prev, new: !prev.new }))}
                  >
                    {showPasswords.new ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
                {passwordErrors.newPassword && <span className="form-error">{passwordErrors.newPassword}</span>}
              </div>
              <div className="form-group">
                <label>Confirm Password</label>
                <div className="password-input-wrapper">
                  <input 
                    type={showPasswords.confirm ? 'text' : 'password'} 
                    value={formData.confirmPassword || ''} 
                    onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })} 
                    placeholder="Confirm new password"
                    className={passwordErrors.confirmPassword ? 'error' : ''}
                    autoComplete="new-password"
                  />
                  <button 
                    type="button" 
                    className="password-toggle"
                    onClick={() => setShowPasswords(prev => ({ ...prev, confirm: !prev.confirm }))}
                  >
                    {showPasswords.confirm ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
                {passwordErrors.confirmPassword && <span className="form-error">{passwordErrors.confirmPassword}</span>}
              </div>
              {passwordErrors.general && (
                <div className="form-group">
                  <span className="form-error">{passwordErrors.general}</span>
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={closeModal}>Cancel</button>
                <button type="submit" className="save-btn" disabled={saving}>
                  {saving ? 'Verifying...' : 'Update Password'}
                </button>
              </div>
            </form>
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
                <div className="contact-item"><span className="contact-icon">📞</span><div className="contact-details"><label>Phone</label><a href="tel:9477503224" className="contact-value">9477503224</a></div></div>
                <div className="contact-item"><span className="contact-icon">📧</span><div className="contact-details"><label>Email</label><a href="mailto:gourabneogi7775@gmail.com" className="contact-value">gourabneogi7775@gmail.com</a></div></div>
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
    return null
  }

  if (loading) {
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
        { icon: '🏪', label: 'Business Details', description: restaurant?.name || 'Configure', onClick: () => openModal('business') },
        { icon: '🖼️', label: 'Logo', description: restaurant?.logo ? 'Set' : 'Not set', onClick: () => openModal('logo'), badge: restaurant?.logo ? 'Set' : '' }
      ]
    },
    {
      title: 'Payments',
      items: [
        { icon: '💳', label: 'Payment Settings', description: 'QR code configuration', onClick: () => openModal('payments') }
      ]
    },
    {
      title: 'Preferences',
      items: [
        { icon: '🔔', label: 'Notifications', description: 'Sound & alerts', onClick: () => openModal('notifications'), badge: preferences.soundEnabled ? 'On' : 'Off' },
        { icon: '🎨', label: 'Theme', description: preferences.theme === 'default' ? 'Default Dark' : preferences.theme, onClick: () => openModal('theme') },
        { icon: '⏱️', label: 'Auto-Decline', description: `${preferences.autoDeclineTimeout} min`, onClick: () => openModal('autodecline') }
      ]
    },
    {
      title: 'Privacy & Security',
      items: [
        { icon: '🔒', label: 'Change Password', description: 'Update your password', onClick: () => openModal('changepassword') },
        { icon: '📜', label: 'Privacy Policy', description: 'Data handling', onClick: () => openModal('privacy') },
        { icon: '📄', label: 'Terms of Service', description: 'Usage terms', onClick: () => openModal('terms') },
        { icon: '🗑️', label: 'Clear Data', description: 'Reset local data', onClick: clearLocalData }
      ]
    },
    {
      title: 'Support',
      items: [
        { icon: '❓', label: 'Help Center', description: 'FAQs & support', onClick: () => openModal('help') },
        { icon: '📞', label: 'Contact Us', description: 'Get in touch', onClick: () => openModal('contact') },
        { icon: 'ℹ️', label: 'About', description: 'v1.0.0', onClick: () => showToast('Restaurant Dashboard v1.0.0') }
      ]
    }
  ]

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h1 className="page-main-title">Settings</h1>
      </div>

      <div className="settings-id-card">
        <div className="settings-id-icon">🏪</div>
        <div className="settings-id-info">
          <span className="settings-id-label">Restaurant ID</span>
          <span className="settings-id-value">{RESTAURANT_ID.slice(0, 12)}...</span>
        </div>
        <button className="copy-id-btn" onClick={() => { navigator.clipboard.writeText(RESTAURANT_ID); showToast('ID copied') }}>📋</button>
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
          <span className="settings-item-icon">🚪</span>
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
