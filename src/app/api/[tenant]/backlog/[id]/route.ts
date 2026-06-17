import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { callProcedureOut, query } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: { tenant: string; id: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'backlog:update')
    if (errorResponse) return errorResponse

    const id = Number(params.id)
    const body = await req.json()

    // ========================================================================
    // 🛡️ 1. BLOQUE DE SEGURIDAD AISLADO POR PROYECTO (El que ya funcionaba)
    // ========================================================================
    const priorityNum = Number(body.priority) || 0;
    const isCompleted = body.status === 'completado';

    const currentTicketInfo: any = await query(
        `SELECT sprint_num, priority, project_id, status FROM backlog_items WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
        [id]
    );
    
    if (!currentTicketInfo || currentTicketInfo.length === 0) {
        return NextResponse.json({ error: 'Ticket no encontrado' }, { status: 404 });
    }

    const projectId = currentTicketInfo[0].project_id;
    const sprintNum = currentTicketInfo[0].sprint_num !== null 
                        ? currentTicketInfo[0].sprint_num 
                        : (body.sprintNum ?? 0);

    // A. Validar duplicados (Añadiendo project_id al WHERE)
    if (priorityNum > 0 && !isCompleted) {
      const existing: any = await query(
        `SELECT id, code, priority FROM backlog_items 
         WHERE project_id = ? 
           AND sprint_num = ? 
           AND id != ? 
           AND status != 'completado' 
           AND deleted_at IS NULL 
         FOR UPDATE`, 
        [projectId, sprintNum, id]
      );

      const conflicto = existing.find((item: any) => Number(item.priority) === priorityNum);

      if (conflicto) {
        return NextResponse.json({ 
            error: `La prioridad ${priorityNum} ya está asignada al ticket ${conflicto.code} en este sprint/proyecto.` 
        }, { status: 400 });
      }
    }

    // B. Efecto Cascada Sincronizado (Añadiendo project_id al WHERE)
    if (body.status === 'completado' && currentTicketInfo[0].status !== 'completado') {
        const oldPriority = currentTicketInfo[0].priority;
        if (oldPriority > 0 && sprintNum !== null) {
            await query(
                `UPDATE backlog_items SET priority = priority - 1 
                 WHERE project_id = ? AND sprint_num = ? AND priority > ? AND status != 'completado' AND deleted_at IS NULL`, 
                [projectId, sprintNum, oldPriority]
            );
            await query(
                `UPDATE sprint_items SET priority = priority - 1 
                 WHERE project_id = ? AND sprint_num = ? AND priority > ? AND status != 'completado' AND deleted_at IS NULL`, 
                [projectId, sprintNum, oldPriority]
            );
        }
        body.priority = 0; 
    }
    // ========================================================================

    // 2. Guardar la data general a través del Procedimiento Almacenado
    const result = await callProcedureOut(
      'sp_backlog_update',
      {
        p_tenant_id:    ctx.tenantId,
        p_item_id:      id,
        p_code:         body.code        ?? null,
        p_module:       body.module      ?? null,
        p_description:  body.description ?? null,
        p_progress:     body.progress    ?? null,
        p_status:       body.status      ?? null,
        p_sprint_num:   body.sprintNum   ?? null,
        p_eta:          body.eta         ?? null,
        // 🚀 CORRECCIÓN AQUÍ: Engañamos al COALESCE enviando "" cuando borras el comentario
        p_comment:      body.comment === null ? "" : (body.comment ?? null), 
        p_updated_by:   ctx.userId,
        p_eta_explicit: 'eta' in body ? 1 : 0,
        p_priority:     body.priority    ?? 0, 
      },
      ['p_error']
    )

    if (result.p_error) return NextResponse.json({ error: result.p_error }, { status: 400 })

    // Sincronizar el código si existe
    if (body.code) {
      await query(
        `UPDATE sprint_items SET code = ? WHERE backlog_item_id = ? AND deleted_at IS NULL`,
        [String(body.code).trim(), id]
      )
    }

   // 3. Lógica UPSERT para sincronizar sprint_items a la perfección
    if (body.priority !== undefined || body.reviewDate !== undefined || body.status !== undefined) {
      const exist: any = await query(
        `SELECT id FROM sprint_items WHERE backlog_item_id = ? AND deleted_at IS NULL LIMIT 1`, 
        [id]
      )

      if (exist && exist.length > 0) {
        // Ejecutamos el UPDATE
        await query(
          `UPDATE sprint_items 
           SET priority = COALESCE(?, priority),
               status = COALESCE(?, status),
               review_date = COALESCE(?, review_date), 
               updated_by = ?, 
               updated_at = NOW() 
           WHERE backlog_item_id = ? AND deleted_at IS NULL`,
          [body.priority ?? 0, body.status ?? null, body.reviewDate || null, ctx.userId, id]
        )
      } else if (body.sprintNum !== null && body.sprintNum !== undefined) { 
        // Lo insertamos copiando los datos base
        const backlogInfo: any = await query(
          `SELECT project_id, code, description, status FROM backlog_items WHERE id = ? LIMIT 1`, 
          [id]
        )

        if (backlogInfo && backlogInfo.length > 0) {
          const sprintInfo: any = await query(
            `SELECT id FROM sprints WHERE number = ? AND project_id = ? AND deleted_at IS NULL LIMIT 1`, 
            [body.sprintNum, backlogInfo[0].project_id]
          )

          if (sprintInfo && sprintInfo.length > 0) {
            await query(
              `INSERT INTO sprint_items 
               (sprint_id, backlog_item_id, project_id, code, description, sprint_num, status, priority, review_date, created_by, created_at) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
              [
                sprintInfo[0].id, id, backlogInfo[0].project_id, backlogInfo[0].code, backlogInfo[0].description,
                body.sprintNum, body.status ?? backlogInfo[0].status, body.priority ?? 0, body.reviewDate || null, ctx.userId
              ]
            )
          }
        }
      }
    }
    
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err)
  }
}

// ... función DELETE se mantiene igual
export async function DELETE(req: NextRequest, { params }: { params: { tenant: string; id: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'backlog:delete')
    if (errorResponse) return errorResponse

    const result = await callProcedureOut(
      'sp_backlog_delete',
      {
        p_tenant_id:  ctx.tenantId,
        p_item_id:    Number(params.id),
        p_deleted_by: ctx.userId,
      },
      ['p_error'],
    )

    if (result.p_error) return NextResponse.json({ error: result.p_error }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err)
  }
}