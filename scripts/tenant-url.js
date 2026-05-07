const { createCipheriv } = require('crypto')
const { readFileSync } = require('fs')
const { join } = require('path')

const slug = process.argv[2]
if (!slug) {
  console.error('Usage: node scripts/tenant-url.js <slug>')
  process.exit(1)
}

const env = readFileSync(join(__dirname, '../.env.local'), 'utf8')
const match = env.match(/^TENANT_CRYPTO_KEY=(.+)$/m)
if (!match) {
  console.error('TENANT_CRYPTO_KEY not found in .env.local')
  process.exit(1)
}

const key = Buffer.from(match[1].trim(), 'hex')

function encrypt(text) {
  const cipher = createCipheriv('aes-256-ecb', key, null)
  return Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]).toString('base64url')
}

const token = encrypt(slug)
const base = (env.match(/^NEXTAUTH_URL=(.+)$/m) ?? [])[1]?.trim() ?? 'http://localhost:3000'

console.log(`Login : ${base}/login?slug=${token}`)
console.log(`App   : ${base}/${token}/projects`)
