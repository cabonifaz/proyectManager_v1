import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

const PUBLIC_PATHS      = ['/login', '/api/auth']
const SUPER_ADMIN_PATHS = ['/admin']
const SUPER_ADMIN_API_PATHS = ['/api/admin', '/api/tenants']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (isPublic(pathname)) return NextResponse.next()

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })

  if (!token?.user) {
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  const { role, tenantSlug, tenantId, encryptedSlug } = token.user

  if (isSuperAdminRoute(pathname) && role !== 'super_admin') {
    return forbidden(req)
  }

  const tenantFromPath = extractTenantSlug(pathname)
  if (tenantFromPath && tenantFromPath !== encryptedSlug && role !== 'super_admin') {
    return forbidden(req)
  }

  const response = NextResponse.next()
  response.headers.set('x-tenant-id',   String(tenantId))
  response.headers.set('x-tenant-slug', tenantSlug)
  response.headers.set('x-user-role',   role)
  response.headers.set('x-user-id',     String(token.user.id))

  return response
}

function isPublic(pathname: string): boolean {
  return (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    /\.(png|jpg|svg|ico|css|js)$/.test(pathname)
  )
}

function isSuperAdminRoute(pathname: string): boolean {
  return (
    SUPER_ADMIN_PATHS.some((p) => pathname.startsWith(p)) ||
    SUPER_ADMIN_API_PATHS.some((p) => pathname.startsWith(p))
  )
}

function extractTenantSlug(pathname: string): string | null {
  const match =
    pathname.match(/^\/([^/]+)\/(?:projects|backlog|sprint|dashboard)/) ??
    pathname.match(/^\/api\/([^/]+)\//)
  return match?.[1] ?? null
}

function forbidden(req: NextRequest): NextResponse {
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const url = req.nextUrl.clone()
  url.pathname = '/login'
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}