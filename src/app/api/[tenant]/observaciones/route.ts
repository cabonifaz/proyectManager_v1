import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { callProcedure, callProcedureOut } from '@/lib/db'
import { RowDataPacket } from 'mysql2/promise'

export async function GET(req: NextRequest) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'observacion:read')
    if (errorResponse) return errorResponse

    const { searchParams } = req.nextUrl
    const projectId = searchParams.get('projectId')
    if (!projectId) return NextResponse.json({ error: 'projectId requerido' }, { status: 400 })

    const estado = searchParams.get('estado') ?? null
    const tipo   = searchParams.get('tipo')   ?? null
    const search = searchParams.get('search') ?? null
    const limit  = Number(searchParams.get('limit')  ?? 200)
    const offset = Number(searchParams.get('offset') ?? 0)

    const results = await callProcedure<RowDataPacket>(
      'CALL sp_observacion_list(?, ?, ?, ?, ?, ?, ?)',
      [ctx.tenantId, Number(projectId), estado, tipo, search, limit, offset],
    )

    return NextResponse.json({ data: results[0] ?? [] })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'observacion:create')
    if (errorResponse) return errorResponse

    let body: Record<string, unknown> = {}
    try { body = await req.json() } catch {
      return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
    }

    const result = await callProcedureOut(
      'sp_observacion_create',
      {
        p_tenant_id:       ctx.tenantId,
        p_project_id:      body.projectId,
        p_backlog_item_id: body.backlogItemId ?? null,
        p_tipo:            body.tipo,
        p_prioridad:       body.prioridad     ?? 'media',
        p_titulo:          body.titulo,
        p_descripcion:     body.descripcion   ?? null,
        p_eta:             body.eta           ?? null,
        p_estado:          body.estado        ?? 'abierta', // 🚀 Dato 9
        p_entregado_at:    body.entregadoAt   ?? null,      // 🚀 Dato 10
        p_created_by:      ctx.userId,                      // 🚀 Dato 11
      },
      ['p_new_id', 'p_error'],                              // 🚀 Datos 12 y 13 (Salida)
    )

    if (result.p_error) return NextResponse.json({ error: result.p_error }, { status: 400 })
    return NextResponse.json({ id: result.p_new_id }, { status: 201 })
  } catch (err) {
    return handleApiError(err)
  }
}
