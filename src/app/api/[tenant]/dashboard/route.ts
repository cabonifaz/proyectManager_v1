import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { callProcedure } from '@/lib/db'
import { RowDataPacket } from 'mysql2/promise'

export async function GET(req: NextRequest, { params }: { params: { tenant: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'dashboard:read')
    if (errorResponse) return errorResponse

    const projectId = req.nextUrl.searchParams.get('projectId')
    const userId    = ctx.role === 'super_admin' ? null : ctx.userId

    const results = await callProcedure<RowDataPacket>(
      'CALL sp_dashboard_project(?, ?, ?)',
      [ctx.tenantId, projectId ? Number(projectId) : null, userId],
    )

    return NextResponse.json({
      projects:      results[0] ?? [],
      sprints:       results[1] ?? [],
      statusDist:    results[2] ?? [],
      overdueItems:  results[3] ?? [],
      upcomingItems: results[4] ?? [],
    })
  } catch (err) {
    return handleApiError(err)
  }
}