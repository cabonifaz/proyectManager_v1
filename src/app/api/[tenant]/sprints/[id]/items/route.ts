import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { callProcedure, callProcedureOut } from '@/lib/db'
import { RowDataPacket } from 'mysql2/promise'

export async function GET(req: NextRequest, { params }: { params: { tenant: string; id: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'sprint:read')
    if (errorResponse) return errorResponse

    const { searchParams } = req.nextUrl
    const projectId = searchParams.get('projectId')
    if (!projectId) return NextResponse.json({ error: 'projectId requerido' }, { status: 400 })

    const results = await callProcedure<RowDataPacket>(
      'CALL sp_sprint_items_list(?, ?, ?, ?, ?, ?, ?, ?)',
      [
        ctx.tenantId,
        Number(projectId),
        Number(params.id),
        searchParams.get('status')   ?? null,
        searchParams.get('priority') ?? null,
        searchParams.get('userId')   ? Number(searchParams.get('userId')) : null,
        Number(searchParams.get('limit')  ?? 200),
        Number(searchParams.get('offset') ?? 0),
      ],
    )

    return NextResponse.json({ data: results[0] ?? [] })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(req: NextRequest, { params }: { params: { tenant: string; id: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'sprint_item:create')
    if (errorResponse) return errorResponse

    const body   = await req.json()
    const result = await callProcedureOut(
      'sp_sprint_item_create',
      {
        p_tenant_id:       ctx.tenantId,
        p_sprint_id:       Number(params.id),
        p_backlog_item_id: body.backlogItemId ?? null,
        p_code:            body.code,
        p_description:     body.description,
        p_status:          body.status        ?? null,
        p_priority:        body.priority      ?? null,
        p_eta:             body.eta           ?? null,
        p_created_by:      ctx.userId,
      },
      ['p_new_id', 'p_error'],
    )

    if (result.p_error) return NextResponse.json({ error: result.p_error }, { status: 400 })
    return NextResponse.json({ id: result.p_new_id }, { status: 201 })
  } catch (err) {
    return handleApiError(err)
  }
}