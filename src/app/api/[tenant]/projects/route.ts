import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { callProcedure, callProcedureOut, query, execute } from '@/lib/db' // <-- Importamos callProcedureOut
import { saveLogo } from '@/lib/uploadLogo'

const HEX_RE = /^#[0-9a-fA-F]{6}$/
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

    // Rol asignado por proyecto (via "Asignar" en Usuarios), para que el cliente pueda
    // elevar permisos donde corresponda sin tener que consultarlo proyecto por proyecto.
    // project_members no tiene tenant_id propio; se valida el tenant via projects.tenant_id.
    const memberRoles: any = await query(
      `SELECT pm.project_id, pm.role
       FROM project_members pm
       INNER JOIN projects p ON p.id = pm.project_id
       WHERE pm.user_id = ? AND p.tenant_id = ? AND pm.deleted_at IS NULL`,
      [ctx.userId, ctx.tenantId],
    )
    const roleByProject = new Map(memberRoles.map((r: any) => [r.project_id, r.role]))
    const data = (results[0] ?? []).map((p: any) => ({ ...p, member_role: roleByProject.get(p.id) ?? null }))

    return NextResponse.json({ data })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(req: NextRequest, { params }: { params: { tenant: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'project:create')
    if (errorResponse) return errorResponse

    const body = await req.json()
    
    // Usamos callProcedureOut mapeando los parámetros de entrada y atrapando las variables de salida
    const result = await callProcedureOut(
      'sp_project_upsert',
{
        p_tenant_id:   ctx.tenantId,
        p_project_id:  null,
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
      ['p_result_id', 'p_error'] // <-- Le decimos explícitamente qué variables OUT debe atrapar
    )

    // Validamos si el SP arrojó un error controlado (ej. código duplicado)
    if (result.p_error) {
      return NextResponse.json({ error: result.p_error }, { status: 400 })
    }

    const newProjectId = result.p_result_id

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
        const logoResult = await saveLogo('projects', body.code || `p${newProjectId}`, body.logoDataUrl)
        if (logoResult.error) return NextResponse.json({ error: logoResult.error }, { status: 400 })
        fields.push('logo_url = ?'); values.push(logoResult.url)
      }

      if (fields.length > 0) {
        values.push(newProjectId)
        await execute(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`, values)
      }
    }

    // Devolvemos el ID atrapado correctamente
    return NextResponse.json({ id: newProjectId }, { status: 201 })
  } catch (err) {
    return handleApiError(err)
  }
}