import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { DashboardClient } from '@/components/dashboard/DashboardClient'
import { query } from '@/lib/db'
import { RowDataPacket } from 'mysql2/promise'

interface Project extends RowDataPacket {
  id: number; code: string; name: string
}

export default async function DashboardPage({ params }: { params: { tenant: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const projects = await query<Project>(
    `SELECT p.id, p.code, p.name
     FROM projects p
     INNER JOIN tenants t ON t.id = p.tenant_id
     WHERE t.slug = ? AND p.deleted_at IS NULL AND p.status != 'archivado'
     ORDER BY p.name`,
    [params.tenant],
  )

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Dashboard</h1>
      <DashboardClient
        projects={projects}
        tenant={params.tenant}
        role={session.user.role}
      />
    </div>
  )
}