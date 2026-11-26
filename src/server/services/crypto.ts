const encoder = new TextEncoder()
const toHex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
export function randomHex(size: number) {
  return toHex(crypto.getRandomValues(new Uint8Array(size)))
}
export async function digest(text: string) {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text))))
}
export function equals(a: string, b: string) {
  let diff = a.length ^ b.length
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ (b.charCodeAt(i) || 0)
  return diff === 0
}
const iterations = 100_000
export async function passwordHash(password: string, salt = randomHex(32)) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations }, key, 256)
  return 'pbkdf2-sha256:' + iterations + ':' + salt + ':' + toHex(new Uint8Array(bits))
}
export async function verifyPassword(password: string, stored: string | undefined) {
  const salt = stored?.split(':')[2] ?? '0'.repeat(64)
  const actual = await passwordHash(password, salt)
  return equals(actual, stored ?? '0'.repeat(actual.length)) && Boolean(stored)
}
