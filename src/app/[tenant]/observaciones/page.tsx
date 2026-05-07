import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ObservacionesClient } from '@/components/observaciones/ObservacionesClient'
import { callProcedure } from '@/lib/db'
import { RowDataPacket } from 'mysql2/promise'

interface Project extends RowDataPacket {
  id: number
  code: string
  name: string
  is_member: number
}

export default async function ObservacionesPage({ params }: { params: { tenant: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const projects = await callProcedure<Project>(
    'CALL sp_project_list(?, ?, ?)',
    [session.user.tenantId, 'activo', session.user.id],
  )

  const projectData = projects[0] || []

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Observaciones</h1>
      <ObservacionesClient
        projects={projectData}
        tenant={params.tenant}
        role={session.user.role as any}
      />
    </div>
  )
}
