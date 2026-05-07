import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { UsersClient } from '@/components/users/UsersClient'
import { query } from '@/lib/db'
import { RowDataPacket } from 'mysql2/promise'

interface Project extends RowDataPacket { id: number; code: string; name: string }

export default async function UsersPage({ params }: { params: { tenant: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  if (!['super_admin','gestor_proyecto'].includes(session.user.role)) {
    redirect(`/${params.tenant}/projects`)
  }

  const projects = await query<Project>(
    `SELECT id, code, name
     FROM projects
     WHERE tenant_id = ? AND deleted_at IS NULL AND status != 'archivado'
     ORDER BY name`,
    [session.user.tenantId],
  )

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Usuarios</h1>
      <UsersClient
        projects={projects}
        tenant={params.tenant}
        role={session.user.role}
        currentUserId={session.user.id}
      />
    </div>
  )
}