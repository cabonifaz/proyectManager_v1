import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { SprintClient } from '@/components/sprint/SprintClient'
import { callProcedure, query } from '@/lib/db'
import { RowDataPacket } from 'mysql2/promise'

interface Project extends RowDataPacket {
  id: number; 
  code: string; 
  name: string;
  is_member: number;
}

interface Member extends RowDataPacket {
  id: number; 
  name: string; 
  role: string;
}

export default async function SprintPage({ params }: { params: { tenant: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const { user } = session

  // Llamamos al SP para obtener proyectos filtrados por pertenencia
  const projectsResult = await callProcedure<Project>(
    'CALL sp_project_list(?, ?, ?)',
    [
      user.tenantId, 
      'activo', 
      user.id
    ]
  )
  const projects = projectsResult[0] || []

  // Miembros del tenant para los formularios
  const members = await query<Member>(
    `SELECT id, name, role
     FROM users
     WHERE tenant_id = ? AND deleted_at IS NULL AND active = 1
     ORDER BY name`,
    [user.tenantId],
  )

  return (
    <div className="h-full flex flex-col">
      <h1 className="text-base font-semibold mb-2 shrink-0">Sprints</h1>
      <div className="flex-1 min-h-0">
        <SprintClient
          projects={projects}
          members={members}
          tenant={params.tenant}
          role={user.role as any}
          userId={user.id}
        />
      </div>
    </div>
  )
}