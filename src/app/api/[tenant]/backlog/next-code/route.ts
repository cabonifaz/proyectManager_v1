import { NextRequest, NextResponse } from 'next/server'
import { guardRoute, handleApiError } from '@/lib/session'
import { query } from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: { tenant: string } }) {
  try {
    const { errorResponse } = await guardRoute(req, 'backlog:read')
    if (errorResponse) return errorResponse

    const { searchParams } = req.nextUrl
    const projectId = searchParams.get('projectId')
    
    if (!projectId) {
      return NextResponse.json({ error: 'projectId es requerido' }, { status: 400 })
    }

    // Buscamos el último código usado en este proyecto
    const lastItemRows: any = await query(
      `SELECT code FROM backlog_items WHERE project_id = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1`,
      [Number(projectId)]
    )

    let nextCode = ''

    if (lastItemRows && lastItemRows.length > 0 && lastItemRows[0].code) {
      const lastCode = lastItemRows[0].code
      
      // Magia Regex: Separa todo el texto antes del número, y luego el número final
      // Ej: "PM-V1-001" -> match[1] = "PM-V1-", match[2] = "001"
      const match = lastCode.match(/^(.*?)(\d+)$/)
      
      if (match) {
        const prefix = match[1]
        const currentNum = parseInt(match[2], 10)
        const nextNum = currentNum + 1
        
        // Mantiene la longitud de los ceros (si era 001, devuelve 002. Si era 01, devuelve 02)
        const paddedNum = nextNum.toString().padStart(match[2].length, '0') 
        nextCode = `${prefix}${paddedNum}`
      } else {
        // Si el último código eran solo letras, le añadimos -001
        nextCode = `${lastCode}-001`
      }
    } else {
      // Es el primer ticket absoluto del proyecto. Buscamos el código del proyecto.
      const projectRows: any = await query('SELECT code FROM projects WHERE id = ? LIMIT 1', [Number(projectId)])
      const projectCode = projectRows.length > 0 ? projectRows[0].code : 'ITEM'
      
      // Sugerimos el formato inicial
      nextCode = `${projectCode}-001`
    }

    return NextResponse.json({ nextCode })
  } catch (err) {
    return handleApiError(err)
  }
}