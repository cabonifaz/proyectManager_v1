import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { callProcedure, callProcedureOut } from '@/lib/db'
import { RowDataPacket } from 'mysql2/promise'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'backlog:read')
    if (errorResponse) return errorResponse

    // 1. Verificamos la sesión para saber si es Super Admin
    const session = await getServerSession(authOptions)
    const isSuperAdmin = session?.user?.role === 'super_admin'
    
    // 2. Aplicamos la regla de tu SP: si es super admin, pasamos null. Si no, pasamos su ID.
    const pUserId = isSuperAdmin ? null : ctx.userId

    const { searchParams } = req.nextUrl
    const projectId = searchParams.get('projectId')
    if (!projectId) return NextResponse.json({ error: 'projectId requerido' }, { status: 400 })

    const statusList   = searchParams.getAll('status[]')
    const singleStatus = searchParams.get('status') ?? null
    const sprintNum    = searchParams.get('sprintNum') ? Number(searchParams.get('sprintNum')) : null
    const search       = searchParams.get('search')   ?? null
    const limit        = Number(searchParams.get('limit')  ?? 200)
    const offset       = Number(searchParams.get('offset') ?? 0)

    // Bloque para múltiples estados
    if (statusList.length > 1) {
      const allResults: RowDataPacket[] = []
      for (const status of statusList) {
        const results = await callProcedure<RowDataPacket>(
          'CALL sp_backlog_list(?, ?, ?, ?, ?, ?, ?, ?)',
          [ctx.tenantId, Number(projectId), status, sprintNum, search, limit, offset, pUserId],
        )
        allResults.push(...(results[0] ?? []))
      }
      return NextResponse.json({ data: allResults })
    }

    // Bloque para un solo estado o ninguno
    const results = await callProcedure<RowDataPacket>(
      'CALL sp_backlog_list(?, ?, ?, ?, ?, ?, ?, ?)',
      [
        ctx.tenantId,
        Number(projectId),
        statusList.length === 1 ? statusList[0] : singleStatus,
        sprintNum,
        search,
        limit,
        offset,
        pUserId, // Aquí pasamos null o el ID, dependiendo de su rol
      ],
    )

    return NextResponse.json({ data: results[0] ?? [] })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'backlog:create')
    if (errorResponse) return errorResponse

    let body: Record<string, unknown> = {}
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
    }

    const result = await callProcedureOut(
      'sp_backlog_create',
      {
        p_tenant_id:   ctx.tenantId,
        p_project_id:  body.projectId,
        p_code:        body.code,
        p_module:      body.module      ?? null,
        p_description: body.description,
        p_status:      body.status      ?? null,
        p_sprint_num:  body.sprintNum   ?? null,
        p_eta:         body.eta         ?? null,
        p_comment:     body.comment     ?? null,
        p_created_by:  ctx.userId, // Aquí sí dejamos siempre el userId porque necesitamos auditar quién lo creó
      },
      ['p_new_id', 'p_error'],
    )

    if (result.p_error) return NextResponse.json({ error: result.p_error }, { status: 400 })
    return NextResponse.json({ id: result.p_new_id }, { status: 201 })
  } catch (err) {
    return handleApiError(err)
  }
}