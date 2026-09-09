import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query } from '@/lib/db'
import { RowDataPacket } from 'mysql2/promise'
import { Sidebar } from '@/components/Sidebar'
import { tenantAccentStyle } from '@/lib/color'

interface Props {
  children: React.ReactNode
}

interface TenantBrandRow extends RowDataPacket {
  name: string
  logo_url: string | null
  color_hex: string | null
}

export default async function AdminLayout({ children }: Props) {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }
  if (session.user.role !== 'super_admin') {
    redirect(`/${session.user.tenantSlug}/projects`)
  }

  const brandRows = await query<TenantBrandRow>(
    `SELECT name, logo_url, color_hex FROM tenants WHERE slug = ? AND deleted_at IS NULL LIMIT 1`,
    [session.user.tenantSlug],
  )
  const brand = brandRows[0] ?? { name: session.user.tenantSlug, logo_url: null, color_hex: null }

  return (
    <div className="flex h-screen bg-gray-100" style={tenantAccentStyle(brand.color_hex)}>
      <Sidebar
        tenant={session.user.tenantSlug}
        tenantName={brand.name}
        logoUrl={brand.logo_url}
        role={session.user.role}
        userName={session.user.name}
      />
      <main className="flex-1 overflow-x-auto overflow-y-scroll p-6">
        {children}
      </main>
    </div>
  )
}
