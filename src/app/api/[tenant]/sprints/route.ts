import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { callProcedure, callProcedureOut } from '@/lib/db'
import { RowDataPacket } from 'mysql2/promise'

export async function GET(req: NextRequest, { params }: { params: { tenant: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'sprint:read')
    if (errorResponse) return errorResponse

    const projectId = req.nextUrl.searchParams.get('projectId')
    if (!projectId) return NextResponse.json({ error: 'projectId requerido' }, { status: 400 })

    const results = await callProcedure<RowDataPacket>(
      'CALL sp_sprint_list(?, ?)',
      [ctx.tenantId, Number(projectId)],
    )

    return NextResponse.json({ data: results[0] ?? [] })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(req: NextRequest, { params }: { params: { tenant: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'sprint:manage')
    if (errorResponse) return errorResponse

    const body   = await req.json()
    const result = await callProcedureOut(
      'sp_sprint_upsert',
      {
        p_tenant_id:   ctx.tenantId,
        p_project_id:  body.projectId,
        p_sprint_id:   null, // Asuma que para PATCH enviará un ID si reutiliza este endpoint
        p_number:      body.number,
        p_name:        body.name,
        p_goal:        body.goal       ?? null,
        p_start_date:  body.startDate  ?? null,
        p_end_date:    body.endDate    ?? null,
        p_status:      body.status     ?? 'planificado',
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