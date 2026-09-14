import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, getContextFromHeaders, requireProjectPermission, handleApiError } from '@/lib/session'
import { callProcedure, callProcedureOut, query } from '@/lib/db'
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
    const ctx = await getContextFromHeaders(req)
    if (!ctx) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const sprintRows: any = await query(`SELECT project_id FROM sprints WHERE id = ? AND deleted_at IS NULL LIMIT 1`, [Number(params.id)])
    if (!sprintRows || sprintRows.length === 0) return NextResponse.json({ error: 'Sprint no encontrado' }, { status: 404 })

    const permError = await requireProjectPermission(ctx, 'sprint_item:create', sprintRows[0].project_id)
    if (permError) return permError

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