import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { callProcedureOut } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: { tenant: string; id: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'sprint:manage')
    if (errorResponse) return errorResponse

    const body   = await req.json()
    const result = await callProcedureOut(
      'sp_sprint_upsert',
      {
        p_tenant_id:  ctx.tenantId,
        p_project_id: body.projectId,
        p_sprint_id:  Number(params.id),
        p_number:     body.number     ?? null,
        p_name:       body.name       ?? null,
        p_goal:       body.goal       ?? null,
        p_start_date: body.startDate  ?? null,
        p_end_date:   body.endDate    ?? null,
        p_status:     body.status     ?? null,
        p_user_id:    ctx.userId,
      },
      ['p_result_id', 'p_error'],
    )

    if (result.p_error) return NextResponse.json({ error: result.p_error }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { tenant: string; id: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'sprint:manage')
    if (errorResponse) return errorResponse

    const result = await callProcedureOut(
      'sp_sprint_item_delete',
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