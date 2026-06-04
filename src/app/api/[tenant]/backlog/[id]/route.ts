import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { callProcedureOut, query } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: { tenant: string; id: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'backlog:update')
    if (errorResponse) return errorResponse

    const id = Number(params.id)
    const body = await req.json()

    // 1. Guardar la data general a través del Procedimiento Almacenado
    const result = await callProcedureOut(
      'sp_backlog_update',
      {
        p_tenant_id:    ctx.tenantId,
        p_item_id:      id,
        p_module:       body.module      ?? null,
        p_description:  body.description ?? null,
        p_progress:     body.progress    ?? null,
        p_status:       body.status      ?? null,
        p_sprint_num:   body.sprintNum   ?? null,
        p_eta:          body.eta         ?? null,
        p_comment:      body.comment     ?? null,
        p_updated_by:   ctx.userId,
        p_eta_explicit: 'eta' in body ? 1 : 0,
      },
      ['p_error']
    )

    if (result.p_error) return NextResponse.json({ error: result.p_error }, { status: 400 })

    // 2. Guardar Prioridad y Fecha de Revisión en la tabla correcta: SPRINT_ITEMS
    if (body.sprintNum && (body.priority !== undefined || body.reviewDate !== undefined)) {
      await query(
        `UPDATE sprint_items 
         SET priority = ?, review_date = ?, updated_by = ?, updated_at = NOW() 
         WHERE backlog_item_id = ? AND sprint_num = ? AND deleted_at IS NULL`,
        [body.priority ?? 0, body.reviewDate || null, ctx.userId, id, body.sprintNum]
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { tenant: string; id: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'backlog:delete')
    if (errorResponse) return errorResponse

    const result = await callProcedureOut(
      'sp_backlog_delete',
      {
        p_tenant_id:  ctx.tenantId,
        p_item_id:    Number(params.id),
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