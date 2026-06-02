import { useState, useRef } from 'react'
import { uploadToCloudinary, validateImageFile, validateVideoFile, getOptimizedUrl } from '../services/cloudinaryService'

const LABELS = {
  logo: { title: 'Upload Logo', accept: 'image/*', validator: validateImageFile },
  image: { title: 'Upload Image', accept: 'image/*', validator: validateImageFile },
  video: { title: 'Upload Video', accept: 'video/mp4,video/webm,video/quicktime', validator: validateVideoFile }
}

export default function CloudinaryUpload({ restaurantId, subfolder, value, onChange, type = 'image', onUploadStart, onUploadEnd }) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)
  const cfg = LABELS[type] || LABELS.image

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const validationError = cfg.validator(file)
    if (validationError) {
      setError(validationError)
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    setError(null)
    setUploading(true)
    setProgress(0)
    if (onUploadStart) onUploadStart()

    try {
      const result = await uploadToCloudinary({
        file,
        restaurantId,
        subfolder,
        onProgress: setProgress
      })
      onChange(result.secure_url, result.public_id)
      setProgress(100)
    } catch (err) {
      setError(err.message || 'Upload failed')
    } finally {
      setUploading(false)
      if (onUploadEnd) onUploadEnd()
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="cloudinary-upload-wrap">
      <div className="cloudinary-upload-row">
        <label className="cloudinary-upload-btn">
          {uploading ? `Uploading... ${progress}%` : cfg.title}
          <input
            ref={inputRef}
            type="file"
            accept={cfg.accept}
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
      {uploading && (
        <div className="cloudinary-progress-bar-wrap">
          <div className="cloudinary-progress-bar" style={{ width: `${progress}%` }} />
        </div>
      )}
      {error && <span className="form-error">{error}</span>}
      {value && type !== 'video' && (
        <img
          src={getOptimizedUrl(value)}
          alt=""
          className="cloudinary-preview"
          loading="lazy"
          onError={(e) => { e.target.style.display = 'none' }}
        />
      )}
      {value && type === 'video' && (
        <video
          src={value}
          className="cloudinary-preview"
          muted
          playsInline
          preload="metadata"
        />
      )}
    </div>
  )
}
