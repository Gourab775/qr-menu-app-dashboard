export function formatCurrency(amount, locale = 'en-IN', currencyCode = 'INR') {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount || 0)
  } catch {
    const fallbackSymbols = { INR: '\u20B9', USD: '$', GBP: '\u00A3', AED: 'AED' }
    const sym = fallbackSymbols[currencyCode] || currencyCode
    const formatted = (amount || 0).toLocaleString(locale || 'en-IN')
    return sym === 'AED' ? sym + ' ' + formatted : sym + formatted
  }
}

export const DEFAULT_CURRENCY = {
  country_code: 'IN',
  currency_code: 'INR',
  currency_symbol: '\u20B9',
  locale: 'en-IN',
}

export const COUNTRY_CONFIGS = [
  { name: 'India', country_code: 'IN', currency_code: 'INR', currency_symbol: '\u20B9', locale: 'en-IN' },
  { name: 'United States', country_code: 'US', currency_code: 'USD', currency_symbol: '$', locale: 'en-US' },
  { name: 'United Kingdom', country_code: 'GB', currency_code: 'GBP', currency_symbol: '\u00A3', locale: 'en-GB' },
  { name: 'UAE', country_code: 'AE', currency_code: 'AED', currency_symbol: 'AED', locale: 'en-AE' },
]
