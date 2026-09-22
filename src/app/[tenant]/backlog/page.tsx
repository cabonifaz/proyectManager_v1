import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { BacklogClient } from '@/components/backlog/BacklogClient'
import { callProcedure } from '@/lib/db' // Cambiamos query por callProcedure
import { RowDataPacket } from 'mysql2/promise'

interface Project extends RowDataPacket {
  id: number
  code: string
  name: string
  is_member: number // Ahora sí recibimos esta columna del SP
}

export default async function BacklogPage({ params }: { params: { tenant: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  /**
   * CORRECCIÓN CRÍTICA:
   * Usamos el procedimiento almacenado sp_project_list.
   * Este ya filtra por tenant, por deleted_at y calcula el is_member
   * basándose en si el usuario es gestor_proyecto.
   */
  const projects = await callProcedure<Project>(
    'CALL sp_project_list(?, ?, ?)',
    [
      session.user.tenantId, // ID del tenant
      'activo',              // Filtramos por proyectos con status activo
      session.user.id        // ID del usuario para calcular is_member
    ]
  )

  // callProcedure devuelve un array de arrays, tomamos el primero
  const projectData = projects[0] || []

  return (
    <div className="h-full flex flex-col">
      <h1 className="text-base font-semibold mb-2 shrink-0">Backlog</h1>
      <div className="flex-1 min-h-0">
        <BacklogClient
          projects={projectData}
          tenant={params.tenant}
          role={session.user.role as any}
        />
      </div>
    </div>
  )
}