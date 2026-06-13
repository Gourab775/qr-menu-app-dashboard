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

const MAX_SOURCE_SIZE = 100 * 1024
const MAX_TARGET_SIZE = 100 * 1024
const TARGET_SIZE = 50 * 1024
const MAX_WIDTH = 800

function encodeWebP(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Failed to convert image to WebP'))
    }, 'image/webp', quality)
  })
}

function processImage(file) {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_SOURCE_SIZE) {
      reject(new Error(`Source image exceeds 100 KB (${(file.size / 1024).toFixed(1)} KB)`))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = async () => {
        let { width, height } = img
        if (width > MAX_WIDTH) {
          height = Math.round(height * (MAX_WIDTH / width))
          width = MAX_WIDTH
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)
        console.log('[SupabaseStorage] Image resized:', { width, height, originalSize: file.size })

        // Aggressive compression: start at quality 0.7, reduce until under MAX_TARGET_SIZE
        let quality = 0.7
        let blob = await encodeWebP(canvas, quality)
        while (blob.size > MAX_TARGET_SIZE && quality > 0.15) {
          quality = Math.round((quality - 0.1) * 10) / 10
          console.log('[SupabaseStorage] Reducing quality to', quality, 'current size:', blob.size)
          blob = await encodeWebP(canvas, quality)
        }
        console.log('[SupabaseStorage] Final WebP:', { size: blob.size, quality, target: TARGET_SIZE })
        resolve(blob)
      }
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = reader.result
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

export async function uploadMenuItemImage(file, restaurantId) {
  console.log('[SupabaseStorage] Starting upload:', { fileName: file.name, size: file.size, type: file.type, restaurantId })
  try {
    const webpBlob = await processImage(file)
    const timestamp = Date.now()
    const random = Math.random().toString(36).slice(2, 8)
    const filePath = `${restaurantId}/${timestamp}-${random}.webp`
    console.log('[SupabaseStorage] Uploading to storage:', { filePath, blobSize: webpBlob.size, bucket: BUCKET_NAME })
    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, webpBlob, {
        contentType: 'image/webp',
        cacheControl: '3600',
        upsert: false
      })
    if (uploadError) {
      console.error('[SupabaseStorage] Storage upload error:', uploadError)
      throw uploadError
    }
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
