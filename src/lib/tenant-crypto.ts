import { createCipheriv, createDecipheriv } from 'crypto'

const ALG = 'aes-256-ecb'

function key(): Buffer {
  const hex = process.env.TENANT_CRYPTO_KEY
  if (!hex || hex.length !== 64) throw new Error('TENANT_CRYPTO_KEY must be 64 hex chars')
  return Buffer.from(hex, 'hex')
}

export function encryptSlug(slug: string): string {
  const cipher = createCipheriv(ALG, key(), null)
  return Buffer.concat([cipher.update(slug, 'utf8'), cipher.final()]).toString('base64url')
}

export function decryptSlug(token: string): string {
  const decipher = createDecipheriv(ALG, key(), null)
  return Buffer.concat([decipher.update(Buffer.from(token, 'base64url')), decipher.final()]).toString('utf8')
}
