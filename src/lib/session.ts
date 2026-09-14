import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, AppUser } from '@/lib/auth'
import { Role, Permission, hasPermission, higherRole, ForbiddenError } from '@/lib/rbac'
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

interface ProjectRoleRow extends RowDataPacket { role: Role }

/** Rol que tiene el usuario dentro de un proyecto especifico (asignado via "Asignar" en Usuarios), o null si no tiene uno. */
export async function getProjectRole(tenantId: number, projectId: number, userId: number): Promise<Role | null> {
  // project_members no tiene columna tenant_id propia; se valida el tenant via projects.tenant_id
  const rows = await query<ProjectRoleRow>(
    `SELECT pm.role FROM project_members pm
     INNER JOIN projects p ON p.id = pm.project_id
     WHERE pm.project_id = ? AND pm.user_id = ? AND p.tenant_id = ? AND pm.deleted_at IS NULL
     LIMIT 1`,
    [projectId, userId, tenantId],
  )
  return rows[0]?.role ?? null
}

/**
 * Rol efectivo de un usuario para un proyecto: el mayor entre su rol global y el rol que
 * tenga asignado en ESE proyecto (project_members.role). super_admin siempre es super_admin.
 * Sin projectId, el rol efectivo es simplemente el rol global.
 */
export async function getEffectiveRole(ctx: RequestContext, projectId: number | null): Promise<Role> {
  if (!projectId || ctx.role === 'super_admin') return ctx.role
  const projectRole = await getProjectRole(ctx.tenantId, projectId, ctx.userId)
  return projectRole ? higherRole(ctx.role, projectRole) : ctx.role
}

/** Verifica un permiso usando el rol EFECTIVO (elevado por rol de proyecto si aplica). Devuelve la respuesta 403 o null si pasa. */
export async function requireProjectPermission(
  ctx: RequestContext,
  permission: Permission,
  projectId: number | null,
): Promise<NextResponse | null> {
  const effectiveRole = await getEffectiveRole(ctx, projectId)
  if (!hasPermission(effectiveRole, permission)) {
    return NextResponse.json({ error: `Permiso requerido: ${permission}` }, { status: 403 })
  }
  return null
}

/** Como guardRoute, pero el permiso se evalua contra el rol efectivo del proyecto (ya conocido) en vez del rol global. */
export async function guardProjectRoute(
  req: NextRequest,
  permission: Permission,
  projectId: number | null,
): Promise<{ ctx: RequestContext; errorResponse: null } | { ctx: null; errorResponse: NextResponse }> {
  const ctx = await getContextFromHeaders(req)
  if (!ctx) {
    return { ctx: null, errorResponse: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
  }

  const errorResponse = await requireProjectPermission(ctx, permission, projectId)
  if (errorResponse) return { ctx: null, errorResponse }

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
