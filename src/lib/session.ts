import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, AppUser } from '@/lib/auth'
import { Role, Permission, hasPermission, ForbiddenError } from '@/lib/rbac'
import { query } from '@/lib/db'
import { RowDataPacket } from 'mysql2/promise'

export interface RequestContext {
  tenantId:   number
  tenantSlug: string
  userId:     number
  role:       Role
  user:       AppUser
}

interface TenantIdRow extends RowDataPacket { id: number; slug: string }

export async function getContextFromHeaders(req: NextRequest): Promise<RequestContext | null> {
  const tenantId   = req.headers.get('x-tenant-id')
  const tenantSlug = req.headers.get('x-tenant-slug')
  const userId     = req.headers.get('x-user-id')
  const role       = req.headers.get('x-user-role') as Role | null

  if (!tenantId || !tenantSlug || !userId || !role) return null

  let effectiveTenantId   = Number(tenantId)
  let effectiveTenantSlug = tenantSlug

  // super_admin puede navegar a /<otro-tenant>/... : el tenant de sus propios headers
  // (su sesion) no es el tenant que esta viendo, hay que resolverlo desde la URL.
  if (role === 'super_admin') {
    const urlSlug = req.nextUrl.pathname.match(/^\/api\/([^/]+)\//)?.[1] ?? null
    if (urlSlug && urlSlug !== tenantSlug) {
      const rows = await query<TenantIdRow>(
        `SELECT id, slug FROM tenants WHERE slug = ? AND deleted_at IS NULL AND active = 1 LIMIT 1`,
        [urlSlug],
      )
      if (rows[0]) {
        effectiveTenantId   = rows[0].id
        effectiveTenantSlug = rows[0].slug
      }
    }
  }

  return {
    tenantId:   effectiveTenantId,
    tenantSlug: effectiveTenantSlug,
    userId:     Number(userId),
    role,
    user: { tenantId: effectiveTenantId, tenantSlug: effectiveTenantSlug, role } as AppUser,
  }
}

export async function getSessionUser(): Promise<AppUser | null> {
  const session = await getServerSession(authOptions)
  return session?.user ?? null
}

export async function guardRoute(
  req: NextRequest,
  permission: Permission,
): Promise<{ ctx: RequestContext; errorResponse: null } | { ctx: null; errorResponse: NextResponse }> {
  const ctx = await getContextFromHeaders(req)

  if (!ctx) {
    return { ctx: null, errorResponse: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
  }

  if (!hasPermission(ctx.role, permission)) {
    return { ctx: null, errorResponse: NextResponse.json({ error: `Permiso requerido: ${permission}` }, { status: 403 }) }
  }

  return { ctx, errorResponse: null }
}

export async function guardRouteAll(
  req: NextRequest,
  permissions: Permission[],
): Promise<{ ctx: RequestContext; errorResponse: null } | { ctx: null; errorResponse: NextResponse }> {
  const ctx = await getContextFromHeaders(req)

  if (!ctx) {
    return { ctx: null, errorResponse: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
  }

  const missing = permissions.filter((p) => !hasPermission(ctx.role, p))
  if (missing.length > 0) {
    return { ctx: null, errorResponse: NextResponse.json({ error: `Permisos requeridos: ${missing.join(', ')}` }, { status: 403 }) }
  }

  return { ctx, errorResponse: null }
}

export function apiError(message: string, status = 500): NextResponse {
  return NextResponse.json({ error: message }, { status })
}

export function handleApiError(err: unknown): NextResponse {
  if (err instanceof ForbiddenError) return apiError(err.message, 403)
  const message = err instanceof Error ? err.message : 'Error interno del servidor'
  console.error('[API Error]', err)
  return apiError(message, 500)
}
