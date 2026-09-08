import { Suspense } from 'react'
import { query } from '@/lib/db'
import { tenantAccentStyle } from '@/lib/color'
import { RowDataPacket } from 'mysql2/promise'
import LoginForm from './LoginForm'

interface Props {
  searchParams: { slug?: string }
}

interface TenantBrandRow extends RowDataPacket {
  name: string
  logo_url: string | null
  color_hex: string | null
}

export default async function LoginPage({ searchParams }: Props) {
  const tenantSlug = searchParams.slug ?? ''

  let brand: { name: string; logoUrl: string | null; colorHex: string | null } | null = null
  if (tenantSlug) {
    const rows = await query<TenantBrandRow>(
      `SELECT name, logo_url, color_hex FROM tenants WHERE slug = ? AND deleted_at IS NULL AND active = 1 LIMIT 1`,
      [tenantSlug],
    )
    if (rows[0]) {
      brand = { name: rows[0].name, logoUrl: rows[0].logo_url, colorHex: rows[0].color_hex }
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-gray-50"
      style={tenantAccentStyle(brand?.colorHex)}
    >
      <Suspense fallback={<div className="text-gray-400 font-medium">Cargando...</div>}>
        <LoginForm slug={tenantSlug} brand={brand} />
      </Suspense>
    </div>
  )
}
