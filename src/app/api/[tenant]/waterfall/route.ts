import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { query } from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: { tenant: string } }) {
  try {
    const { searchParams } = req.nextUrl
    const projectId = Number(searchParams.get('projectId'))
    
    if (!projectId) return NextResponse.json({ error: 'projectId requerido' }, { status: 400 })

    // Usamos 'project:read' o tu permiso de lectura equivalente
    const { ctx, errorResponse } = await guardRoute(req, 'project:read')
    if (errorResponse) return errorResponse

    // 1. Traer tareas con su responsable
    const tasks: any = await query(
      `SELECT t.id, t.parent_id, t.task_type, t.description, t.sort_order, r.name as resource_name 
       FROM wf_tasks t 
       LEFT JOIN wf_resources r ON t.resource_id = r.id 
       WHERE t.project_id = ? 
       ORDER BY t.sort_order ASC`,
      [projectId]
    )

    // 2. Traer la línea de tiempo (los cuadritos de colores) y su respectiva configuración de color
    const timeline: any = await query(
      `SELECT tl.task_id, tl.target_date, tl.sprint_label, d.status_key, d.color_hex, d.text_color 
       FROM wf_task_timeline tl 
       JOIN wf_tasks t ON tl.task_id = t.id 
       JOIN wf_status_dictionary d ON tl.status_id = d.id 
       WHERE t.project_id = ?`,
      [projectId]
    )

    return NextResponse.json({ tasks, timeline })
  } catch (err) {
    return handleApiError(err)
  }
}