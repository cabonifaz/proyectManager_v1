import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { callProcedure, query } from '@/lib/db'
import { RowDataPacket } from 'mysql2/promise'

export async function GET(req: NextRequest, { params }: { params: { tenant: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'dashboard:read')
    if (errorResponse) return errorResponse

    const projectId = req.nextUrl.searchParams.get('projectId')
    const userId    = ctx.role === 'super_admin' ? null : ctx.userId
    const pid       = projectId ? Number(projectId) : null

    const results = await callProcedure<RowDataPacket>(
      'CALL sp_dashboard_project(?, ?, ?)',
      [ctx.tenantId, pid, userId],
    )

    // Stats de observaciones por estado + ETA
    const obsRows = await query<RowDataPacket>(
      `SELECT
         SUM(estado = 'abierta')                                                        AS abierta,
         SUM(estado = 'en_seguimiento')                                                 AS en_seguimiento,
         SUM(estado = 'resuelta')                                                       AS resuelta,
         SUM(estado = 'cerrada')                                                        AS cerrada,
         SUM(eta < CURDATE() AND estado NOT IN ('resuelta','cerrada'))                 AS vencidas,
         SUM(eta BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
             AND estado NOT IN ('resuelta','cerrada'))                                  AS por_vencer,
         SUM((eta > DATE_ADD(CURDATE(), INTERVAL 7 DAY) OR eta IS NULL)
             AND estado NOT IN ('resuelta','cerrada'))                                  AS a_tiempo
       FROM observaciones
       WHERE tenant_id = ? AND deleted_at IS NULL AND (? IS NULL OR project_id = ?)`,
      [ctx.tenantId, pid, pid],
    )

    // Desarrolladores en observaciones vencidas
    const obsOverdueDevs = await query<RowDataPacket>(
      `SELECT oa.developer_name, COUNT(*) AS total
       FROM observacion_asignaciones oa
       INNER JOIN observaciones o ON o.id = oa.observacion_id
       WHERE oa.tenant_id  = ?
         AND o.eta         < CURDATE()
         AND o.estado      NOT IN ('resuelta','cerrada')
         AND o.deleted_at  IS NULL
         AND (? IS NULL OR o.project_id = ?)
       GROUP BY oa.developer_name
       ORDER BY total DESC`,
      [ctx.tenantId, pid, pid],
    )

    // Estadísticas por desarrollador (desde backlog_item_tech)
    const devStats = await query<RowDataPacket>(
      `SELECT
         bit.value                                                                   AS developer_name,
         COUNT(*)                                                                    AS total,
         SUM(bi.status = 'completado')                                              AS completado,
         SUM(bi.status = 'en_progreso')                                             AS en_progreso,
         SUM(bi.status = 'en_revision')                                             AS en_revision,
         SUM(bi.status = 'pendiente')                                               AS pendiente,
         SUM(bi.status = 'bloqueado')                                               AS bloqueado,
         SUM(bi.eta < CURDATE() AND bi.status NOT IN ('completado'))               AS vencidas,
         ROUND(AVG(bi.progress), 0)                                                 AS avg_progress
       FROM backlog_item_tech bit
       INNER JOIN backlog_items bi ON bi.id  = bit.backlog_item_id
       INNER JOIN projects      p  ON p.id   = bi.project_id
       WHERE p.tenant_id     = ?
         AND bit.value       IS NOT NULL
         AND bit.value       != ''
         AND bi.deleted_at   IS NULL
         AND bit.deleted_at  IS NULL
         AND (? IS NULL OR bi.project_id = ?)
       GROUP BY bit.value
       ORDER BY total DESC`,
      [ctx.tenantId, pid, pid],
    )

    return NextResponse.json({
      projects:        results[0] ?? [],
      sprints:         results[1] ?? [],
      statusDist:      results[2] ?? [],
      overdueItems:    results[3] ?? [],
      upcomingItems:   results[4] ?? [],
      obsStats:        obsRows[0]     ?? null,
      obsOverdueDevs:  obsOverdueDevs ?? [],
      devStats:        devStats       ?? [],
    })
  } catch (err) {
    return handleApiError(err)
  }
}
