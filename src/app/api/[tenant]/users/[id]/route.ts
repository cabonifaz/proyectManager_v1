import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { callProcedureOut } from '@/lib/db'
import bcrypt from 'bcryptjs'

export async function PATCH(req: NextRequest, { params }: { params: { id: string, tenant: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'user:update')
    if (errorResponse) return errorResponse

    // Solo el administrador puede editar usuarios
    if (ctx.role !== 'super_admin') {
      return NextResponse.json({ error: 'Solo el administrador puede realizar esta acción' }, { status: 403 })
    }

    const body = await req.json()

    // 1. Validación estricta del ENUM de la base de datos
    const allowedRoles = ['super_admin', 'gestor_proyecto', 'lider_tecnico', 'desarrollador']
    if (!allowedRoles.includes(body.role)) {
      return NextResponse.json({ error: `El rol '${body.role}' no es válido en el sistema.` }, { status: 400 })
    }

    // 2. Hashear la contraseña si se escribió una nueva en el formulario
    let hashedPassword = null;
    if (body.password && body.password.trim() !== '') {
      const saltRounds = 10;
      hashedPassword = await bcrypt.hash(body.password, saltRounds);
    }

    // 3. Ejecución del Procedimiento Almacenado con el orden exacto de los parámetros
    const result = await callProcedureOut(
      'sp_user_upsert',
      {
        p_tenant_id:    Number(ctx.tenantId),
        p_user_id:      Number(params.id),
        p_name:         body.name,
        p_email:        body.email,
        p_password:     hashedPassword,           // La contraseña hasheada va antes del rol
        p_role:         body.role,                // El rol validado
        p_active:       Number(body.active ?? 1),
        p_user_id_exec: Number(ctx.userId) 
      },
      ['p_result_id', 'p_error']
    )

    if (result.p_error) {
      return NextResponse.json({ error: result.p_error }, { status: 400 })
    }

    return NextResponse.json({ success: true, id: result.p_result_id })
  } catch (err) {
    console.error("Error en PATCH User:", err);
    return handleApiError(err)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string, tenant: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'user:delete')
    if (errorResponse) return errorResponse

    // Solo el administrador puede desactivar usuarios
    if (ctx.role !== 'super_admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    // Desactivación lógica (active = 0) enviando los parámetros vacíos/nulos
    const result = await callProcedureOut(
      'sp_user_upsert',
      {
        p_tenant_id:    Number(ctx.tenantId),
        p_user_id:      Number(params.id),
        p_name:         null,
        p_email:        null,
        p_password:     null,
        p_role:         null,
        p_active:       0, 
        p_user_id_exec: Number(ctx.userId)
      },
      ['p_result_id', 'p_error']
    )

    if (result.p_error) {
      return NextResponse.json({ error: result.p_error }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Error en DELETE User:", err);
    return handleApiError(err)
  }
}