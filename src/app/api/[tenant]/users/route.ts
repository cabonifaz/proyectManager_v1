import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { callProcedure, callProcedureOut } from '@/lib/db'
import { RowDataPacket } from 'mysql2/promise'
import bcrypt from 'bcryptjs'

export async function GET(req: NextRequest, { params }: { params: { tenant: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'user:read')
    if (errorResponse) return errorResponse

    const results = await callProcedure<RowDataPacket>(
      'CALL sp_user_list(?)',
      [ctx.tenantId],
    )

    const users = (results[0] ?? []).map((u: RowDataPacket) => ({
      ...u,
      projects: typeof u.projects === 'string'
        ? JSON.parse(u.projects).filter(Boolean)
        : (u.projects ?? []).filter(Boolean),
    }))

    return NextResponse.json({ data: users })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(req: NextRequest, { params }: { params: { tenant: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'user:create')
    if (errorResponse) return errorResponse

    const body = await req.json()
    if (!body.password) return NextResponse.json({ error: 'Password requerido' }, { status: 400 })

    const hash = await bcrypt.hash(body.password, 12)

    const result = await callProcedureOut(
      'sp_user_upsert',
      {
        p_tenant_id:   ctx.tenantId,
        p_user_id:     null,
        p_name:        body.name,
        p_email:       body.email.toLowerCase(),
        p_password:    hash,
        p_role:        body.role        ?? null,
        p_active:      body.active ?? 1,
        p_executed_by: ctx.userId,
      },
      ['p_result_id', 'p_error'],
    )

    if (result.p_error) return NextResponse.json({ error: result.p_error }, { status: 400 })
    return NextResponse.json({ id: result.p_result_id }, { status: 201 })
  } catch (err) {
    return handleApiError(err)
  }
}