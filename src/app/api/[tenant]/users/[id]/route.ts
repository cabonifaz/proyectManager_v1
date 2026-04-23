import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { callProcedureOut } from '@/lib/db'
import bcrypt from 'bcryptjs'

export async function PATCH(req: NextRequest, { params }: { params: { tenant: string; id: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'user:update')
    if (errorResponse) return errorResponse

    const body = await req.json()
    let hash: string | null = null
    if (body.password) hash = await bcrypt.hash(body.password, 12)

    const result = await callProcedureOut(
      'sp_user_upsert',
      {
        p_tenant_id:   ctx.tenantId,
        p_user_id:     Number(params.id),
        p_name:        body.name        ?? null,
        p_email:       body.email       ? body.email.toLowerCase() : null,
        p_password:    hash,
        p_role:        body.role        ?? null,
        p_active:      body.active      ?? null,
        p_executed_by: ctx.userId,
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
    const { ctx, errorResponse } = await guardRoute(req, 'user:delete')
    if (errorResponse) return errorResponse

    const result = await callProcedureOut(
      'sp_user_toggle',
      {
        p_tenant_id:   ctx.tenantId,
        p_user_id:     Number(params.id),
        p_active:      0,
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