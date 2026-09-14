import { NextRequest, NextResponse } from 'next/server'
import { getContextFromHeaders, requireProjectPermission, handleApiError } from '@/lib/session'
import { callProcedureOut, query } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: { tenant: string; id: string; itemId: string } }) {
  try {
    const ctx = await getContextFromHeaders(req)
    if (!ctx) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const itemRows: any = await query(`SELECT project_id FROM sprint_items WHERE id = ? AND deleted_at IS NULL LIMIT 1`, [Number(params.itemId)])
    if (!itemRows || itemRows.length === 0) return NextResponse.json({ error: 'Item no encontrado' }, { status: 404 })

    const permError = await requireProjectPermission(ctx, 'sprint_item:update', itemRows[0].project_id)
    if (permError) return permError

    const body   = await req.json()
    const result = await callProcedureOut(
      'sp_sprint_item_update',
      {
        p_tenant_id:   ctx.tenantId,
        p_item_id:     Number(params.itemId),
        p_status:      body.status      ?? null,
        p_priority:    body.priority    ?? null,
        p_review_date: body.reviewDate  ?? null,
        p_eta:         body.eta         ?? null,
        p_updated_by:  ctx.userId,
      },
      ['p_error'],
    )

    if (result.p_error) return NextResponse.json({ error: result.p_error }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { tenant: string; id: string; itemId: string } }) {
  try {
    const ctx = await getContextFromHeaders(req)
    if (!ctx) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const itemRows: any = await query(`SELECT project_id FROM sprint_items WHERE id = ? AND deleted_at IS NULL LIMIT 1`, [Number(params.itemId)])
    if (!itemRows || itemRows.length === 0) return NextResponse.json({ error: 'Item no encontrado' }, { status: 404 })

    const permError = await requireProjectPermission(ctx, 'sprint_item:delete', itemRows[0].project_id)
    if (permError) return permError

    const result = await callProcedureOut(
      'sp_sprint_item_delete',
      {
        p_tenant_id:  ctx.tenantId,
        p_item_id:    Number(params.itemId),
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