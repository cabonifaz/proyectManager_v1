import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { query, execute } from '@/lib/db'
import { RowDataPacket } from 'mysql2/promise'

const RESERVED_SLUGS = ['admin', 'api', 'login', '_next', 'favicon.ico', 'public']
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

interface TenantRow extends RowDataPacket {
  id: number
  name: string
  slug: string
  plan: string
  active: number
  logo_url: string | null
  color_hex: string | null
}

function validateSlug(slug: string): string | null {
  if (!slug || !SLUG_RE.test(slug)) {
    return 'El identificador debe usar minúsculas, números y guiones (ej: mi-empresa)'
  }
  if (RESERVED_SLUGS.includes(slug)) {
    return `"${slug}" es una palabra reservada, elige otro identificador`
  }
  return null
}

export async function GET(req: NextRequest) {
  try {
    const { errorResponse } = await guardRoute(req, 'tenant:read')
    if (errorResponse) return errorResponse

    const rows = await query<TenantRow>(
      `SELECT id, name, slug, plan, active, logo_url, color_hex
       FROM tenants
       WHERE deleted_at IS NULL
       ORDER BY name`,
    )
    return NextResponse.json({ data: rows })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { errorResponse } = await guardRoute(req, 'tenant:create')
    if (errorResponse) return errorResponse

    const body = await req.json()
    const name = String(body.name ?? '').trim()
    const slug = String(body.slug ?? '').trim().toLowerCase()
    const plan = String(body.plan ?? 'trial')

    if (!name) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })

    const slugError = validateSlug(slug)
    if (slugError) return NextResponse.json({ error: slugError }, { status: 400 })

    if (!['trial', 'basic', 'pro'].includes(plan)) {
      return NextResponse.json({ error: 'Plan inválido' }, { status: 400 })
    }

    const existing = await query(`SELECT id FROM tenants WHERE slug = ? AND deleted_at IS NULL LIMIT 1`, [slug])
    if (existing.length > 0) {
      return NextResponse.json({ error: `Ya existe una empresa con el identificador "${slug}"` }, { status: 400 })
    }

    const result = await execute(
      `INSERT INTO tenants (name, slug, plan, active) VALUES (?, ?, ?, 1)`,
      [name, slug, plan],
    )

    return NextResponse.json({ id: result.insertId }, { status: 201 })
  } catch (err) {
    return handleApiError(err)
  }
}
