import { NextResponse } from 'next/server';
import { query } from '@/lib/db'; 

export async function GET(req: Request, { params }: { params: { tenant: string } }) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const sprintNum = searchParams.get('sprintNum');

    if (!projectId || !sprintNum) {
      return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 });
    }

    // 🚀 Llamamos al SP solo con Project ID y Sprint Num (sin el tenant)
    const rows: any = await query('CALL project_manager.sp_sprint_obs_load(?, ?)', [
      Number(projectId),
      Number(sprintNum)
    ]);

    // console.log("Carga de devs obtenida:", rows[0]); // Descomenta esto si quieres ver la data en tu consola

    return NextResponse.json({ data: rows[0] });
  } catch (error) {
    console.error("Error en sprint_obs_load:", error);
    return NextResponse.json({ error: 'Error al obtener carga de observaciones' }, { status: 500 });
  }
}