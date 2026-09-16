import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, getContextFromHeaders, requireProjectPermission, resolveProjectTenantId, handleApiError } from '@/lib/session'
import { callProcedure, callProcedureOut, query, execute } from '@/lib/db'
import { saveLogo, deleteOldLogo } from '@/lib/uploadLogo'
import { RowDataPacket } from 'mysql2/promise'

const HEX_RE = /^#[0-9a-fA-F]{6}$/

async function checkProjectAccess(tenantId: number, projectId: number, userId: number, role: string): Promise<boolean> {
  if (role === 'super_admin') return true
  const rows = await query<RowDataPacket>(
    `SELECT 1 FROM project_members
     WHERE project_id = ? AND user_id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [projectId, userId],
  )
  return rows.length > 0
}

export async function GET(req: NextRequest, { params }: { params: { tenant: string; id: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'project:read')
    if (errorResponse) return errorResponse

    const userId = ctx.role === 'super_admin' ? null : ctx.userId

    const results = await callProcedure<RowDataPacket>(
      'CALL sp_project_list(?, ?, ?)',
      [ctx.tenantId, null, userId],
    )

    const project = (results[0] ?? []).find(
      (p: RowDataPacket) => p.id === Number(params.id)
    )

    if (!project) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 })

    const colResults = await callProcedure<RowDataPacket>(
      'CALL sp_project_columns_list(?, ?)',
      [ctx.tenantId, Number(params.id)],
    )

    return NextResponse.json({ data: { ...project, columns: colResults[0] ?? [] } })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { tenant: string; id: string } }) {
  try {
    const ctx = await getContextFromHeaders(req)
    if (!ctx) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    // El rol de proyecto puede elevar (ej. un usuario "gestor" en este proyecto puntual),
    // pero igual debe ser miembro del proyecto — checkProjectAccess se mantiene sin cambios.
    const permError = await requireProjectPermission(ctx, 'project:update', Number(params.id))
    if (permError) return permError

    const hasAccess = await checkProjectAccess(
      ctx.tenantId, Number(params.id), ctx.userId, ctx.role
    )
    if (!hasAccess) {
      return NextResponse.json({ error: 'No tienes acceso a este proyecto' }, { status: 403 })
    }

    const body   = await req.json()
    const projectTenantId = (await resolveProjectTenantId(Number(params.id))) ?? ctx.tenantId
    const result = await callProcedureOut(
      'sp_project_upsert',
{
        p_tenant_id:   projectTenantId,
        p_project_id:  Number(params.id),
        p_manager_id:  body.managerId ?? null,
        p_code:        body.code,
        p_name:        body.name,
        p_description: body.description ?? null,
        p_status:      body.status ?? 'activo',
        p_methodology: body.methodology ?? 'scrum', // 🚀 AÑADIR ESTA LÍNEA
        p_start_date:  body.startDate ?? null,
        p_end_date:    body.endDate ?? null,
        p_user_id:     ctx.userId
      },
      ['p_result_id', 'p_error'],
    )

    if (result.p_error) return NextResponse.json({ error: result.p_error }, { status: 400 })

    // Logo/color: se guardan aparte del procedure (mismo patron que el branding de tenants)
    if (body.logoDataUrl || body.colorHex !== undefined) {
      const fields: string[] = []
      const values: unknown[] = []

      if (body.colorHex !== undefined) {
        const colorHex = body.colorHex === null ? null : String(body.colorHex)
        if (colorHex !== null && !HEX_RE.test(colorHex)) {
          return NextResponse.json({ error: 'El color debe ser un hex válido (#rrggbb)' }, { status: 400 })
        }
        fields.push('color_hex = ?'); values.push(colorHex)
      }

      if (body.logoDataUrl) {
        const current: any = await query(`SELECT code, logo_url FROM projects WHERE id = ? LIMIT 1`, [Number(params.id)])
        const logoResult = await saveLogo('projects', current[0]?.code || `p${params.id}`, body.logoDataUrl)
        if (logoResult.error) return NextResponse.json({ error: logoResult.error }, { status: 400 })
        await deleteOldLogo('projects', current[0]?.logo_url)
        fields.push('logo_url = ?'); values.push(logoResult.url)
      }

      if (fields.length > 0) {
        values.push(Number(params.id))
        await execute(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`, values)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { tenant: string; id: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'project:delete')
    if (errorResponse) return errorResponse

    const hasAccess = await checkProjectAccess(
      ctx.tenantId, Number(params.id), ctx.userId, ctx.role
    )
    if (!hasAccess) {
      return NextResponse.json({ error: 'No tienes acceso a este proyecto' }, { status: 403 })
    }

    const result = await callProcedureOut(
      'sp_project_delete',
      {
        p_tenant_id:  ctx.tenantId,
        p_project_id: Number(params.id),
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