import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { callProcedureOut, query } from '@/lib/db'
import { RowDataPacket } from 'mysql2/promise'

interface ColRow extends RowDataPacket { id: number; name: string; col_key: string }
interface ExistingItem extends RowDataPacket { id: number; code: string }
interface ExistingSprint extends RowDataPacket { id: number; number: number }

function normalizeStatus(val: string): string {
  if (!val) return 'pendiente'
  const v = String(val).toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (v.includes('aprobado') || v.includes('qa ok') || v.includes('complet')) return 'completado'
  if (v.includes('observado') || v.includes('desestimado') || v.includes('qa obs') || v.includes('bloquea')) return 'bloqueado'
  if (v.includes('levantado') || v.includes('asignado') || v.includes('progreso')) return 'en_progreso'
  if (v.includes('atendido') || v.includes('qa') || v.includes('revision')) return 'en_revision'
  return 'pendiente'
}

function normalizeObsStatus(val: string): string {
  if (!val) return 'abierta'
  const v = String(val).toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (v.includes('abiert') || v.includes('pendiente')) return 'abierta'
  if (v.includes('seguimiento') || v.includes('progreso') || v.includes('levantado')) return 'en_seguimiento'
  if (v.includes('resuelt') || v.includes('ok') || v.includes('complet') || v.includes('atendido')) return 'resuelta'
  if (v.includes('cerrad') || v.includes('aprobado') || v.includes('desestimado')) return 'cerrada'
  return 'abierta'
}

function parseDateStr(val: any): string | null {
  if (!val) return null
  const str = String(val).trim()
  if (str === '') return null
  return str.substring(0, 10)
}

