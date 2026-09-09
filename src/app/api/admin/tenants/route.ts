import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { query, execute, callProcedureOut } from '@/lib/db'
import { generatePassword } from '@/lib/password'
import bcrypt from 'bcryptjs'
import { RowDataPacket } from 'mysql2/promise'

const RESERVED_SLUGS = ['admin', 'api', 'login', '_next', 'favicon.ico', 'public']
const SLUG_RE = /^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*$/

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
    const { ctx, errorResponse } = await guardRoute(req, 'tenant:create')
    if (errorResponse) return errorResponse

    const body = await req.json()
    const name       = String(body.name ?? '').trim()
    const slug       = String(body.slug ?? '').trim().toLowerCase()
    const plan       = String(body.plan ?? 'trial')
    const adminName  = String(body.adminName ?? '').trim()
    const adminEmail = String(body.adminEmail ?? '').trim().toLowerCase()

    if (!name) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    if (!adminName)  return NextResponse.json({ error: 'El nombre del administrador es obligatorio' }, { status: 400 })
    if (!adminEmail) return NextResponse.json({ error: 'El email del administrador es obligatorio' }, { status: 400 })

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
    const tenantId = result.insertId

    // Usuario administrador del nuevo tenant (rol mas alto disponible dentro de un tenant)
    const adminPassword = generatePassword()
    const hashedPassword = await bcrypt.hash(adminPassword, 10)

    const userResult = await callProcedureOut(
      'sp_user_upsert',
      {
        p_tenant_id:    tenantId,
        p_user_id:      null,
        p_name:         adminName,
        p_email:        adminEmail,
        p_password:     hashedPassword,
        p_role:         'gestor_proyecto',
        p_active:       1,
        p_user_id_exec: Number(ctx.userId),
      },
      ['p_result_id', 'p_error'],
    )

    if (userResult.p_error) {
      return NextResponse.json({ error: `Empresa creada, pero error al crear el administrador: ${userResult.p_error}` }, { status: 400 })
    }

    return NextResponse.json({ id: tenantId, adminPassword }, { status: 201 })
  } catch (err) {
    return handleApiError(err)
  }
}
