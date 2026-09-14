import { NextRequest, NextResponse } from 'next/server';
import { guardRoute, handleApiError } from '@/lib/session'
import { query } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: { tenant: string } }) {
  try {
    const { errorResponse } = await guardRoute(req, 'sprint:read')
    if (errorResponse) return errorResponse

    const { searchParams } = req.nextUrl;
    const projectId = searchParams.get('projectId');
    const sprintNum = searchParams.get('sprintNum');

    if (!projectId || !sprintNum) {
      return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 });
    }

    // 🚀 CORRECCIÓN: Quitamos 'project_manager.' para que respete el entorno actual (Staging o Prod)
    const rows: any = await query('CALL sp_sprint_obs_load(?, ?)', [
      Number(projectId),
      Number(sprintNum)
    ]);

    return NextResponse.json({ data: rows[0] });
  } catch (err) {
    return handleApiError(err)
  }
}
