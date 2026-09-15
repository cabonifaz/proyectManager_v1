import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { query, execute } from '@/lib/db'
import { saveLogo, deleteOldLogo } from '@/lib/uploadLogo'

const RESERVED_SLUGS = ['admin', 'api', 'login', '_next', 'favicon.ico', 'public']
// Case-insensitive: tenants ya existentes en producción tienen el slug con mayúsculas
// (ej. "Fractal"), y forzar minúsculas al editar les cambiaría la URL y rompería su acceso.
const SLUG_RE = /^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*$/
const HEX_RE = /^#[0-9a-fA-F]{6}$/

function validateSlug(slug: string): string | null {
  if (!slug || !SLUG_RE.test(slug)) {
    return 'El identificador debe usar minúsculas, números y guiones (ej: mi-empresa)'
  }
  if (RESERVED_SLUGS.includes(slug)) {
    return `"${slug}" es una palabra reservada, elige otro identificador`
  }
  return null
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { errorResponse } = await guardRoute(req, 'tenant:update')
    if (errorResponse) return errorResponse

    const id = Number(params.id)
    const body = await req.json()

    const current = await query<any>(`SELECT slug, logo_url FROM tenants WHERE id = ? AND deleted_at IS NULL LIMIT 1`, [id])
    if (current.length === 0) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

    const fields: string[] = []
    const values: unknown[] = []

    if (body.name !== undefined) {
      const name = String(body.name).trim()
      if (!name) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
      fields.push('name = ?'); values.push(name)
    }

    let nextSlug = current[0].slug
    if (body.slug !== undefined) {
      const slug = String(body.slug).trim()
      const slugError = validateSlug(slug)
      if (slugError) return NextResponse.json({ error: slugError }, { status: 400 })

      if (slug !== current[0].slug) {
        const dup = await query(`SELECT id FROM tenants WHERE slug = ? AND id != ? AND deleted_at IS NULL LIMIT 1`, [slug, id])
        if (dup.length > 0) {
          return NextResponse.json({ error: `Ya existe una empresa con el identificador "${slug}"` }, { status: 400 })
        }
      }
      fields.push('slug = ?'); values.push(slug)
      nextSlug = slug
    }

    if (body.plan !== undefined) {
      if (!['trial', 'basic', 'pro'].includes(body.plan)) {
        return NextResponse.json({ error: 'Plan inválido' }, { status: 400 })
      }
      fields.push('plan = ?'); values.push(body.plan)
    }

    if (body.active !== undefined) {
      fields.push('active = ?'); values.push(body.active ? 1 : 0)
    }

    if (body.colorHex !== undefined) {
      const colorHex = body.colorHex === null ? null : String(body.colorHex)
      if (colorHex !== null && !HEX_RE.test(colorHex)) {
        return NextResponse.json({ error: 'El color debe ser un hex válido (#rrggbb)' }, { status: 400 })
      }
      fields.push('color_hex = ?'); values.push(colorHex)
    }

    if (body.logoDataUrl) {
      const result = await saveLogo('tenants', nextSlug, body.logoDataUrl)
      if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })
      await deleteOldLogo('tenants', current[0].logo_url)
      fields.push('logo_url = ?'); values.push(result.url)
    }

    if (fields.length === 0) {
      return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 })
    }

    values.push(id)
    await execute(`UPDATE tenants SET ${fields.join(', ')} WHERE id = ?`, values)

    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err)
  }
}
