import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { query } from '@/lib/db'
import { RowDataPacket } from 'mysql2/promise'

export async function GET(req: NextRequest, { params }: { params: { tenant: string; id: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'project:read')
    if (errorResponse) return errorResponse

    const rows = await query<RowDataPacket>(
      `SELECT DISTINCT bit.value AS name
       FROM backlog_item_tech bit
       INNER JOIN backlog_items bi ON bi.id = bit.backlog_item_id
       WHERE bi.project_id   = ?
         AND bit.value       IS NOT NULL
         AND bit.value       != ''
         AND bi.deleted_at   IS NULL
         AND bit.deleted_at  IS NULL
       ORDER BY bit.value`,
      [Number(params.id)],
    )

    return NextResponse.json({ data: rows.map(r => r.name as string) })
  } catch (err) {
    return handleApiError(err)
  }
}
