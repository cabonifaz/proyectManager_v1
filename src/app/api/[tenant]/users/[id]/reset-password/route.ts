import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { callProcedureOut } from '@/lib/db'
import { generatePassword } from '@/lib/password'
import bcrypt from 'bcryptjs'

export async function POST(req: NextRequest, { params }: { params: { id: string; tenant: string } }) {
  try {
    const { ctx, errorResponse } = await guardRoute(req, 'user:update')
    if (errorResponse) return errorResponse

    if (ctx.role !== 'super_admin') {
      return NextResponse.json({ error: 'Solo el administrador puede resetear contraseñas' }, { status: 403 })
    }

    const newPassword = generatePassword()
    const hashedPassword = await bcrypt.hash(newPassword, 10)

    const result = await callProcedureOut(
      'sp_user_upsert',
      {
        p_tenant_id:    Number(ctx.tenantId),
        p_user_id:      Number(params.id),
        p_name:         null,
        p_email:        null,
        p_password:     hashedPassword,
        p_role:         null,
        p_active:       null,
        p_user_id_exec: Number(ctx.userId),
      },
      ['p_result_id', 'p_error'],
    )

    if (result.p_error) {
      return NextResponse.json({ error: result.p_error }, { status: 400 })
    }

    return NextResponse.json({ password: newPassword })
  } catch (err) {
    return handleApiError(err)
  }
}
