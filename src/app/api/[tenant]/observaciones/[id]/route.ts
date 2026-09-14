import { NextRequest, NextResponse } from 'next/server'
import { getContextFromHeaders, requireProjectPermission, handleApiError } from '@/lib/session'
import { callProcedureOut, query } from '@/lib/db'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await getContextFromHeaders(req)
    if (!ctx) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const obsRows: any = await query(`SELECT project_id FROM observaciones WHERE id = ? AND deleted_at IS NULL LIMIT 1`, [Number(params.id)])
    if (!obsRows || obsRows.length === 0) return NextResponse.json({ error: 'Observación no encontrada' }, { status: 404 })

    const permError = await requireProjectPermission(ctx, 'observacion:update', obsRows[0].project_id)
    if (permError) return permError

    let body: Record<string, any> = {}
    try { body = await req.json() } catch {
      return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
    }

    // 🛡️ LIMPIEZA DE SEGURIDAD PARA EVITAR DATA TRUNCATED
    // Si 'tipo' o 'prioridad' vienen vacíos o indefinidos, forzamos un valor seguro
    const safeTipo = body.tipo ? String(body.tipo).trim().substring(0, 20) : 'nota';
    const safePrioridad = body.prioridad ? String(body.prioridad).trim().substring(0, 20) : '0';

    const result = await callProcedureOut(
      'sp_observacion_update',
      {
        p_tenant_id:       ctx.tenantId,
        p_id:              Number(params.id),
        p_backlog_item_id: body.backlogItemId ?? null, // 🚀 AHORA SÍ ENVIAMOS EL TICKET
        p_tipo:            safeTipo,
        p_prioridad:       safePrioridad,
        p_titulo:          body.titulo ?? 'Sin título',
        p_descripcion:     body.descripcion ?? null,
        p_estado:          body.estado ?? 'abierta',
        p_eta:             body.eta ?? null,
        p_entregado_at:    body.entregadoAt ?? null,
        p_updated_by:      ctx.userId,
      },
      ['p_error'],
    )

    if (result.p_error) return NextResponse.json({ error: result.p_error }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await getContextFromHeaders(req)
    if (!ctx) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const obsRows: any = await query(`SELECT project_id FROM observaciones WHERE id = ? AND deleted_at IS NULL LIMIT 1`, [Number(params.id)])
    if (!obsRows || obsRows.length === 0) return NextResponse.json({ error: 'Observación no encontrada' }, { status: 404 })

    const permError = await requireProjectPermission(ctx, 'observacion:delete', obsRows[0].project_id)
    if (permError) return permError

    const result = await callProcedureOut(
      'sp_observacion_delete',
      {
        p_tenant_id:  ctx.tenantId,
        p_id:         Number(params.id),
        p_deleted_by: ctx.userId,
      },
      ['p_error'],
    )

    if (result.p_error) return NextResponse.json({ error: result.p_error }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err)
  }
}
