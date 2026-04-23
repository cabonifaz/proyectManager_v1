import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { callProcedureOut } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: { tenant: string; id: string; itemId: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'sprint_item:update')
    if (errorResponse) return errorResponse

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
    const { ctx, errorResponse } = await guardRoute(req, 'sprint_item:delete')
    if (errorResponse) return errorResponse

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