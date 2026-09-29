import { promises as fs } from 'fs'
import path from 'path'

const MAX_LOGO_BYTES = 2 * 1024 * 1024
const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

/** Guarda un logo (data URL) en public/uploads/<folder>/. Usado por tenants y proyectos. */
export async function saveLogo(folder: string, slug: string, dataUrl: string): Promise<{ url?: string; error?: string }> {
  const match = /^data:(image\/(?:png|jpeg|webp|svg\+xml));base64,(.+)$/.exec(dataUrl)
  if (!match) return { error: 'Formato de imagen no soportado (usa PNG, JPG, WEBP o SVG)' }

  const [, mime, base64] = match
  const ext = MIME_EXT[mime]
  const buffer = Buffer.from(base64, 'base64')

  if (buffer.byteLength > MAX_LOGO_BYTES) {
    return { error: 'El logo no puede superar 2MB' }
  }

  const dir = path.join(process.cwd(), 'public', 'uploads', folder)
  await fs.mkdir(dir, { recursive: true })

  const filename = `${slug}-${Date.now()}.${ext}`
  await fs.writeFile(path.join(dir, filename), buffer)

  // Servido por /api/uploads/[...path] (lee el disco en cada pedido), NO como
  // estático de Next: next start no sirve archivos agregados a public/ después
  // del build, aunque el volumen persistente sí los tenga guardados.
  return { url: `/api/uploads/${folder}/${filename}` }
}

export async function deleteOldLogo(folder: string, oldUrl: string | null | undefined) {
  if (!oldUrl) return
  const prefix = oldUrl.startsWith(`/api/uploads/${folder}/`)
    ? `/api/uploads/${folder}/`
    : oldUrl.startsWith(`/uploads/${folder}/`)
      ? `/uploads/${folder}/`
      : null
  if (!prefix) return
  try {
    const filename = oldUrl.slice(prefix.length)
    await fs.unlink(path.join(process.cwd(), 'public', 'uploads', folder, filename))
  } catch {
    // best-effort: si no existe o falla el borrado, seguimos sin romper la actualización
  }
}
