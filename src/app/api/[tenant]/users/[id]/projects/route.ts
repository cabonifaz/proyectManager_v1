import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { callProcedureOut } from '@/lib/db'

export async function POST(req: NextRequest, { params }: { params: { tenant: string; id: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'project:manage_members')
    if (errorResponse) return errorResponse

    const body   = await req.json()
    const result = await callProcedureOut(
      'sp_project_member_upsert',
      {
        p_tenant_id:   ctx.tenantId,
        p_project_id:  body.projectId,
        p_user_id:     Number(params.id),
        p_role:        body.role ?? null,
        p_executed_by: ctx.userId,
      },
      ['p_error'],
    )

    if (result.p_error) return NextResponse.json({ error: result.p_error }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { tenant: string; id: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'project:manage_members')
    if (errorResponse) return errorResponse

    const body   = await req.json()
    const result = await callProcedureOut(
      'sp_project_member_remove',
      {
        p_tenant_id:   ctx.tenantId,
        p_project_id:  body.projectId,
        p_user_id:     Number(params.id),
        p_executed_by: ctx.userId,
      },
      ['p_error'],
    )

    if (result.p_error) return NextResponse.json({ error: result.p_error }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err)
  }
}