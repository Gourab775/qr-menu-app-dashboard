import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export const useFeaturedItems = (restaurantId) => {
  const [featuredItems, setFeaturedItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!restaurantId) {
      setLoading(false)
      return
    }

    const fetchFeaturedItems = async () => {
      console.log('Fetching featured items for:', restaurantId)

      const { data, error } = await supabase
        .from('featured_items')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('is_active', true)
        .order('display_order', { ascending: true })

      if (error) {
        console.error('Featured items error:', error.message)
        setError(error.message)
        setFeaturedItems([])
      } else {
        console.log('Featured items:', data)
        setFeaturedItems(data || [])
        setError(null)
      }

      setLoading(false)
    }

    fetchFeaturedItems()
  }, [restaurantId])

  const handleFeaturedClick = (item) => {
    if (!item.redirect_url) {
      console.log('No redirect URL set for this item')
      return
    }

    console.log('Featured item clicked:', item.redirect_url)

    if (item.redirect_url.startsWith('#')) {
      const targetId = item.redirect_url.substring(1)
      console.log('Looking for element:', targetId)

      const el = document.getElementById(targetId) || document.querySelector(item.redirect_url)

      if (el) {
        const offset = 80
        const top = el.getBoundingClientRect().top + window.scrollY - offset

        console.log('Scrolling to:', top)

        window.scrollTo({
          top,
          behavior: 'smooth'
        })
      } else {
        console.warn('Element not found:', targetId)
      }
    }
  }

  return {
    featuredItems,
    loading,
    error,
    handleFeaturedClick
  }
}

export default useFeaturedItems