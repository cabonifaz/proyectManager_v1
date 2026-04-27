import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { callProcedure } from '@/lib/db'
import { RowDataPacket } from 'mysql2/promise'

export async function GET(req: NextRequest, { params }: { params: { tenant: string } }) {
  try {
    // Validamos la sesión y el permiso general de lectura
    const { ctx, errorResponse } = await guardRoute(req, 'project:read')
    if (errorResponse) return errorResponse

    const { searchParams } = req.nextUrl
    const status = searchParams.get('status') ?? null

    /**
     * Solo enviamos 3 parámetros:
     * 1. ID del Tenant
     * 2. Filtro de estado (opcional)
     * 3. ID del Usuario que consulta (para calcular su rol interno por proyecto)
     */
    const results = await callProcedure<RowDataPacket>(
      'CALL sp_project_list(?, ?, ?)',
      [ctx.tenantId, status, ctx.userId],
    )

    return NextResponse.json({ data: results[0] ?? [] })
  } catch (err) {
    return handleApiError(err)
  }
}

// El método POST se mantiene igual, usando ctx.userId para auditoría
export async function POST(req: NextRequest, { params }: { params: { tenant: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'project:create')
    if (errorResponse) return errorResponse

    const body = await req.json()
    const result = await callProcedure(
      'CALL sp_project_upsert(?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        ctx.tenantId,
        null, // p_project_id null para creación
        body.managerId ?? null,
        body.code,
        body.name,
        body.description ?? null,
        body.status ?? 'activo',
        body.startDate ?? null,
        body.endDate ?? null,
        ctx.userId
      ]
    )

    return NextResponse.json({ id: result[0][0].p_result_id }, { status: 201 })
  } catch (err) {
    return handleApiError(err)
  }
}