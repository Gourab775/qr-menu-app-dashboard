import { useState, useRef } from 'react'
import { uploadMenuItemImage } from '../services/supabaseStorageService'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SOURCE_SIZE = 100 * 1024

function validateFile(file) {
  if (!file) return 'No file selected'
  if (!ALLOWED_TYPES.includes(file.type)) {
    return 'Unsupported file format. Please upload JPEG, PNG, or WebP images.'
  }
  if (file.size > MAX_SOURCE_SIZE) {
    const kb = (file.size / 1024).toFixed(1)
    return `Image is ${kb} KB. Maximum allowed is 100 KB. Please upload a smaller file.`
  }
  return null
}

export default function MenuItemImageUpload({ restaurantId, value, onChange }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const validationError = validateFile(file)
    if (validationError) {
      setError(validationError)
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    setError(null)
    setUploading(true)

    try {
      const url = await uploadMenuItemImage(file, restaurantId)
      onChange(url)
    } catch (err) {
      const msg = err.message || 'Upload failed'
      console.error('[MenuItemImageUpload] Error:', msg)
      setError(msg)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="cloudinary-upload-wrap">
      <div className="cloudinary-upload-row">
        <label className="cloudinary-upload-btn">
          {uploading ? 'Uploading...' : 'Upload Image'}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileSelect}
            disabled={uploading}
            style={{ display: 'none' }}
          />
        </label>
        {value && (
          <a
            href="#"
            className="cloudinary-clear-btn"
            onClick={(e) => { e.preventDefault(); onChange('') }}
          >
            Clear
          </a>
        )}
      </div>
      {error && <span className="form-error">{error}</span>}
      {value && (
        <img
          src={value}
          alt=""
          className="cloudinary-preview"
          loading="lazy"
          onError={(e) => { e.target.style.display = 'none' }}
        />
      )}
    </div>
  )
}
