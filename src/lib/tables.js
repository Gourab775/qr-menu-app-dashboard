import { supabase } from './supabase.js'

export async function ensureTableExists(tableName, columns) {
  try {
    const { error } = await supabase
      .from(tableName)
      .select('id')
      .limit(1)
    
    if (error?.code === 'PGRST116') {
      return { created: true }
    }
    
    if (error && error.code !== 'PGRST204') {
      console.warn(`Table ${tableName} check error:`, error.message)
    }
    
    return { created: false, error }
  } catch (err) {
    console.error(`Error checking table ${tableName}:`, err)
    return { created: false, error: err }
  }
}

export async function initializePaymentTokens() {
  try {
    const { data, error } = await supabase
      .from('payment_tokens')
      .select('id, order_id, token, status, created_at')
      .limit(1)

    if (error) {
      if (error.code === 'PGRST116' || error.code === '42P01') {
        console.warn('payment_tokens table does not exist. Please run SUPABASE_SETUP.sql in Supabase dashboard.')
        return { success: false, error: 'Table not found' }
      }
      console.error('payment_tokens error:', error)
      return { success: false, error }
    }

    return { success: true, data }
  } catch (err) {
    console.warn('Payment tokens initialization failed:', err.message)
    return { success: false, error: err.message }
  }
}

export async function insertPaymentToken(orderId, token, amount) {
  try {
    const { data, error } = await supabase
      .from('payment_tokens')
      .insert({
        order_id: orderId,
        token: token,
        amount: amount || 0,
        status: 'pending'
      })
      .select()
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (err) {
    console.error('Insert payment token error:', err)
    return { success: false, error: err.message }
  }
}

export async function updatePaymentTokenStatus(tokenId, status) {
  try {
    const { data, error } = await supabase
      .from('payment_tokens')
      .update({ status })
      .eq('id', tokenId)
      .select()
      .single()

    if (error) throw error
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

export async function getPaymentToken(orderId) {
  try {
    const { data, error } = await supabase
      .from('payment_tokens')
      .select('*')
      .eq('order_id', orderId)
      .maybeSingle()

    if (error) throw error
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err.message }
  }
}