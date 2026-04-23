import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { SprintClient } from '@/components/sprint/SprintClient'
import { callProcedure, query } from '@/lib/db'
import { RowDataPacket } from 'mysql2/promise'

interface Project extends RowDataPacket {
  id: number; code: string; name: string
}

interface Member extends RowDataPacket {
  id: number; name: string; role: string
}

export default async function SprintPage({ params }: { params: { tenant: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const { user } = session
  const isSuperAdmin = user.role === 'super_admin'

  // Super admin ve todos los proyectos
  // PM y DEV solo ven sus proyectos asignados
  let projects: Project[] = []

  if (isSuperAdmin) {
    projects = await query<Project>(
      `SELECT p.id, p.code, p.name
       FROM projects p
       INNER JOIN tenants t ON t.id = p.tenant_id
       WHERE t.slug = ? AND p.deleted_at IS NULL AND p.status != 'archivado'
       ORDER BY p.name`,
      [params.tenant],
    )
  } else {
    projects = await query<Project>(
      `SELECT p.id, p.code, p.name
       FROM projects p
       INNER JOIN tenants t ON t.id = p.tenant_id
       INNER JOIN project_members pm ON pm.project_id = p.id
                                    AND pm.user_id = ?
                                    AND pm.deleted_at IS NULL
       WHERE t.slug = ? AND p.deleted_at IS NULL AND p.status != 'archivado'
       ORDER BY p.name`,
      [user.id, params.tenant],
    )
  }

  // Miembros del tenant para asignación de talentos
  const members = await query<Member>(
    `SELECT u.id, u.name, u.role
     FROM users u
     INNER JOIN tenants t ON t.id = u.tenant_id
     WHERE t.slug = ? AND u.deleted_at IS NULL AND u.active = 1
     ORDER BY u.name`,
    [params.tenant],
  )

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Sprint</h1>
      <SprintClient
        projects={projects}
        members={members}
        tenant={params.tenant}
        role={user.role}
        userId={user.id}
      />
    </div>
  )
}