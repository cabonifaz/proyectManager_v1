import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { callProcedureOut, query } from '@/lib/db'
import { RowDataPacket } from 'mysql2/promise'

interface ColRow extends RowDataPacket { id: number; name: string; col_key: string }
interface ExistingItem extends RowDataPacket { id: number; code: string }
interface ExistingSprint extends RowDataPacket { id: number; number: number }
interface SprintItemRow extends RowDataPacket { id: number }

function normalizeStatus(val: string): string {
  if (!val) return 'pendiente';
  const v = String(val).toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (v.includes('aprobado') || v.includes('qa ok')) return 'completado';
  if (v.includes('desestimado') || v.includes('observado') || v.includes('qa obs')) return 'bloqueado';
  if (v.includes('atendido') || v.includes('levantado')) return 'en_revision';
  if (v.includes('asignado')) return 'en_progreso';

  return 'pendiente';
}

function normalizeObsStatus(val: string): string {
  if (!val) return 'abierta';
  const v = String(val).toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (v.includes('aprobado') || v.includes('qa ok') || v.includes('desestimado')) return 'cerrada';
  if (v.includes('atendido') || v.includes('levantado')) return 'resuelta';
  if (v.includes('asignado') || v.includes('observado') || v.includes('qa obs')) return 'en_seguimiento';
  if (v.includes('pendiente')) return 'abierta';

  return 'abierta';
}

