import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { callProcedure, callProcedureOut } from '@/lib/db'
import bcrypt from 'bcryptjs'

export async function GET(req: NextRequest) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'user:read')
    if (errorResponse) return errorResponse

    const results = await callProcedure('CALL sp_user_list(?)', [ctx.tenantId])
    return NextResponse.json({ data: results[0] ?? [] })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'user:create')
    if (errorResponse) return errorResponse

    if (ctx.role !== 'super_admin') {
      return NextResponse.json({ error: 'Solo el administrador puede crear usuarios' }, { status: 403 })
    }

    const body = await req.json()

    const allowedRoles = ['super_admin', 'gestor_proyecto', 'lider_tecnico', 'desarrollador']
    if (!allowedRoles.includes(body.role)) {
      return NextResponse.json({ error: `El rol '${body.role}' no es válido.` }, { status: 400 })
    }

    if (!body.password?.trim()) {
      return NextResponse.json({ error: 'La contraseña es obligatoria para crear un usuario.' }, { status: 400 })
    }

    const hashedPassword = await bcrypt.hash(body.password, 10)

    const result = await callProcedureOut(
      'sp_user_upsert',
      {
        p_tenant_id:    Number(ctx.tenantId),
        p_user_id:      null,
        p_name:         body.name,
        p_email:        body.email,
        p_password:     hashedPassword,
        p_role:         body.role,
        p_active:       1,
        p_user_id_exec: Number(ctx.userId),
      },
      ['p_result_id', 'p_error'],
    )

    if (result.p_error) {
      return NextResponse.json({ error: result.p_error }, { status: 400 })
    }

    return NextResponse.json({ success: true, id: result.p_result_id }, { status: 201 })
  } catch (err) {
    return handleApiError(err)
  }
}