import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, AppUser } from '@/lib/auth'
import { Role, Permission, hasPermission, ForbiddenError } from '@/lib/rbac'

export interface RequestContext {
  tenantId:   number
  tenantSlug: string
  userId:     number
  role:       Role
  user:       AppUser
}

export function getContextFromHeaders(req: NextRequest): RequestContext | null {
  const tenantId   = req.headers.get('x-tenant-id')
  const tenantSlug = req.headers.get('x-tenant-slug')
  const userId     = req.headers.get('x-user-id')
  const role       = req.headers.get('x-user-role') as Role | null

  if (!tenantId || !tenantSlug || !userId || !role) return null

  return {
    tenantId:   Number(tenantId),
    tenantSlug,
    userId:     Number(userId),
    role,
    user: { tenantId: Number(tenantId), tenantSlug, role } as AppUser,
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
  const ctx = getContextFromHeaders(req)

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
  const ctx = getContextFromHeaders(req)

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