export const maxImageBytes = 2 * 1024 * 1024
export const imageMimeTypes = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
} as const

export type ImageExtension = keyof typeof imageMimeTypes
export const imageFilenamePattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\.(jpg|png|webp)$/
export const mediaPrefix = '/media/'

export function isMediaImage(value: string) {
  return value.startsWith(mediaPrefix) && imageFilenamePattern.test(value.slice(mediaPrefix.length))
}
