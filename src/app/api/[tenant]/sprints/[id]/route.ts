import { NextRequest, NextResponse } from 'next/server'
import { guardProjectRoute, getContextFromHeaders, requireProjectPermission, handleApiError } from '@/lib/session'
import { callProcedureOut, query } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: { tenant: string; id: string } }) {
  try {
    const body = await req.json()
    const { ctx, errorResponse } = await guardProjectRoute(req, 'sprint:manage', Number(body.projectId) || null)
    if (errorResponse) return errorResponse

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
    const ctx = await getContextFromHeaders(req)
    if (!ctx) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    // Nota: pese al nombre de la ruta (sprints/[id]), este handler borra un sprint_item, no un sprint.
    const rows: any = await query(`SELECT project_id FROM sprint_items WHERE id = ? AND deleted_at IS NULL LIMIT 1`, [Number(params.id)])
    if (!rows || rows.length === 0) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    const permError = await requireProjectPermission(ctx, 'sprint:manage', rows[0].project_id)
    if (permError) return permError

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