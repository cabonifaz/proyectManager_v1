import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { callProcedure, callProcedureOut } from '@/lib/db'
import { RowDataPacket } from 'mysql2/promise'

export async function GET(req: NextRequest, { params }: { params: { tenant: string; id: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'project:read')
    if (errorResponse) return errorResponse

    const results = await callProcedure<RowDataPacket>(
      'CALL sp_project_columns_list(?, ?)',
      [ctx.tenantId, Number(params.id)],
    )

    return NextResponse.json({ data: results[0] ?? [] })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(req: NextRequest, { params }: { params: { tenant: string; id: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'project:manage_columns')
    if (errorResponse) return errorResponse

    const body   = await req.json()
    const result = await callProcedureOut(
      'sp_project_column_upsert',
      {
        p_tenant_id:  ctx.tenantId,
        p_project_id: Number(params.id),
        p_column_id:  body.columnId  ?? null,
        p_name:       body.name,
        p_col_key:    body.colKey,
        p_col_type:   body.colType   ?? 'both',
        p_sort_order: body.sortOrder ?? 0,
        p_user_id:    ctx.userId,
      },
      ['p_result_id', 'p_error'],
    )

    if (result.p_error) return NextResponse.json({ error: result.p_error }, { status: 400 })
    return NextResponse.json({ id: result.p_result_id }, { status: 201 })
  } catch (err) {
    return handleApiError(err)
  }
}