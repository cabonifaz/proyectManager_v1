import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query } from '@/lib/db'
import { RowDataPacket } from 'mysql2/promise'
import { TenantsAdminClient } from '@/components/admin/TenantsAdminClient'

interface TenantRow extends RowDataPacket {
  id: number
  name: string
  slug: string
  plan: 'trial' | 'basic' | 'pro'
  active: number
  logo_url: string | null
  color_hex: string | null
}

export default async function TenantsHomePage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user.role !== 'super_admin') redirect(`/${session.user.tenantSlug}/projects`)

  const tenants = await query<TenantRow>(
    `SELECT id, name, slug, plan, active, logo_url, color_hex
     FROM tenants
     WHERE deleted_at IS NULL
     ORDER BY name`,
  )

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-semibold mb-6">Empresas</h1>
        <TenantsAdminClient tenants={tenants} />
      </div>
    </div>
  )
}
