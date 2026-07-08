import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { callProcedureOut, query } from '@/lib/db'

// GET: Obtener los IDs de los usuarios asignados a un proyecto
export async function GET(req: NextRequest, { params }: { params: { tenant: string; id: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'project:read')
    if (errorResponse) return errorResponse

    const rows: any = await query(
      `SELECT pm.user_id, pm.role, u.name
       FROM project_members pm
       INNER JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id = ?
         AND pm.deleted_at IS NULL
         AND u.deleted_at  IS NULL
       ORDER BY u.name`,
      [Number(params.id)]
    )
    return NextResponse.json({ data: rows })
  } catch (err) {
    return handleApiError(err)
  }
}

// POST: Sincronizar (Agregar/Quitar) miembros masivamente
export async function POST(req: NextRequest, { params }: { params: { tenant: string; id: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'project:update')
    if (errorResponse) return errorResponse

    const projectId = Number(params.id)
    const { userIds } = await req.json() // Recibe un array [1, 4, 5...]

    // Traemos a los miembros actuales directamente de la BD
    const currentRows: any = await query(
      'SELECT user_id FROM project_members WHERE project_id = ? AND deleted_at IS NULL', 
      [projectId]
    )
    const currentUserIds = currentRows.map((r: any) => r.user_id)

    // Calculamos las diferencias
    const toAdd = userIds.filter((id: number) => !currentUserIds.includes(id))
    const toRemove = currentUserIds.filter((id: number) => !userIds.includes(id))

    // 1. Agregar nuevos miembros
    for (const uid of toAdd) {
      await callProcedureOut('sp_project_member_upsert', {
        p_tenant_id: ctx.tenantId,
        p_project_id: projectId,
        p_user_id: uid,
        p_role: 'desarrollador', // Rol por defecto, se puede cambiar luego
        p_executed_by: ctx.userId
      }, ['p_error'])
    }

    // 2. Remover miembros desmarcados
    for (const uid of toRemove) {
      await callProcedureOut('sp_project_member_remove', {
        p_tenant_id: ctx.tenantId,
        p_project_id: projectId,
        p_user_id: uid,
        p_executed_by: ctx.userId
      }, ['p_error'])
    }

    return NextResponse.json({ success: true, message: 'Miembros sincronizados correctamente' })
  } catch (err) {
    return handleApiError(err)
  }
}