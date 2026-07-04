export const PLANS = {
  basic: {
    features: [
      'menu_items',
      'categories',
      'featured',
      'tables',
      'waiter_calls',
      'settings',
    ],
    defaultTab: 'menu_items',
  },
  plus: {
    features: [
      'analytics',
      'pos',
      'menu_items',
      'categories',
      'featured',
      'live_orders',
      'past_orders',
      'tables',
      'waiter_calls',
      'settings',
    ],
    defaultTab: 'analytics',
  },
}

export const PLAN_LABELS = {
  basic: 'Basic Plan',
  plus: 'Plus Plan',
}

export function getPlanFeatures(plan) {
  const p = (plan || 'plus').toLowerCase().trim()
  return PLANS[p]?.features || PLANS.plus.features
}

export function hasFeature(plan, feature) {
  return getPlanFeatures(plan).includes(feature)
}

export function getDefaultTab(plan) {
  const p = (plan || 'plus').toLowerCase().trim()
  return PLANS[p]?.defaultTab || PLANS.plus.defaultTab
}
