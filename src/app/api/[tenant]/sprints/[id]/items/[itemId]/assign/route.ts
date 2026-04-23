import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { callProcedureOut } from '@/lib/db'

export async function POST(req: NextRequest, { params }: { params: { tenant: string; id: string; itemId: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'sprint:assign_talent')
    if (errorResponse) return errorResponse

    const body   = await req.json()
    const result = await callProcedureOut(
      'sp_sprint_tech_assign',
      {
        p_tenant_id:        ctx.tenantId,
        p_sprint_item_id:   Number(params.itemId),
        p_column_id:        body.columnId,
        p_assigned_user_id: body.assignedUserId ?? null,
        p_value:            body.value          ?? null,
        p_progress:         body.progress       ?? null,
        p_eta:              body.eta            ?? null,
        p_user_id:          ctx.userId,
      },
      ['p_error'],
    )

    if (result.p_error) return NextResponse.json({ error: result.p_error }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err)
  }
}