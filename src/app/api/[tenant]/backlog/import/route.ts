import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { callProcedureOut, query } from '@/lib/db'
import { RowDataPacket } from 'mysql2/promise'

interface ColRow extends RowDataPacket {
  id: number
  name: string
  col_key: string
}

interface ExistingItem extends RowDataPacket {
  id: number
  code: string
}

function normalizeStatus(val: string): string {
  const v = val
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  if (v === 'pendiente')        return 'pendiente'
  if (v === 'asignado')         return 'en_progreso'
  if (v === 'atendido')         return 'en_revision'
  if (v === 'aprobado')         return 'completado'
  if (v === 'observado')        return 'bloqueado'
  if (v === 'levantado')        return 'en_progreso'
  if (v === 'desestimado')      return 'bloqueado'
  if (v === 'rev qa ok')        return 'completado'
  if (v === 'rev qa obs')       return 'bloqueado'
  if (v === 'rev qa levantado') return 'en_progreso'

  if (v.includes('aprobado'))   return 'completado'
  if (v.includes('observado'))  return 'bloqueado'
  if (v.includes('levantado'))  return 'en_progreso'
  if (v.includes('desestimado'))return 'bloqueado'
  if (v.includes('asignado'))   return 'en_progreso'
  if (v.includes('atendido'))   return 'en_revision'
  if (v.includes('qa ok'))      return 'completado'
  if (v.includes('qa obs'))     return 'bloqueado'
  if (v.includes('qa'))         return 'en_revision'
  if (v.includes('progreso'))   return 'en_progreso'
  if (v.includes('revision'))   return 'en_revision'
  if (v.includes('complet'))    return 'completado'
  if (v.includes('bloquea'))    return 'bloqueado'

  return 'pendiente'
}

