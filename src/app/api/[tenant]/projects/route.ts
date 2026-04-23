import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { callProcedure, callProcedureOut } from '@/lib/db'
import { RowDataPacket } from 'mysql2/promise'

export async function GET(req: NextRequest, { params }: { params: { tenant: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'project:read')
    if (errorResponse) return errorResponse

    const { searchParams } = req.nextUrl
    const status = searchParams.get('status') ?? null

    const results = await callProcedure<RowDataPacket>(
      'CALL sp_project_list(?, ?, ?)',
      [ctx.tenantId, status],
    )

    return NextResponse.json({ data: results[0] ?? [] })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(req: NextRequest, { params }: { params: { tenant: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'project:create')
    if (errorResponse) return errorResponse

    const body   = await req.json()
    const result = await callProcedureOut(
      'sp_project_upsert',
      {
        p_tenant_id:   ctx.tenantId,
        p_project_id:  null,
        p_manager_id:  body.managerId   ?? null,
        p_code:        body.code,
        p_name:        body.name,
        p_description: body.description ?? null,
        p_status:      body.status      ?? null,
        p_start_date:  body.startDate   ?? null,
        p_end_date:    body.endDate     ?? null,
        p_user_id:     ctx.userId,
      },
      ['p_result_id', 'p_error'],
    )

    if (result.p_error) return NextResponse.json({ error: result.p_error }, { status: 400 })
    return NextResponse.json({ id: result.p_result_id }, { status: 201 })
  } catch (err) {
    return handleApiError(err)
  }
}