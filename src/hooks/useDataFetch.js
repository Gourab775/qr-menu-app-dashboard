import { useState, useEffect, useRef, useCallback } from 'react'

export function useDataFetch(fetchFn, options = {}) {
  const {
    immediate = true,
    timeout = 15000,
    cacheKey = null,
    useCache = false,
    retry = 0,
    deps = []
  } = options

  const [state, setState] = useState({
    data: null,
    loading: false,
    error: null,
    success: false
  })

  const mountedRef = useRef(false)
  const abortControllerRef = useRef(null)
  const retryCountRef = useRef(0)
  const isFetchingRef = useRef(false)

  const executeFetch = useCallback(async (isRetry = false) => {
    if (isFetchingRef.current && !isRetry) {
      return
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    const controller = new AbortController()
    abortControllerRef.current = controller
    
    isFetchingRef.current = true

    if (!isRetry) {
      setState(prev => ({ ...prev, loading: true, error: null }))
    }

    const timeoutId = setTimeout(() => {
      if (mountedRef.current) {
        controller.abort()
        setState(prev => ({
          ...prev,
          loading: false,
          error: 'Request timeout',
          success: false
        }))
        isFetchingRef.current = false
      }
    }, timeout)

    try {
      const result = await fetchFn(controller.signal)
      
      if (!mountedRef.current) return

      clearTimeout(timeoutId)

      if (controller.signal.aborted) {
        return
      }

      if (result.error) {
        if (retryCountRef.current < retry && !controller.signal.aborted) {
          retryCountRef.current++
          console.log(`[useDataFetch] Retrying (${retryCountRef.current}/${retry})...`)
          setTimeout(() => executeFetch(true), 1000 * retryCountRef.current)
          return
        }

        setState({
          data: null,
          loading: false,
          error: result.error.message || 'Request failed',
          success: false
        })
      } else {
        setState({
          data: result.data,
          loading: false,
          error: null,
          success: true
        })
        retryCountRef.current = 0
      }
    } catch (err) {
      if (!mountedRef.current) return

      clearTimeout(timeoutId)

      if (err.name === 'AbortError' || err.message === 'Request timeout') {
        console.log('[useDataFetch] Request cancelled/timeout')
        return
      }

      console.error('[useDataFetch] Error:', err)

      if (retryCountRef.current < retry && !controller.signal.aborted) {
        retryCountRef.current++
        setTimeout(() => executeFetch(true), 1000 * retryCountRef.current)
        return
      }

      setState({
        data: null,
        loading: false,
        error: err.message || 'Unknown error',
        success: false
      })
    } finally {
      if (mountedRef.current) {
        isFetchingRef.current = false
      }
    }
  }, [fetchFn, retry, timeout])

  const refetch = useCallback(() => {
    retryCountRef.current = 0
    executeFetch(false)
  }, [executeFetch])

  useEffect(() => {
    mountedRef.current = true

    if (immediate) {
      executeFetch()
    }

    return () => {
      mountedRef.current = false
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      isFetchingRef.current = false
    }
  }, deps)

  return { ...state, refetch, isLoading: state.loading }
}

export function useAsyncCallback(callback, options = {}) {
  const { timeout = 15000, deps = [] } = options
  
  const [state, setState] = useState({
    loading: false,
    error: null,
    data: null
  })

  const mountedRef = useRef(false)
  const abortRef = useRef(null)

  const execute = useCallback(async (...args) => {
    if (abortRef.current) {
      abortRef.current.abort()
    }

    const controller = new AbortController()
    abortRef.current = controller

    setState(prev => ({ ...prev, loading: true, error: null }))

    const timeoutId = setTimeout(() => {
      controller.abort()
      setState(prev => ({
        ...prev,
        loading: false,
        error: 'Request timeout'
      }))
    }, timeout)

    try {
      const result = await callback(...args, controller.signal)
      
      if (!mountedRef.current) return null
      
      clearTimeout(timeoutId)

      if (controller.signal.aborted) {
        return null
      }

      setState({
        loading: false,
        error: null,
        data: result
      })

      return result
    } catch (err) {
      if (!mountedRef.current) return null

      clearTimeout(timeoutId)

      if (err.name === 'AbortError') {
        return null
      }

      console.error('[useAsyncCallback] Error:', err)

      setState(prev => ({
        ...prev,
        loading: false,
        error: err.message || 'Operation failed'
      }))

      return null
    }
  }, deps)

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
      if (abortRef.current) {
        abortRef.current.abort()
      }
    }
  }, [])

  return { ...state, execute }
}