export async function POST(req: NextRequest, { params }: { params: { tenant: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'backlog:create')
    if (errorResponse) return errorResponse

    const body      = await req.json()
    const projectId = body.projectId
    const rows      = body.rows as Record<string, string>[]

    if (!projectId || !rows?.length) {
      return NextResponse.json({ error: 'projectId y rows son requeridos' }, { status: 400 })
    }

    const techCols = await query<ColRow>(
      `SELECT id, name, col_key
       FROM project_columns
       WHERE project_id = ? AND deleted_at IS NULL AND active = 1
       ORDER BY sort_order`,
      [projectId],
    )

    const existingItems = await query<ExistingItem>(
      `SELECT id, code FROM backlog_items
       WHERE project_id = ? AND deleted_at IS NULL`,
      [projectId],
    )

    const existingMap = new Map<string, number>(
      existingItems.map(item => [item.code.trim().toLowerCase(), item.id])
    )

    const errors:  string[] = []
    const created: number[] = []
    const updated: number[] = []

    for (let i = 0; i < rows.length; i++) {
      const row    = rows[i]
      const rowNum = i + 2

      if (!row.codigo || !row.descripcion) {
        errors.push(`Fila ${rowNum}: Código y Descripción son obligatorios`)
        continue
      }

      const codeKey    = String(row.codigo).trim().toLowerCase()
      const existingId = existingMap.get(codeKey)
      const status     = row.estado ? normalizeStatus(row.estado) : null
      const avance     = row.avance ? Math.min(100, Math.max(0, Number(row.avance))) : null

      let itemId: number

      if (existingId) {
        const upd = await callProcedureOut(
          'sp_backlog_update',
          {
            p_tenant_id:    ctx.tenantId,
            p_item_id:      existingId,
            p_module:       row.modulo     ? String(row.modulo).trim()     : null,
            p_description:  String(row.descripcion).trim(),
            p_progress:     avance !== null && !isNaN(avance) ? avance     : null,
            p_status:       status,
            p_sprint_num:   row.sprint     ? Number(row.sprint)            : null,
            p_eta:          row.eta        ? String(row.eta).trim()        : null,
            p_comment:      row.comentario ? String(row.comentario).trim() : null,
            p_updated_by:   ctx.userId,
            p_eta_explicit: row.eta ? 1 : 0,
          },
          ['p_error'],
        )

        if (upd.p_error) {
          errors.push(`Fila ${rowNum} (${row.codigo}): ${upd.p_error}`)
          continue
        }
        itemId = existingId
        updated.push(itemId)
      } else {
        const result = await callProcedureOut(
          'sp_backlog_create',
          {
            p_tenant_id:   ctx.tenantId,
            p_project_id:  Number(projectId),
            p_code:        String(row.codigo).trim(),
            p_module:      row.modulo     ? String(row.modulo).trim()     : null,
            p_description: String(row.descripcion).trim(),
            p_status:      status,
            p_sprint_num:  row.sprint     ? Number(row.sprint)            : null,
            p_eta:         row.eta        ? String(row.eta).trim()        : null,
            p_comment:     row.comentario ? String(row.comentario).trim() : null,
            p_created_by:  ctx.userId,
          },
          ['p_new_id', 'p_error'],
        )

        if (result.p_error) {
          errors.push(`Fila ${rowNum} (${row.codigo}): ${result.p_error}`)
          continue
        }
        itemId = result.p_new_id as number

        if (avance !== null && !isNaN(avance) && avance > 0) {
          await callProcedureOut(
            'sp_backlog_update',
            {
              p_tenant_id:    ctx.tenantId,
              p_item_id:      itemId,
              p_module:       null,
              p_description:  null,
              p_progress:     avance,
              p_status:       null,
              p_sprint_num:   null,
              p_eta:          null,
              p_comment:      null,
              p_updated_by:   ctx.userId,
              p_eta_explicit: 0,
            },
            ['p_error'],
          )
        }
        created.push(itemId)
      }

      // ── ACTUALIZACIÓN FORZADA DE FECHAS (REG_DATE Y CREATED_AT) ───────────
      const fechaRegistro = row.fech_reg || row.reg_date || row.regDate || row['fech reg'] || row['FECH REG'];
      
      if (fechaRegistro && String(fechaRegistro).trim() !== '') {
        const dateStr = String(fechaRegistro).trim().substring(0, 10);
        try {
          // Actualizamos AMBAS columnas a la vez con la fecha del Excel
          await query(
            'UPDATE backlog_items SET reg_date = ?, created_at = ? WHERE id = ?', 
            [dateStr, `${dateStr} 12:00:00`, itemId]
          );
        } catch (err: any) {
          errors.push(`Fila ${rowNum} (${row.codigo}): Fallo al forzar fecha: ${err.message}`);
        }
      } else {
        errors.push(`Fila ${rowNum} (${row.codigo}): No se encontró fecha en el Excel, se usará la de hoy.`);
      }

      // ── Columnas tech ─────────────────────────────────────────────────────
      for (const col of techCols) {
        const colNameNorm = col.name.toLowerCase().replace(/[\s.]+/g, '_')
        const val =
          row[col.col_key]            ??
          row[colNameNorm]            ??
          row[col.name.toLowerCase()] ??
          row[col.name]               ??
          null

        if (!val || String(val).trim() === '') continue

        const techResult = await callProcedureOut(
          'sp_backlog_tech_upsert',
          {
            p_tenant_id: ctx.tenantId,
            p_item_id:   itemId,
            p_column_id: col.id,
            p_value:     String(val).trim(),
            p_eta:       null,
            p_user_id:   ctx.userId,
          },
          ['p_error'],
        )

        if (techResult.p_error) {
          errors.push(`Fila ${rowNum} (${row.codigo}) - ${col.name}: ${techResult.p_error}`)
        }
      }
    }

    return NextResponse.json({
      created: created.length,
      updated: updated.length,
      errors,
    })
  } catch (err) {
    return handleApiError(err)
  }
}