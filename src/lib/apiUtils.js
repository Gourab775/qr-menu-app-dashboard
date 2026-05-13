const DEFAULT_TIMEOUT = 15000
const REQUEST_CACHE = new Map()
const ACTIVE_REQUESTS = new Map()

export function createAbortController(timeout = DEFAULT_TIMEOUT) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    controller.abort()
    console.warn(`[API] Request timeout after ${timeout}ms`)
  }, timeout)
  
  return { controller, timeoutId, clear: () => clearTimeout(timeoutId) }
}

export async function fetchWithTimeout(promise, timeout = DEFAULT_TIMEOUT) {
  const { controller, timeoutId, clear } = createAbortController(timeout)
  
  try {
    const result = await Promise.race([
      promise,
      new Promise((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new Error('Request timeout'))
        })
      })
    ])
    return result
  } finally {
    clear()
  }
}

export function getCache(key) {
  const cached = REQUEST_CACHE.get(key)
  if (cached && Date.now() - cached.timestamp < 300000) {
    return cached.data
  }
  return null
}

export function setCache(key, data) {
  REQUEST_CACHE.set(key, { data, timestamp: Date.now() })
}

export function clearCache(key) {
  if (key) {
    REQUEST_CACHE.delete(key)
  } else {
    REQUEST_CACHE.clear()
  }
}

export function deduplicateRequest(key, requestFn) {
  if (ACTIVE_REQUESTS.has(key)) {
    return ACTIVE_REQUESTS.get(key)
  }

  const promise = requestFn()
    .finally(() => {
      ACTIVE_REQUESTS.delete(key)
    })

  ACTIVE_REQUESTS.set(key, promise)
  return promise
}

export async function apiRequest(fn, options = {}) {
  const {
    timeout = DEFAULT_TIMEOUT,
    cacheKey = null,
    useCache = false,
    onError = null,
    retry = 0,
    retryDelay = 1000,
    deduplicateKey = null
  } = options

  if (useCache && cacheKey) {
    const cached = getCache(cacheKey)
    if (cached) {
      return { data: cached, fromCache: true }
    }
  }

  const executeRequest = async () => {
    const result = await fetchWithTimeout(fn(), timeout)
    if (useCache && cacheKey && result.data) {
      setCache(cacheKey, result.data)
    }
    return { data: result.data, error: result.error, fromCache: false }
  }

  if (deduplicateKey) {
    return deduplicateRequest(deduplicateKey, async () => {
      let lastError = null
      let attempts = 0

      while (attempts <= retry) {
        try {
          return await executeRequest()
        } catch (err) {
          lastError = err
          attempts++

          if (attempts <= retry) {
            console.warn(`[API] Request failed (attempt ${attempts}/${retry + 1}), retrying...`, err.message)
            await new Promise(resolve => setTimeout(resolve, retryDelay * attempts))
          }
        }
      }

      const errorMsg = lastError?.message || 'Unknown error'
      console.error(`[API] Request failed after ${retry + 1} attempts:`, errorMsg)
      
      if (onError) {
        onError(lastError)
      }

      return { data: null, error: lastError, fromCache: false }
    })
  }

  let lastError = null
  let attempts = 0

  while (attempts <= retry) {
    try {
      return await executeRequest()
    } catch (err) {
      lastError = err
      attempts++

      if (attempts <= retry) {
        console.warn(`[API] Request failed (attempt ${attempts}/${retry + 1}), retrying...`, err.message)
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempts))
      }
    }
  }

  const errorMsg = lastError?.message || 'Unknown error'
  console.error(`[API] Request failed after ${retry + 1} attempts:`, errorMsg)
  
  if (onError) {
    onError(lastError)
  }

  return { data: null, error: lastError, fromCache: false }
}

export function validateSession(session) {
  if (!session) {
    return { valid: false, reason: 'No session' }
  }
  
  if (!session.access_token) {
    return { valid: false, reason: 'No access token' }
  }

  const expiresAt = session.expires_at
  if (expiresAt && Date.now() > expiresAt * 1000) {
    return { valid: false, reason: 'Session expired' }
  }

  return { valid: true }
}

export async function checkAuthAndRedirect() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession()
    
    if (error || !session) {
      return { authenticated: false, shouldRedirect: true }
    }

    const validation = validateSession(session)
    if (!validation.valid) {
      return { authenticated: false, shouldRedirect: true, reason: validation.reason }
    }

    return { authenticated: true, shouldRedirect: false, session }
  } catch (err) {
    console.error('[Auth] Check failed:', err)
    return { authenticated: false, shouldRedirect: true, reason: err.message }
  }
}