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

    // 🚀 Estadísticas por desarrollador (Convivencia: Nueva tabla + Texto antiguo)
    const rawDevItems = await query<RowDataPacket>(
      `SELECT 
         bi.id,
         bi.status,
         bi.progress,
         (bi.eta < CURDATE() AND bi.status != 'completado') AS is_vencida,
         COALESCE(bit.value, '') AS legacy_value,
         (
            SELECT JSON_ARRAYAGG(u.name)
            FROM sprint_items si
            INNER JOIN sprint_item_tech_users situ ON situ.sprint_item_id = si.id
            INNER JOIN users u ON u.id = situ.user_id
            WHERE si.backlog_item_id = bi.id 
              AND situ.column_id = c.id 
              AND situ.deleted_at IS NULL
              AND si.deleted_at IS NULL
         ) AS assigned_users
       FROM project_columns c
       INNER JOIN backlog_items bi ON bi.project_id = c.project_id
       LEFT JOIN backlog_item_tech bit ON bit.backlog_item_id = bi.id AND bit.column_id = c.id AND bit.deleted_at IS NULL
       INNER JOIN projects p ON p.id = bi.project_id
       WHERE p.tenant_id = ?
         AND c.active = 1 AND c.deleted_at IS NULL
         AND bi.deleted_at IS NULL
         AND (? IS NULL OR bi.project_id = ?)`,
      [ctx.tenantId, pid, pid]
    )

    // Agrupamos los datos en memoria para separar nombres con comas
    const statsMap = new Map<string, any>()

    for (const row of rawDevItems as any[]) {
      let devs: string[] = []

      // 1. Extraemos los usuarios de la tabla nueva (Si usaste checkboxes)
      if (row.assigned_users) {
        const parsed = typeof row.assigned_users === 'string' ? JSON.parse(row.assigned_users) : row.assigned_users
        if (Array.isArray(parsed) && parsed.length > 0) devs = parsed
      }

      // 2. Fallback: Si no hay checkboxes, procesamos el texto antiguo y lo dividimos por comas
      if (devs.length === 0 && row.legacy_value) {
        const devText = row.legacy_value.trim()
        if (devText && devText !== '-' && devText.toLowerCase() !== 'n/a' && devText.toLowerCase() !== 'na') {
          devs = devText.split(',').map((d: string) => d.trim()).filter((d: string) => d)
        }
      }

      // 3. Contabilizamos las estadísticas por cada desarrollador individual
      for (const dev of devs) {
        if (!statsMap.has(dev)) {
          statsMap.set(dev, {
            developer_name: dev, total: 0, completado: 0, en_progreso: 0,
            en_revision: 0, pendiente: 0, bloqueado: 0, vencidas: 0, _sum_progress: 0
          })
        }
        const stat = statsMap.get(dev)
        stat.total += 1
        if (row.status === 'completado') stat.completado += 1
        if (row.status === 'en_progreso') stat.en_progreso += 1
        if (row.status === 'en_revision') stat.en_revision += 1
        if (row.status === 'pendiente') stat.pendiente += 1
        if (row.status === 'bloqueado') stat.bloqueado += 1
        if (row.is_vencida) stat.vencidas += 1
        stat._sum_progress += Number(row.progress) || 0
      }
    }

    // Calculamos el promedio final y ordenamos de mayor a menor carga
    const devStats = Array.from(statsMap.values()).map(s => {
      s.avg_progress = s.total > 0 ? Math.round(s._sum_progress / s.total) : 0
      delete s._sum_progress
      return s
    }).sort((a, b) => b.total - a.total)

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
