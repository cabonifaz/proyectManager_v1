import mysql, { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'

let pool: Pool | null = null

export function getPool(): Pool {
  if (!pool) {
    pool = mysql.createPool({
      host:               process.env.DB_HOST,
      port:               Number(process.env.DB_PORT ?? 3306),
      database:           process.env.DB_NAME,
      user:               process.env.DB_USER,
      password:           process.env.DB_PASSWORD,
      waitForConnections: true,
      connectionLimit:    20,
      queueLimit:         0,
      timezone:           'Z',
      charset:            'utf8mb4',
    })
  }
  return pool
}

export async function query<T extends RowDataPacket>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const [rows] = await getPool().execute<T[]>(sql, params as any)
  return rows
}

export async function execute(sql: string, params?: unknown[]): Promise<ResultSetHeader> {
  const [result] = await getPool().execute<ResultSetHeader>(sql, params as any)
  return result
}

export async function callProcedure<T extends RowDataPacket = RowDataPacket>(
  sql: string,
  params?: unknown[],
): Promise<T[][]> {
  const conn: PoolConnection = await getPool().getConnection()
  try {
    // Reemplazar null en params por 'NULL' literal en el SQL
    // para evitar el bug de mysql2 con parámetros null en CALL
    let finalSql = sql
    const finalParams: unknown[] = []

    if (params && params.length > 0) {
      let paramIndex = 0
      finalSql = sql.replace(/\?/g, () => {
        const val = params[paramIndex++]
        if (val === null || val === undefined) return 'NULL'
        finalParams.push(val)
        return '?'
      })
    }

    const [results] = await conn.query(finalSql, finalParams as any)
    if (Array.isArray(results) && Array.isArray(results[0])) return results as T[][]
    return [results as T[]]
  } finally {
    conn.release()
  }
}

export async function callProcedureOut(
  procedureName: string,
  inParams: Record<string, unknown>,
  outParams: string[],
): Promise<Record<string, unknown>> {
  const conn: PoolConnection = await getPool().getConnection()
  try {
    const values: unknown[] = []
    const placeholders = [
      ...Object.keys(inParams).map((_, i) => {
        const val = Object.values(inParams)[i]
        if (val === null || val === undefined) return 'NULL'
        values.push(val)
        return '?'
      }),
      ...outParams.map((p) => `@${p}`),
    ].join(', ')

    await conn.execute(`CALL ${procedureName}(${placeholders})`, values as any)

    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT ${outParams.map((p) => `@${p} AS \`${p}\``).join(', ')}`,
    )
    return rows[0] ?? {}
  } finally {
    conn.release()
  }
}

export async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await getPool().getConnection()
  await conn.beginTransaction()
  try {
    const result = await fn(conn)
    await conn.commit()
    return result
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}