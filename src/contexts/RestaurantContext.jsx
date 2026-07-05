import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { formatCurrency, DEFAULT_CURRENCY } from '../utils/formatCurrency'
import { useAuth } from './AuthContext'
import { supabase } from '../lib/supabase'

const RestaurantContext = createContext(null)

function buildConfig(restaurant) {
  if (!restaurant) return null
  return {
    id: restaurant.id || null,
    name: restaurant.name || '',
    slug: restaurant.slug || '',
    plan: String(restaurant.plan || 'plus').trim().toLowerCase(),
    country_code: restaurant.country_code || DEFAULT_CURRENCY.country_code,
    currency_code: restaurant.currency_code || DEFAULT_CURRENCY.currency_code,
    currency_symbol: restaurant.currency_symbol || DEFAULT_CURRENCY.currency_symbol,
    locale: restaurant.locale || DEFAULT_CURRENCY.locale,
    contact_number: restaurant.contact_number || '',
    logo: restaurant.logo || '',
    created_at: restaurant.created_at,
  }
}

export function RestaurantProvider({ children }) {
  const { restaurant, restaurantId, initialized: authInitialized, session, refreshRestaurant } = useAuth()
  const [taxes, setTaxes] = useState([])
  const [taxesLoading, setTaxesLoading] = useState(false)
  const taxesFetchedRef = useRef(null)

  const isLoggedIn = !!session

  const restaurantConfig = useMemo(() => {
    if (!isLoggedIn || !restaurantId || !restaurant) return null
    return buildConfig(restaurant)
  }, [isLoggedIn, restaurantId, restaurant])

  const loading = authInitialized && isLoggedIn && !!restaurantId && !restaurantConfig

  const formatCurrencyBound = useMemo(() => {
    return (amount) => {
      if (!restaurantConfig) return formatCurrency(amount)
      return formatCurrency(amount, restaurantConfig.locale, restaurantConfig.currency_code)
    }
  }, [restaurantConfig])

  const fetchTaxes = useCallback(async () => {
    if (!restaurantId) return
    if (taxesFetchedRef.current === restaurantId) return
    taxesFetchedRef.current = restaurantId
    setTaxesLoading(true)
    try {
      const { data } = await supabase
        .from('restaurant_taxes')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('display_order', { ascending: true })
      if (data) setTaxes(data)
    } catch (err) {
      console.error('[RestaurantContext] Failed to fetch taxes:', err.message)
    } finally {
      setTaxesLoading(false)
    }
  }, [restaurantId])

  useEffect(() => {
    if (restaurantId && restaurantConfig) {
      fetchTaxes()
    }
  }, [restaurantId, restaurantConfig, fetchTaxes])

  const refreshTaxes = useCallback(async () => {
    taxesFetchedRef.current = null
    await fetchTaxes()
  }, [fetchTaxes])

  const value = {
    restaurantConfig,
    taxes,
    taxesLoading,
    loading,
    error: !loading && isLoggedIn && !!restaurantId && !restaurantConfig ? 'Restaurant configuration not available' : null,
    refreshRestaurantConfig: refreshRestaurant,
    refreshTaxes,
    formatCurrency: formatCurrencyBound,
  }

  return (
    <RestaurantContext.Provider value={value}>
      {children}
    </RestaurantContext.Provider>
  )
}

export function useRestaurant() {
  const context = useContext(RestaurantContext)
  if (!context) {
    throw new Error('useRestaurant must be used within RestaurantProvider')
  }
  return context
}

export default RestaurantContext
