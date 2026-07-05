import { useAuth } from '../contexts/AuthContext'
import { formatCurrency, DEFAULT_CURRENCY } from '../utils/formatCurrency'

export function useFormatCurrency() {
  const { restaurantCurrency = DEFAULT_CURRENCY } = useAuth()
  return (amount) => formatCurrency(amount, restaurantCurrency.locale, restaurantCurrency.currency_code)
}
