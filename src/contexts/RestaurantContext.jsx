import { createContext, useContext, useEffect, useMemo } from 'react'
import { formatCurrency, DEFAULT_CURRENCY } from '../utils/formatCurrency'
import { useAuth } from './AuthContext'

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
    updated_at: restaurant.updated_at,
  }
}

export function RestaurantProvider({ children }) {
  const { restaurant, restaurantId, initialized: authInitialized, session, refreshRestaurant } = useAuth()

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

  const value = {
    restaurantConfig,
    loading,
    error: !loading && isLoggedIn && !!restaurantId && !restaurantConfig ? 'Restaurant configuration not available' : null,
    refreshRestaurantConfig: refreshRestaurant,
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
