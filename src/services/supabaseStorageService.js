import { supabase } from '../lib/supabase'

const BUCKET_NAME = 'menu-items'

function isSupabaseUrl(url) {
  if (!url) return false
  try {
    const urlObj = new URL(url)
    return urlObj.hostname.endsWith('supabase.co') && urlObj.pathname.includes(`/storage/v1/object/public/${BUCKET_NAME}/`)
  } catch {
    return false
  }
}

function getPathFromUrl(url) {
  if (!isSupabaseUrl(url)) return null
  try {
    const urlObj = new URL(url)
    const parts = urlObj.pathname.split(`/storage/v1/object/public/${BUCKET_NAME}/`)
    if (parts.length === 2) {
      return decodeURIComponent(parts[1])
    }
    return null
  } catch {
    return null
  }
}

function processImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img
        const MAX_WIDTH = 800
        if (width > MAX_WIDTH) {
          height = Math.round(height * (MAX_WIDTH / width))
          width = MAX_WIDTH
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('Failed to convert image to WebP'))
          }
        }, 'image/webp', 0.8)
      }
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = reader.result
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

export async function uploadMenuItemImage(file, restaurantId) {
  console.log('[SupabaseStorage] Starting upload:', { fileName: file.name, size: file.size, restaurantId })
  try {
    const webpBlob = await processImage(file)
    const timestamp = Date.now()
    const random = Math.random().toString(36).slice(2, 8)
    const filePath = `${restaurantId}/${timestamp}-${random}.webp`
    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, webpBlob, {
        contentType: 'image/webp',
        cacheControl: '3600',
        upsert: false
      })
    if (uploadError) throw uploadError
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath)
    const publicUrl = urlData.publicUrl
    console.log('[SupabaseStorage] Upload success:', { filePath, publicUrl })
    return publicUrl
  } catch (err) {
    console.error('[SupabaseStorage] Upload failed:', err.message)
    throw err
  }
}

export async function deleteMenuItemImage(imageUrl) {
  if (!isSupabaseUrl(imageUrl)) {
    console.log('[SupabaseStorage] Skipping delete - not a Supabase URL')
    return
  }
  const filePath = getPathFromUrl(imageUrl)
  if (!filePath) {
    console.warn('[SupabaseStorage] Could not extract path from URL:', imageUrl)
    return
  }
  try {
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([filePath])
    if (error) throw error
    console.log('[SupabaseStorage] Deleted:', filePath)
  } catch (err) {
    console.error('[SupabaseStorage] Delete failed:', err.message)
    throw err
  }
}

export { isSupabaseUrl }
