import { useEffect, useState } from 'react'
import { imageMimeTypes, isMediaImage, maxImageBytes } from '../../../shared/media.ts'

export type ImageEdit = { url: string; file?: File }
const acceptedTypes = Object.values<string>(imageMimeTypes)

export function ImageField({ label, image, change, disabled, uploadOnly = false }: {
  label: string
  image: ImageEdit
  change: (value: ImageEdit) => void
  disabled: boolean
  uploadOnly?: boolean
}) {
  const [preview, setPreview] = useState('')
  const [error, setError] = useState('')
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const src = image.file ? preview : isMediaImage(image.url) || /^https:\/\//i.test(image.url) ? image.url : ''
  return <div className="media-field">
    <label className="field">{label}
      <input type="file" accept={acceptedTypes.join(',')} disabled={disabled} onChange={(event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return
        if (file.size > maxImageBytes || !acceptedTypes.includes(file.type)) {
          setError('Pilih foto JPG, PNG, atau WebP berukuran maksimal 2 MB.')
          return
        }
        setError('')
        setPreview(URL.createObjectURL(file))
        change({ url: image.url, file })
      }} />
    </label>
    {src && <img className="media-preview" src={src} alt={'Pratinjau ' + label.toLowerCase()} />}
    {image.file && <p className="muted media-caption">Foto akan diunggah ketika pengaturan disimpan.</p>}
    {!uploadOnly && <label className="field">URL {label.toLowerCase()} (opsional)
      <input type="text" inputMode="url" placeholder="https://…" maxLength={2048} value={image.url} disabled={disabled}
        onChange={(event) => { setPreview(''); setError(''); change({ url: event.target.value }) }} />
    </label>}
    {(image.file || image.url) && <button type="button" className="text-button" disabled={disabled}
      onClick={() => { setPreview(''); setError(''); change({ url: '' }) }}>Hapus pilihan {label.toLowerCase()}</button>}
    {error && <p className="message danger" role="alert">{error}</p>}
  </div>
}
