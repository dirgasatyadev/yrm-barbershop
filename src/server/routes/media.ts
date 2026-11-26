import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { imageFilenamePattern, imageMimeTypes, maxImageBytes, mediaPrefix } from '../../shared/media.ts'
import type { ImageExtension } from '../../shared/media.ts'
import type { Env } from '../env.ts'
import { ApiError, notFound } from '../errors.ts'

const objectKey = (filename: string) => 'public-images/' + filename
const bytePrefix = (bytes: Uint8Array, marker: number[], offset = 0) =>
  marker.every((value, index) => bytes[index + offset] === value)

function imageExtension(bytes: Uint8Array): ImageExtension | undefined {
  if (bytePrefix(bytes, [137, 80, 78, 71, 13, 10, 26, 10])) return 'png'
  if (bytePrefix(bytes, [255, 216, 255])) return 'jpg'
  if (bytePrefix(bytes, [82, 73, 70, 70]) && bytePrefix(bytes, [87, 69, 66, 80], 8)) return 'webp'
}

export const uploadImage = new Hono<Env>()
uploadImage.post('/', bodyLimit({
  maxSize: maxImageBytes,
  onError: () => { throw new ApiError(413, 'IMAGE_SIZE', 'Ukuran foto maksimal 2 MB.') },
}), async (c) => {
  if (!c.env.MEDIA) throw new ApiError(503, 'MEDIA_UNAVAILABLE', 'Penyimpanan foto belum tersedia.')
  const bytes = new Uint8Array(await c.req.arrayBuffer())
  const extension = imageExtension(bytes)
  if (!extension || c.req.header('Content-Type') !== imageMimeTypes[extension]) {
    throw new ApiError(400, 'IMAGE_TYPE', 'Unggah foto JPG, PNG, atau WebP yang valid.')
  }
  const filename = crypto.randomUUID() + '.' + extension
  await c.env.MEDIA.put(objectKey(filename), bytes, { httpMetadata: { contentType: imageMimeTypes[extension] } })
  return c.json({ data: { url: mediaPrefix + filename } }, 201)
})

export const publicMedia = new Hono<Env>()
publicMedia.get('/:filename', async (c) => {
  const filename = c.req.param('filename')
  const match = imageFilenamePattern.exec(filename)
  if (!match || !c.env.MEDIA) throw notFound('Gambar tidak ditemukan.')
  const image = await c.env.MEDIA.get(objectKey(filename))
  if (!image) throw notFound('Gambar tidak ditemukan.')
  return new Response(image.body, {
    headers: {
      'Content-Type': imageMimeTypes[match[1] as ImageExtension],
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'X-Content-Type-Options': 'nosniff',
      ETag: image.httpEtag,
    },
  })
})
