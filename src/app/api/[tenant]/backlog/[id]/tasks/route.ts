import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { callProcedureOut, query } from '@/lib/db'

// GET: Obtiene todas las tareas de un ticket específico
export async function GET(req: NextRequest, { params }: { params: { tenant: string; id: string } }) {
  try {
    const { errorResponse } = await guardRoute(req, 'backlog:read')
    if (errorResponse) return errorResponse

   // 🚀 CORRECCIÓN: Agregado el filtro AND deleted_at IS NULL
   const rows: any = await query(
      `SELECT id, backlog_item_id, descripcion, peso, completado, completado_at, created_by, created_at 
       FROM backlog_item_tasks 
       WHERE backlog_item_id = ? AND deleted_at IS NULL
       ORDER BY created_at ASC`,
      [Number(params.id)]
    )

    return NextResponse.json({ data: rows })
  } catch (err) {
    return handleApiError(err)
  }
}

// POST: Crea una nueva tarea dentro de un ticket
export async function POST(req: NextRequest, { params }: { params: { tenant: string; id: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'backlog:create')
    if (errorResponse) return errorResponse

    const body = await req.json()
    const { descripcion, peso } = body

    if (!descripcion || descripcion.trim() === '') {
      return NextResponse.json({ error: 'La descripción es obligatoria' }, { status: 400 })
    }

    const result: any = await callProcedureOut('sp_task_create', {
      p_backlog_item_id: Number(params.id),
      p_descripcion: descripcion.trim(),
      p_peso: Number(peso) || 0,
      p_created_by: ctx.userId
    }, ['p_new_id', 'p_error'])

    if (result.p_error) {
      return NextResponse.json({ error: result.p_error }, { status: 400 })
    }

    return NextResponse.json({ id: result.p_new_id, message: 'Tarea creada con éxito' })
  } catch (err) {
    return handleApiError(err)
  }
}