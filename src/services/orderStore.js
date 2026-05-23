const PENDING_KEY = 'order_sync_pending'
const PAST_KEY = 'order_sync_past'
const BC_NAME = 'order-sync-channel'

export function getPending() {
  try {
    const raw = localStorage.getItem(PENDING_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function getPast() {
  try {
    const raw = localStorage.getItem(PAST_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function publish(pending, past) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending))
    localStorage.setItem(PAST_KEY, JSON.stringify(past))
  } catch {}
  try {
    const bc = new BroadcastChannel(BC_NAME)
    bc.postMessage({ pending, past })
    bc.close()
  } catch {}
}

export function startConsumer(onOrders) {
  const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(BC_NAME) : null
  if (bc) {
    bc.onmessage = (e) => {
      if (e.data && Array.isArray(e.data.pending) && Array.isArray(e.data.past)) {
        onOrders(e.data.pending, e.data.past)
      }
    }
  }
  const onStorage = (e) => {
    if (e.key === PENDING_KEY || e.key === PAST_KEY) {
      onOrders(getPending(), getPast())
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    if (bc) bc.close()
    window.removeEventListener('storage', onStorage)
  }
}