export async function POST(req: NextRequest, { params }: { params: { tenant: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'backlog:create')
    if (errorResponse) return errorResponse

    const body = await req.json()
    const projectId   = Number(body.projectId)
    const backlogRows = (body.backlogRows || []) as Record<string, any>[]
    const sprintRows  = (body.sprintRows  || []) as Record<string, any>[]
    const obsRows     = (body.obsRows     || []) as Record<string, any>[]

    if (!projectId) return NextResponse.json({ error: 'projectId es requerido' }, { status: 400 })

    const errors: string[] = []
    const results = { sprints: 0, bCreated: 0, bUpdated: 0, oCreated: 0, oUpdated: 0 }

    // ── FASE 1: CREAR SPRINTS FALTANTES ──
    const allSprintNums = new Set(
      [...backlogRows, ...sprintRows]
        .map(r => Number(r.sprint))
        .filter(n => !isNaN(n) && n >= 0)
    )
    
    if (allSprintNums.size > 0) {
      const existingSprints = await query<ExistingSprint>(
        `SELECT id, number FROM sprints WHERE project_id = ? AND deleted_at IS NULL`, [projectId]
      )
      const existingSprintSet = new Set(existingSprints.map(s => s.number))

      for (const sNum of Array.from(allSprintNums)) {
        if (!existingSprintSet.has(sNum)) {
          try {
            await query(
              `INSERT INTO sprints (project_id, number, name, status, created_by, updated_by) 
               VALUES (?, ?, ?, 'planificado', ?, ?)`,
              [projectId, sNum, `Sprint ${sNum}`, ctx.userId, ctx.userId]
            )
            results.sprints++
          } catch (e: any) {
            errors.push(`Error creando Sprint ${sNum}: ${e.message}`)
          }
        }
      }
    }

    // ── FASE 2: PROCESAR BACKLOG PRINCIPAL ──
    const techCols = await query<ColRow>(
      `SELECT id, name, col_key FROM project_columns WHERE project_id = ? AND deleted_at IS NULL AND active = 1`, [projectId]
    )
    
    const existingItems = await query<ExistingItem>(
      `SELECT id, code FROM backlog_items WHERE project_id = ? AND deleted_at IS NULL`, [projectId]
    )
    const existingMap = new Map<string, number>(existingItems.map(i => [i.code.trim().toLowerCase(), i.id]))

    for (let i = 0; i < backlogRows.length; i++) {
      const row = backlogRows[i]
      if (!row.codigo || !row.descripcion) {
        errors.push(`Backlog Fila ${i+2}: Código y Descripción obligatorios`)
        continue
      }

      const codeKey    = String(row.codigo).trim().toLowerCase()
      const existingId = existingMap.get(codeKey)
      
      let avance = null;
      if (row.avance !== undefined && row.avance !== null && String(row.avance).trim() !== '') {
        avance = Math.min(100, Math.max(0, Number(row.avance)));
      }

      let status = row.estado ? normalizeStatus(row.estado) : null;
      if (avance === 100) status = 'completado';

      const sprintVal = (row.sprint !== undefined && row.sprint !== null && String(row.sprint).trim() !== '') ? Number(row.sprint) : null;
      
      let itemId: number

      if (existingId) {
        const upd = await callProcedureOut('sp_backlog_update', {
          p_tenant_id: ctx.tenantId, p_item_id: existingId,
          p_module: row.modulo ? String(row.modulo).trim() : null,
          p_description: String(row.descripcion).trim(),
          p_progress: avance,
          p_status: status, p_sprint_num: sprintVal,
          p_eta: row.eta ? String(row.eta).trim() : null,
          p_comment: row.comentario ? String(row.comentario).trim() : null,
          p_updated_by: ctx.userId, p_eta_explicit: row.eta ? 1 : 0,
        }, ['p_error'])

        if (upd.p_error) { errors.push(`Backlog ${row.codigo}: ${upd.p_error}`); continue }
        itemId = existingId
        results.bUpdated++
      } else {
        const result = await callProcedureOut('sp_backlog_create', {
          p_tenant_id: ctx.tenantId, p_project_id: projectId,
          p_code: String(row.codigo).trim(),
          p_module: row.modulo ? String(row.modulo).trim() : null,
          p_description: String(row.descripcion).trim(),
          p_status: status, p_sprint_num: sprintVal,
          p_eta: row.eta ? String(row.eta).trim() : null,
          p_comment: row.comentario ? String(row.comentario).trim() : null,
          p_created_by: ctx.userId,
        }, ['p_new_id', 'p_error'])

        if (result.p_error) { errors.push(`Backlog ${row.codigo}: ${result.p_error}`); continue }
        itemId = result.p_new_id as number
        existingMap.set(codeKey, itemId) 

        if (avance !== null) {
          await callProcedureOut('sp_backlog_update', {
            p_tenant_id: ctx.tenantId, p_item_id: itemId,
            p_module: null, p_description: null,
            p_progress: avance, p_status: status, 
            p_sprint_num: null, p_eta: null, p_comment: null,
            p_updated_by: ctx.userId, p_eta_explicit: 0,
          }, ['p_error'])
        }
        results.bCreated++
      }

      const rawRegDate = row.fech_reg || row.reg_date || row.regDate || row['fech reg'] || row['FECH REG'];
      const dateStr = parseDateStr(rawRegDate)
      if (dateStr) {
        try { await query('UPDATE backlog_items SET reg_date=?, created_at=? WHERE id=?', [dateStr, `${dateStr} 12:00:00`, itemId]) } catch (e){}
      }

      for (const col of techCols) {
        const colNameNorm = col.name.toLowerCase().replace(/[\s.]+/g, '_')
        const val = row[col.col_key] ?? row[colNameNorm] ?? row[col.name.toLowerCase()] ?? row[col.name] ?? null
        if (!val || String(val).trim() === '') continue
        await callProcedureOut('sp_backlog_tech_upsert', {
          p_tenant_id: ctx.tenantId, p_item_id: itemId, p_column_id: col.id,
          p_value: String(val).trim(), p_eta: null, p_user_id: ctx.userId,
        }, ['p_error'])
      }
    }

    // ── FASE 3: PROCESAR BACKLOG-SPRINTS ──
    for (const row of sprintRows) {
      if (!row.codigo) continue
      const itemId = existingMap.get(String(row.codigo).trim().toLowerCase())
      if (!itemId) {
        errors.push(`Sprints: Código ${row.codigo} no existe en el backlog principal`)
        continue
      }
      try {
        const priority = row.prioridad ? Number(row.prioridad) : 0
        const reviewDate = row.fech_rev ? String(row.fech_rev).trim().substring(0, 10) : null
        const sprintNum = (row.sprint !== undefined && row.sprint !== null && String(row.sprint).trim() !== '') ? Number(row.sprint) : null;

        await query(
          `UPDATE backlog_items 
           SET priority = COALESCE(?, priority), 
               review_date = COALESCE(?, review_date), 
               sprint_num = COALESCE(?, sprint_num) 
           WHERE id = ?`,
          [isNaN(priority) ? 0 : priority, reviewDate, sprintNum, itemId]
        )
      } catch (err: any) {
        errors.push(`Sprints ${row.codigo}: Error actualizando datos extras (${err.message})`)
      }
    }

    // ── FASE 4: PROCESAR OBSERVACIONES (CON FILTRO DE FILAS FANTASMA Y ENUM 'nota') ──
    for (const row of obsRows) {
      const rawDesc = row.descripcion ? String(row.descripcion).trim() : '';
      const rawCode = row.codigo ? String(row.codigo).trim() : '';
      
      // 🚀 EL FILTRO MÁGICO: Si la fila no tiene ni código ni descripción, la ignoramos por completo
      if (!rawCode && !rawDesc) continue;

      const descText = rawDesc || rawCode;
      
      const relatedCode = row.ticket_relacionado ? String(row.ticket_relacionado).trim().toLowerCase() : null
      const itemId = relatedCode ? existingMap.get(relatedCode) || null : null
      
      let titleText = rawCode ? `${rawCode} - ${descText}` : descText;
      if (titleText.length > 200) titleText = titleText.substring(0, 197) + '...';

      const obsStatus = row.estado ? normalizeObsStatus(row.estado) : 'abierta'
      
      // TRADUCTOR SEGURO DE ENUM
      let rawType = row.tipo ? String(row.tipo).trim().toLowerCase() : '';
      let parsedType = 'nota'; 
      if (rawType.includes('riesgo')) parsedType = 'riesgo';
      else if (rawType.includes('bloqueo')) parsedType = 'bloqueo';
      else if (rawType.includes('mejora')) parsedType = 'mejora';

      const obsTypeUpdate = row.tipo ? parsedType : null;
      const obsPrioUpdate = row.prioridad ? String(row.prioridad).trim().toLowerCase() : null;
      
      const obsTypeInsert = parsedType; 
      const obsPrioInsert = row.prioridad ? String(row.prioridad).trim().substring(0, 20) : '0';
      
      const obsEta  = parseDateStr(row.eta);
      
      const rawRegDate = row.fech_reg || row.reg_date || row.regDate || row['fech reg'] || row['FECH REG'];
      const dateStr = parseDateStr(rawRegDate)
      const createdAt = dateStr ? `${dateStr} 12:00:00` : new Date().toISOString().slice(0, 19).replace('T', ' ')

      try {
        let existObs: ExistingItem[] = []
        
        if (rawCode) {
          existObs = await query<ExistingItem>(
            `SELECT id FROM observaciones WHERE project_id = ? AND titulo LIKE ? LIMIT 1`, 
            [projectId, `${rawCode}%`]
          )
        } else {
          existObs = await query<ExistingItem>(
            `SELECT id FROM observaciones WHERE project_id = ? AND descripcion = ? LIMIT 1`, 
            [projectId, descText]
          )
        }
        
        if (existObs.length > 0) {
          await query(
            `UPDATE observaciones 
             SET titulo=?, descripcion=?, estado=?, backlog_item_id=?, tipo=COALESCE(?, tipo), prioridad=COALESCE(?, prioridad), eta=COALESCE(?, eta), updated_by=?, updated_at=NOW() 
             WHERE id=?`,
            [titleText, descText, obsStatus, itemId, obsTypeUpdate, obsPrioUpdate, obsEta, ctx.userId, existObs[0].id]
          )
          results.oUpdated++
        } else {
          await query(
            `INSERT INTO observaciones 
             (tenant_id, project_id, backlog_item_id, tipo, prioridad, titulo, descripcion, estado, eta, created_by, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [ctx.tenantId, projectId, itemId, obsTypeInsert, obsPrioInsert, titleText, descText, obsStatus, obsEta, ctx.userId, createdAt]
          )
          results.oCreated++
        }
      } catch (err: any) {
        errors.push(`Fallo al insertar observación [${rawCode || descText.substring(0,20)}]: ${err.message}`)
      }
    }
    
    return NextResponse.json({
      sprintsCreated: results.sprints,
      backlogCreated: results.bCreated,
      backlogUpdated: results.bUpdated,
      obsCreated: results.oCreated,
      obsUpdated: results.oUpdated,
      errors,
    })
  } catch (err) {
    return handleApiError(err)
  }
}