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
      const { data, error } = await supabase
        .from('featured_items')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('is_active', true)
        .order('display_order', { ascending: true })

      if (error) {
        setError(error.message)
        setFeaturedItems([])
      } else {
        setFeaturedItems(data || [])
        setError(null)
      }

      setLoading(false)
    }

    fetchFeaturedItems()
  }, [restaurantId])

  const handleFeaturedClick = (item) => {
    if (!item.redirect_url) return

    if (item.redirect_url.startsWith('#')) {
      const targetId = item.redirect_url.substring(1)
      const el = document.getElementById(targetId) || document.querySelector(item.redirect_url)

      if (el) {
        const offset = 80
        const top = el.getBoundingClientRect().top + window.scrollY - offset
        window.scrollTo({
          top,
          behavior: 'smooth'
        })
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