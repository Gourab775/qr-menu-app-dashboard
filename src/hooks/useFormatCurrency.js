import { useRestaurant } from '../contexts/RestaurantContext'

export function useFormatCurrency() {
  const { formatCurrency } = useRestaurant()
  return formatCurrency
}