// NUEVO: Traductor de prioridad para Observaciones
function normalizeObsPriority(val: any): string {
  if (!val || String(val).trim() === '') return 'baja';
  
  const strVal = String(val).toLowerCase().trim();
  if (strVal.includes('alta') || strVal.includes('critica')) return 'alta';
  if (strVal.includes('media')) return 'media';
  if (strVal.includes('baja')) return 'baja';

  const num = Number(val);
  if (!isNaN(num)) {
    if (num >= 8) return 'alta';    
    if (num >= 4) return 'media';   
    return 'baja';                  
  }
  return 'baja'; 
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

    // ── FASE 0: DETECTAR Y CREAR COLUMNAS TECNOLÓGICAS FALTANTES ──
    const standardCols = new Set([
      'codigo', 'modulo', 'descripcion', 'avance', 'estado', 'sprint', 'eta',
      'fech_reg', 'reg_date', 'regdate', 'fech reg', 'comentario', 'comentarios',
      'prioridad', 'prio', 'fech_rev', 'fech rev', 'descripcion_general', 'ticket_relacionado', 'tipo'
    ]);

    const allHeaders = new Set<string>();
    
    const extractHeaders = (rows: Record<string, any>[]) => {
      rows.forEach(row => {
        Object.keys(row).forEach(header => {
          const cleanHeader = header.toLowerCase().trim();
          if (cleanHeader && !standardCols.has(cleanHeader)) {
            allHeaders.add(header.trim());
          }
        });
      });
    };

    extractHeaders(backlogRows);
    extractHeaders(sprintRows); // Agregado para buscar también en sprints
    extractHeaders(obsRows);

    let techCols = await query<ColRow>(
      `SELECT id, name, col_key FROM project_columns WHERE project_id = ? AND deleted_at IS NULL AND active = 1`, [projectId]
    );
    
    const existingColKeys = new Set(techCols.map(c => c.col_key.toLowerCase()));
    const existingColNames = new Set(techCols.map(c => c.name.toLowerCase()));

    for (const header of Array.from(allHeaders)) {
      const headerKey = header.toLowerCase().replace(/[\s.]+/g, '_');
      if (!existingColKeys.has(headerKey) && !existingColNames.has(header.toLowerCase())) {
        try {
          await query(
            `INSERT INTO project_columns (project_id, name, col_key, col_type, sort_order, active, created_by, created_at)
             VALUES (?, ?, ?, 'both', 99, 1, ?, NOW())`,
             [projectId, header, headerKey, ctx.userId]
          );
        } catch (e: any) {
          errors.push(`No se pudo crear columna automática ${header}: ${e.message}`);
        }
      }
    }

    techCols = await query<ColRow>(
      `SELECT id, name, col_key FROM project_columns WHERE project_id = ? AND deleted_at IS NULL AND active = 1`, [projectId]
    );

    // ── FASE 1: CREAR SPRINTS FALTANTES ──
    const allSprintNums = new Set(
      [...backlogRows, ...sprintRows]
        // 🚀 1. Ignoramos las filas fantasma: solo procesamos las que tengan un código real
        .filter(r => r.codigo && String(r.codigo).trim() !== '')
        .map(r => Number(r.sprint))
        // 🚀 2. Cambiamos el "n >= 0" por "n > 0" para rechazar definitivamente el 0
        .filter(n => !isNaN(n) && n > 0)
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
    const existingItems = await query<ExistingItem>(
      `SELECT id, code FROM backlog_items WHERE project_id = ? AND deleted_at IS NULL`, [projectId]
    )
    const existingMap = new Map<string, number>(existingItems.map(i => [i.code.trim().toLowerCase(), i.id]))

    // Mapa para reemplazo de la 'X'
    const sprintDataMap = new Map<string, Record<string, any>>();
    sprintRows.forEach(sr => {
      if (sr.codigo) sprintDataMap.set(String(sr.codigo).trim().toLowerCase(), sr);
    });

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
        // 🚀 CORRECCIÓN 1: Agregamos p_code aquí
        const upd = await callProcedureOut('sp_backlog_update', {
          p_tenant_id: ctx.tenantId, p_item_id: existingId,
          p_code: String(row.codigo).trim(), 
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
          // 🚀 CORRECCIÓN 2: Agregamos p_code: null aquí
          await callProcedureOut('sp_backlog_update', {
            p_tenant_id: ctx.tenantId, p_item_id: itemId,
            p_code: null, 
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

      // LÓGICA DE REEMPLAZO DE LA "X" EN TECNOLOGÍAS
      for (const col of techCols) {
        const colNameNorm = col.name.toLowerCase().replace(/[\s.]+/g, '_')
        let val = row[col.col_key] ?? row[colNameNorm] ?? row[col.name.toLowerCase()] ?? row[col.name] ?? null
        
        const isX = val !== null && String(val).trim().toLowerCase() === 'x';

        // Si está vacío o es una "X", buscamos en el sprint
        if (!val || String(val).trim() === '' || isX) {
          const sprintMatch = sprintDataMap.get(codeKey);
          if (sprintMatch) {
            const sprintVal = sprintMatch[col.col_key] ?? sprintMatch[colNameNorm] ?? sprintMatch[col.name.toLowerCase()] ?? sprintMatch[col.name] ?? null;
            if (sprintVal && String(sprintVal).trim() !== '') {
              val = sprintVal; // Tomamos el nombre del sprint
            }
          }
        }

        // Guardamos si hay valor válido (y no es solo una 'x')
        if (val && String(val).trim() !== '' && String(val).trim().toLowerCase() !== 'x') {
          await callProcedureOut('sp_backlog_tech_upsert', {
            p_tenant_id: ctx.tenantId, p_item_id: itemId, p_column_id: col.id,
            p_value: String(val).trim(), p_eta: null, p_user_id: ctx.userId,
          }, ['p_error'])
        }
      }
    }

    // ── FASE 3: PROCESAR BACKLOG-SPRINTS ──
    const dbSprints = await query<ExistingSprint>(
      `SELECT id, number FROM sprints WHERE project_id = ? AND deleted_at IS NULL`, [projectId]
    )
    const sprintIdMap = new Map<number, number>(dbSprints.map(s => [s.number, s.id]))

    for (const row of sprintRows) {
      if (!row.codigo) continue
      const codeKey = String(row.codigo).trim().toLowerCase()
      const itemId = existingMap.get(codeKey)
      
      if (!itemId) {
        errors.push(`Sprints: Código ${row.codigo} no existe en el backlog principal`)
        continue
      }
      try {
        const priority = row.prioridad || row.prio ? Number(row.prioridad || row.prio) : 0;
        const reviewDate = row.fech_rev || row['fech rev'] ? String(row.fech_rev || row['fech rev']).trim().substring(0, 10) : null;
        const sprintNum = (row.sprint !== undefined && row.sprint !== null && String(row.sprint).trim() !== '') ? Number(row.sprint) : null;
        const sprintComment = row.comentario ? String(row.comentario).trim() : null;
        
        // 🚀 Extraemos el ETA del Sprint
        const sprintEta = parseDateStr(row.eta);

        await query(
          `UPDATE backlog_items SET sprint_num = COALESCE(?, sprint_num), comment = ? WHERE id = ?`,
          [sprintNum, sprintComment, itemId]
        )

        if (sprintNum !== null) {
          const sprintId = sprintIdMap.get(sprintNum)
          if (sprintId) {
            const existingSprintItem = await query<SprintItemRow>(
              `SELECT id FROM sprint_items WHERE sprint_id = ? AND backlog_item_id = ? AND deleted_at IS NULL LIMIT 1`, 
              [sprintId, itemId]
            )

            const desc = String(row.descripcion || '').trim();
            const stat = row.estado ? normalizeStatus(row.estado) : 'pendiente';

            if (existingSprintItem.length > 0) {
              // 🚀 Actualizamos el ETA aquí
              await query(
                `UPDATE sprint_items SET priority = ?, review_date = ?, eta = ?, updated_by = ?, updated_at = NOW() WHERE id = ?`,
                [isNaN(priority) ? 0 : priority, reviewDate, sprintEta, ctx.userId, existingSprintItem[0].id]
              )
            } else {
              // 🚀 Insertamos el ETA aquí
              await query(
                `INSERT INTO sprint_items (sprint_id, backlog_item_id, project_id, code, description, sprint_num, status, priority, review_date, eta, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
                [sprintId, itemId, projectId, String(row.codigo).trim(), desc, sprintNum, stat, isNaN(priority) ? 0 : priority, reviewDate, sprintEta, ctx.userId]
              )
            }
          }
        }
      } catch (err: any) {
        errors.push(`Sprints ${row.codigo}: Error actualizando datos extras (${err.message})`)
      }
    }

    // ── FASE 4: PROCESAR OBSERVACIONES (Prioridad ignorada) ──
    for (const row of obsRows) {
      const rawExcelDescGen = row.descripcion_general || row.descripcion || row['descripción general'] || row['DESCRIPCION GENERAL'] || '';
      const rawExcelComentarios = row.comentario || row.comentarios || row['comentarios'] || row['COMENTARIO'] || '';
      const ticketRel = row.ticket_relacionado ? String(row.ticket_relacionado).trim() : '';
      
      if (!rawExcelDescGen && !rawExcelComentarios && !ticketRel) continue;

      const titleText = String(rawExcelDescGen).trim() || 'Sin título';
      const descText = String(rawExcelComentarios).trim() || 'Sin descripción';

      const relatedCode = ticketRel.toLowerCase();
      const itemId = relatedCode ? existingMap.get(relatedCode) || null : null;

      const obsStatus = row.estado ? normalizeObsStatus(row.estado) : 'abierta';
      
      let rawType = row.tipo ? String(row.tipo).trim().toLowerCase() : '';
      let parsedType = 'nota'; 
      if (rawType.includes('riesgo')) parsedType = 'riesgo';
      else if (rawType.includes('bloqueo')) parsedType = 'bloqueo';
      else if (rawType.includes('mejora')) parsedType = 'mejora';

      const obsTypeUpdate = row.tipo ? parsedType : null;
      const obsTypeInsert = parsedType; 
      
      const obsEta  = parseDateStr(row.eta);
      
      const rawRegDate = row.fech_reg || row.reg_date || row.regDate || row['fech reg'] || row['FECH REG'];
      const dateStr = parseDateStr(rawRegDate)
      const createdAt = dateStr ? `${dateStr} 12:00:00` : new Date().toISOString().slice(0, 19).replace('T', ' ')

      try {
        let existObs: ExistingItem[] = []
        let currentObsId = 0;
        
        existObs = await query<ExistingItem>(
          `SELECT id FROM observaciones WHERE project_id = ? AND titulo = ? LIMIT 1`, 
          [projectId, titleText]
        )
        
        if (existObs.length > 0) {
          currentObsId = existObs[0].id;
          // 🚀 ACTUALIZACIÓN SIN PRIORIDAD
          await query(
            `UPDATE observaciones 
             SET titulo=?, descripcion=?, estado=?, backlog_item_id=?, tipo=COALESCE(?, tipo), eta=COALESCE(?, eta), updated_by=?, updated_at=NOW() 
             WHERE id=?`,
            [titleText, descText, obsStatus, itemId, obsTypeUpdate, obsEta, ctx.userId, currentObsId]
          )
          results.oUpdated++
        } else {
          // 🚀 Explicitamente pasamos NULL para prioridad
          const insertRes: any = await query(
            `INSERT INTO observaciones 
             (tenant_id, project_id, backlog_item_id, tipo, prioridad, titulo, descripcion, estado, eta, created_by, created_at) 
             VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
            [ctx.tenantId, projectId, itemId, obsTypeInsert, titleText, descText, obsStatus, obsEta, ctx.userId, createdAt]
          )
          results.oCreated++
          
          // ... resto del codigo igual
          
          currentObsId = insertRes?.insertId || 0;
          
          if (!currentObsId) {
            const newObs = await query<ExistingItem>(
              `SELECT id FROM observaciones WHERE project_id = ? AND titulo = ? ORDER BY id DESC LIMIT 1`, 
              [projectId, titleText]
            )
            if (newObs.length > 0) currentObsId = newObs[0].id;
          }
        }

        // ... (el código de asignación de responsables se queda igual)

        if (currentObsId) {
          try {
            await query(`DELETE FROM observacion_asignaciones WHERE observacion_id = ?`, [currentObsId]);
          } catch (e) {}

          const excelHeaders = Object.keys(row);

          for (const col of techCols) {
            const matchedHeader = excelHeaders.find(header => 
              header.trim().toLowerCase() === col.name.trim().toLowerCase() ||
              header.trim().toLowerCase().replace(/[\s.]+/g, '_') === col.col_key.trim().toLowerCase()
            );

            const val = matchedHeader ? row[matchedHeader] : null;
            
            if (!val || String(val).trim() === '') continue;
            
            try {
              await query(
                `INSERT INTO observacion_asignaciones 
                 (tenant_id, observacion_id, column_id, col_key, tech_name, developer_name, created_at) 
                 VALUES (?, ?, ?, ?, ?, ?, NOW())`,
                [ctx.tenantId, currentObsId, col.id, col.col_key, col.name, String(val).trim()]
              )
            } catch (assignErr: any) {}
          }
        }

      } catch (err: any) {
        errors.push(`Fallo al procesar observación [${titleText}]: ${err.message}`)
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