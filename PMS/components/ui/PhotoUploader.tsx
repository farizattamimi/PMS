'use client'

import { useRef, useState, useCallback } from 'react'
import { Camera, FileText, Trash2, Loader2, Upload, X, Paperclip } from 'lucide-react'

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'])

function isImage(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  return IMAGE_EXTS.has(ext)
}

/** Compress image files > 1MB using Canvas API */
async function compressImage(file: File, maxWidth = 1920, quality = 0.8): Promise<File> {
  if (file.size <= 1_000_000) return file
  if (!file.type.startsWith('image/')) return file

  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width)
        width = maxWidth
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(file); return }
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) { resolve(file); return }
          resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }))
        },
        'image/jpeg',
        quality,
      )
    }
    img.onerror = () => resolve(file)
    img.src = URL.createObjectURL(file)
  })
}

interface Doc {
  id: string
  fileName: string
  fileUrl: string
  uploadedBy?: { name: string | null }
}

interface PhotoUploaderProps {
  workOrderId: string
  documents: Doc[]
  onUploadComplete: () => void
  onDelete?: (docId: string) => void
  disabled?: boolean
}

export default function PhotoUploader({
  workOrderId,
  documents,
  onUploadComplete,
  onDelete,
  disabled,
}: PhotoUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [uploadingIds, setUploadingIds] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [lightboxName, setLightboxName] = useState('')

  const processFiles = useCallback(async (files: FileList | File[]) => {
    const toUpload = Array.from(files).slice(0, 5)
    if (toUpload.length === 0) return

    // Add placeholder IDs for upload progress
    const placeholders = toUpload.map((f, i) => `uploading-${Date.now()}-${i}`)
    setUploadingIds(prev => {
      const next = new Set(prev)
      placeholders.forEach(id => next.add(id))
      return next
    })

    for (let i = 0; i < toUpload.length; i++) {
      const compressed = await compressImage(toUpload[i])
      const fd = new FormData()
      fd.append('file', compressed)
      fd.append('scopeType', 'workorder')
      fd.append('scopeId', workOrderId)
      fd.append('workOrderId', workOrderId)
      await fetch('/api/documents', { method: 'POST', body: fd })
      // Remove this placeholder
      setUploadingIds(prev => {
        const next = new Set(prev)
        next.delete(placeholders[i])
        return next
      })
    }

    onUploadComplete()
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (cameraInputRef.current) cameraInputRef.current.value = ''
  }, [workOrderId, onUploadComplete])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) processFiles(e.target.files)
  }

  // Drag-and-drop handlers
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) setDragActive(true)
  }
  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (!disabled && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files)
    }
  }

  async function handleDelete(docId: string) {
    if (!onDelete) return
    setDeleting(docId)
    await fetch(`/api/documents/${docId}`, { method: 'DELETE' })
    setDeleting(null)
    onDelete(docId)
  }

  function openLightbox(doc: Doc) {
    if (isImage(doc.fileName)) {
      setLightboxUrl(doc.fileUrl)
      setLightboxName(doc.fileName)
    } else {
      window.open(doc.fileUrl, '_blank', 'noopener,noreferrer')
    }
  }

  const isUploading = uploadingIds.size > 0

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900">Photos &amp; Attachments</h3>
        <div className="flex items-center gap-2">
          {/* Camera button (mobile) */}
          <label className={`cursor-pointer flex items-center gap-1.5 text-sm font-medium ${disabled || isUploading ? 'text-gray-300' : 'text-blue-600 hover:text-blue-700'}`}>
            <Camera className="h-4 w-4" />
            <span className="hidden sm:inline">Photo</span>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={handleFileChange}
              disabled={disabled || isUploading}
            />
          </label>
          {/* General upload button */}
          <label className={`cursor-pointer flex items-center gap-1.5 text-sm font-medium ${disabled || isUploading ? 'text-gray-300' : 'text-blue-600 hover:text-blue-700'}`}>
            <Paperclip className="h-4 w-4" />
            <span className="hidden sm:inline">Upload</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.doc,.docx"
              multiple
              className="hidden"
              onChange={handleFileChange}
              disabled={disabled || isUploading}
            />
          </label>
        </div>
      </div>

      {documents.length === 0 && !isUploading && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center py-8 border-2 border-dashed rounded-lg transition-colors ${
            dragActive
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-200 text-gray-400'
          }`}
        >
          <Upload className="h-8 w-8 mb-2" />
          <p className="text-sm">No attachments yet</p>
          <p className="text-xs mt-1">Tap upload, use your camera, or drag files here</p>
        </div>
      )}

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`${documents.length > 0 || isUploading ? '' : 'hidden'} ${
          dragActive ? 'ring-2 ring-blue-400 ring-offset-2 rounded-lg' : ''
        }`}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {documents.map(doc => {
            const img = isImage(doc.fileName)
            return (
              <div key={doc.id} className="relative group rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
                {img ? (
                  <button type="button" onClick={() => openLightbox(doc)} className="w-full">
                    <img
                      src={doc.fileUrl}
                      alt={doc.fileName}
                      className="w-full h-32 object-cover"
                    />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => openLightbox(doc)}
                    className="flex flex-col items-center justify-center w-full h-32 text-gray-400 hover:text-gray-600"
                  >
                    <FileText className="h-8 w-8 mb-1" />
                    <span className="text-xs text-center px-2 truncate max-w-full">{doc.fileName}</span>
                  </button>
                )}
                <div className="px-2 py-1.5 text-xs text-gray-500 truncate">
                  {doc.fileName}
                </div>
                {onDelete && (
                  <button
                    onClick={() => handleDelete(doc.id)}
                    disabled={deleting === doc.id}
                    className="absolute top-1.5 right-1.5 p-1 rounded-full bg-white/80 text-red-400 hover:text-red-600 hover:bg-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    {deleting === doc.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>
            )
          })}
          {/* Per-file upload placeholders */}
          {Array.from(uploadingIds).map(id => (
            <div key={id} className="flex items-center justify-center rounded-lg border border-blue-200 bg-blue-50 h-32">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            </div>
          ))}
        </div>
      </div>

      {/* Lightbox overlay */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] w-full" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setLightboxUrl(null)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300"
            >
              <X className="h-6 w-6" />
            </button>
            <img
              src={lightboxUrl}
              alt={lightboxName}
              className="w-full max-h-[85vh] object-contain rounded-lg"
            />
            <p className="text-center text-white text-sm mt-2">{lightboxName}</p>
          </div>
        </div>
      )}
    </div>
  )
}
