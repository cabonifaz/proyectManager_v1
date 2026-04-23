import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { callProcedure, callProcedureOut, query } from '@/lib/db'
import { RowDataPacket } from 'mysql2/promise'

async function checkProjectAccess(tenantId: number, projectId: number, userId: number, role: string): Promise<boolean> {
  if (role === 'super_admin') return true
  const rows = await query<RowDataPacket>(
    `SELECT 1 FROM project_members
     WHERE project_id = ? AND user_id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [projectId, userId],
  )
  return rows.length > 0
}

export async function GET(req: NextRequest, { params }: { params: { tenant: string; id: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'project:read')
    if (errorResponse) return errorResponse

    const userId = ctx.role === 'super_admin' ? null : ctx.userId

    const results = await callProcedure<RowDataPacket>(
      'CALL sp_project_list(?, ?, ?)',
      [ctx.tenantId, null, userId],
    )

    const project = (results[0] ?? []).find(
      (p: RowDataPacket) => p.id === Number(params.id)
    )

    if (!project) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 })

    const colResults = await callProcedure<RowDataPacket>(
      'CALL sp_project_columns_list(?, ?)',
      [ctx.tenantId, Number(params.id)],
    )

    return NextResponse.json({ data: { ...project, columns: colResults[0] ?? [] } })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { tenant: string; id: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'project:update')
    if (errorResponse) return errorResponse

    const hasAccess = await checkProjectAccess(
      ctx.tenantId, Number(params.id), ctx.userId, ctx.role
    )
    if (!hasAccess) {
      return NextResponse.json({ error: 'No tienes acceso a este proyecto' }, { status: 403 })
    }

    const body   = await req.json()
    const result = await callProcedureOut(
      'sp_project_upsert',
      {
        p_tenant_id:   ctx.tenantId,
        p_project_id:  Number(params.id),
        p_manager_id:  body.managerId   ?? null,
        p_code:        body.code        ?? null,
        p_name:        body.name        ?? null,
        p_description: body.description ?? null,
        p_status:      body.status      ?? null,
        p_start_date:  body.startDate   ?? null,
        p_end_date:    body.endDate     ?? null,
        p_user_id:     ctx.userId,
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
    const { ctx, errorResponse } = await guardRoute(req, 'project:delete')
    if (errorResponse) return errorResponse

    const hasAccess = await checkProjectAccess(
      ctx.tenantId, Number(params.id), ctx.userId, ctx.role
    )
    if (!hasAccess) {
      return NextResponse.json({ error: 'No tienes acceso a este proyecto' }, { status: 403 })
    }

    const result = await callProcedureOut(
      'sp_project_delete',
      {
        p_tenant_id:  ctx.tenantId,
        p_project_id: Number(params.id),
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