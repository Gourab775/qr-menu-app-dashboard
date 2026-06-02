const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET

console.log('[Cloudinary] Cloud Name:', CLOUD_NAME)
console.log('[Cloudinary] Upload Preset:', UPLOAD_PRESET)

if (!CLOUD_NAME) {
  throw new Error('Missing Cloud Name: VITE_CLOUDINARY_CLOUD_NAME environment variable is not set. Check your .env file and restart the dev server.')
}

if (!UPLOAD_PRESET) {
  throw new Error('Missing Upload Preset: VITE_CLOUDINARY_UPLOAD_PRESET environment variable is not set. Create an unsigned upload preset in Cloudinary dashboard.')
}

const UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`

console.log('[Cloudinary] Upload URL:', UPLOAD_URL)

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']
const MAX_IMAGE_SIZE = 1 * 1024 * 1024
const MAX_VIDEO_SIZE = 5 * 1024 * 1024

const inFlightUploads = new Map()

function generatePublicId(originalName) {
  const ext = originalName.split('.').pop()
  const base = originalName.replace(`.${ext}`, '').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase().slice(0, 40)
  const unique = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  return `${base}_${unique}`
}

function buildFolderPath(restaurantId, subfolder) {
  return `restaurants/${restaurantId}/${subfolder}`
}

export function validateImageFile(file) {
  if (!file) return 'No file selected'
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return 'Invalid image type. Allowed: JPG, JPEG, PNG, WEBP'
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return `Image too large. Maximum ${MAX_IMAGE_SIZE / 1024 / 1024}MB`
  }
  return null
}

export function validateVideoFile(file) {
  if (!file) return 'No file selected'
  if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
    return 'Invalid video type. Allowed: MP4, WEBM, MOV'
  }
  if (file.size > MAX_VIDEO_SIZE) {
    return `Video too large. Maximum ${MAX_VIDEO_SIZE / 1024 / 1024}MB`
  }
  return null
}

export function uploadToCloudinary({ file, restaurantId, subfolder, onProgress }) {
  if (!CLOUD_NAME) {
    return Promise.reject(new Error('Missing Cloud Name: Cloudinary cloud name is not configured'))
  }
  if (!UPLOAD_PRESET) {
    return Promise.reject(new Error('Missing Upload Preset: Create an unsigned upload preset in Cloudinary dashboard and set VITE_CLOUDINARY_UPLOAD_PRESET'))
  }

  const folder = buildFolderPath(restaurantId, subfolder)
  const publicId = generatePublicId(file.name)
  const uploadKey = `${restaurantId}/${subfolder}/${file.name}-${file.size}`

  if (inFlightUploads.has(uploadKey)) {
    return Promise.reject(new Error('Duplicate upload detected'))
  }

  return new Promise((resolve, reject) => {
    inFlightUploads.set(uploadKey, true)

    try {
      console.log('[Cloudinary] Upload Started:', { folder, publicId, fileName: file.name })

      const formData = new FormData()
      formData.append('file', file)
      formData.append('folder', folder)
      formData.append('public_id', publicId)
      formData.append('upload_preset', UPLOAD_PRESET)

      const xhr = new XMLHttpRequest()

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100))
        }
      })

      xhr.addEventListener('load', () => {
        inFlightUploads.delete(uploadKey)
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const result = JSON.parse(xhr.responseText)
            console.log('[Cloudinary] Upload Success:', { secure_url: result.secure_url, public_id: result.public_id })
            resolve({
              secure_url: result.secure_url,
              public_id: result.public_id
            })
          } catch (e) {
            reject(new Error('Failed to parse Cloudinary response'))
          }
        } else {
          let errMsg = 'Upload failed'
          try {
            const err = JSON.parse(xhr.responseText)
            const cloudMsg = err.error?.message || ''
            if (xhr.status === 401 || cloudMsg.includes('cloud_name is disabled') || cloudMsg.includes('Invalid')) {
              errMsg = `Unauthorized Upload: ${cloudMsg || 'Invalid Cloudinary credentials. Verify cloud_name and upload preset.'}`
            } else if (cloudMsg.includes('Upload preset')) {
              errMsg = `Invalid Upload Preset: ${cloudMsg}`
            } else {
              errMsg = cloudMsg || `Upload failed (HTTP ${xhr.status})`
            }
          } catch {}
          console.error('[Cloudinary] Upload Failed:', errMsg)
          reject(new Error(errMsg))
        }
      })

      xhr.addEventListener('error', () => {
        inFlightUploads.delete(uploadKey)
        console.error('[Cloudinary] Upload Failed: Network error')
        reject(new Error('Network error during upload'))
      })

      xhr.addEventListener('abort', () => {
        inFlightUploads.delete(uploadKey)
        reject(new Error('Upload aborted'))
      })

      xhr.open('POST', UPLOAD_URL)
      xhr.send(formData)
    } catch (err) {
      inFlightUploads.delete(uploadKey)
      console.error('[Cloudinary] Upload Failed:', err.message)
      reject(err)
    }
  })
}

export async function deleteFromCloudinary(publicId, resourceType = 'image') {
  if (!publicId) return false
  try {
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/destroy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ public_id: publicId })
    })
    return res.ok
  } catch {
    return false
  }
}

export function getOptimizedUrl(secureUrl) {
  if (!secureUrl || !secureUrl.includes('res.cloudinary.com')) return secureUrl
  return secureUrl.replace('/upload/', '/upload/f_auto,q_auto/')
}

export function extractPublicId(secureUrl) {
  if (!secureUrl || !secureUrl.includes('res.cloudinary.com')) return null
  try {
    const url = new URL(secureUrl)
    const pathParts = url.pathname.split('/')
    const uploadIndex = pathParts.indexOf('upload')
    if (uploadIndex === -1 || uploadIndex + 2 >= pathParts.length) return null
    const versionAndPath = pathParts.slice(uploadIndex + 2)
    const withoutVersion = versionAndPath[0]?.startsWith('v') ? versionAndPath.slice(1) : versionAndPath
    const fullPath = withoutVersion.join('/')
    return fullPath.replace(/\.[^/.]+$/, '')
  } catch {
    return null
  }
}
