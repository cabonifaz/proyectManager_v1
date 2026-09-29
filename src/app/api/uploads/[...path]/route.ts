import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

// next start no sirve archivos agregados a public/ despues del build, aunque
// vivan en un volumen persistente montado ahi. Esta ruta lee el disco en cada
// pedido (funciona con el volumen) en vez de depender del estatico de Next.
const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
}

export async function GET(_req: NextRequest, { params }: { params: { path: string[] } }) {
  const segments = params.path ?? []
  if (segments.length === 0 || segments.some(s => s === '..' || s.includes('/') || s.includes('\\'))) {
    return NextResponse.json({ error: 'Ruta inválida' }, { status: 400 })
  }

  const ext = path.extname(segments[segments.length - 1]).toLowerCase()
  const contentType = CONTENT_TYPES[ext]
  if (!contentType) return NextResponse.json({ error: 'Tipo de archivo no soportado' }, { status: 400 })

  const filePath = path.join(process.cwd(), 'public', 'uploads', ...segments)

  try {
    const data = await fs.readFile(filePath)
    return new NextResponse(data, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 })
  }
}
