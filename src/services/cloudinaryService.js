const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
const API_KEY = import.meta.env.VITE_CLOUDINARY_API_KEY
const API_SECRET = import.meta.env.VITE_CLOUDINARY_API_SECRET

const UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`

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

async function sha1(message) {
  const msgBuffer = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-1', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

function buildFolderPath(restaurantId, subfolder) {
  return `restaurants/${restaurantId}/${subfolder}`
}

async function generateSignature(paramsToSign) {
  const keys = Object.keys(paramsToSign).sort()
  const paramStr = keys.map(k => `${k}=${paramsToSign[k]}`).join('&')
  const strToSign = paramStr + API_SECRET
  return sha1(strToSign)
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
  const folder = buildFolderPath(restaurantId, subfolder)
  const publicId = generatePublicId(file.name)
  const uploadKey = `${restaurantId}/${subfolder}/${file.name}-${file.size}`

  if (inFlightUploads.has(uploadKey)) {
    return Promise.reject(new Error('Duplicate upload detected'))
  }

  return new Promise(async (resolve, reject) => {
    inFlightUploads.set(uploadKey, true)

    try {
      const timestamp = Math.floor(Date.now() / 1000)
      const params = { folder, public_id: publicId, timestamp }
      const signature = await generateSignature(params)

      const formData = new FormData()
      formData.append('file', file)
      formData.append('folder', folder)
      formData.append('public_id', publicId)
      formData.append('timestamp', timestamp)
      formData.append('api_key', API_KEY)
      formData.append('signature', signature)

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
            errMsg = err.error?.message || errMsg
          } catch {}
          reject(new Error(errMsg))
        }
      })

      xhr.addEventListener('error', () => {
        inFlightUploads.delete(uploadKey)
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
      reject(err)
    }
  })
}

export async function deleteFromCloudinary(publicId, resourceType = 'image') {
  const timestamp = Math.floor(Date.now() / 1000)
  const params = { public_id: publicId, timestamp }
  const signature = await generateSignature(params)

  const formData = new FormData()
  formData.append('public_id', publicId)
  formData.append('timestamp', timestamp)
  formData.append('api_key', API_KEY)
  formData.append('signature', signature)

  try {
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/destroy`, {
      method: 'POST',
      body: formData
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
