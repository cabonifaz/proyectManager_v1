import mysql, { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'

// 1. Evitar que el Hot Reload de Next.js cree múltiples pools de conexiones
const globalForDb = globalThis as unknown as {
  mysqlPool: Pool | undefined;
}

let pool: Pool | null = globalForDb.mysqlPool ?? null;

function createPool(): Pool {
  return mysql.createPool({
    host:                  process.env.DB_HOST,
    port:                  Number(process.env.DB_PORT ?? 3306),
    database:              process.env.DB_NAME,
    user:                  process.env.DB_USER,
    password:              process.env.DB_PASSWORD,
    waitForConnections:    true,
    connectionLimit:       10,
    queueLimit:            0,
    timezone:              'Z',
    charset:               'utf8mb4',
    connectTimeout:        15000,
    enableKeepAlive:       true,
    keepAliveInitialDelay: 30000,
  })
}

function getPool(): Pool {
  if (!pool) {
    pool = createPool()
    // Guardamos la instancia globalmente solo en desarrollo
    if (process.env.NODE_ENV !== 'production') {
      globalForDb.mysqlPool = pool
    }
  }
  return pool
}

function isRetryable(err: unknown): boolean {
  const code = (err as any)?.code
  return code === 'ECONNRESET' || code === 'PROTOCOL_CONNECTION_LOST' || code === 'ENOTFOUND'
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (isRetryable(err)) {
      pool = null
      // Limpiamos también el pool global para forzar la reconexión limpia
      if (process.env.NODE_ENV !== 'production') {
        globalForDb.mysqlPool = undefined
      }
      return fn()
    }
    throw err
  }
}

export async function query<T extends RowDataPacket>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  return withRetry(async () => {
    const [rows] = await getPool().execute<T[]>(sql, params as any)
    return rows
  })
}

export async function execute(sql: string, params?: unknown[]): Promise<ResultSetHeader> {
  return withRetry(async () => {
    const [result] = await getPool().execute<ResultSetHeader>(sql, params as any)
    return result
  })
}

export async function callProcedure<T extends RowDataPacket = RowDataPacket>(
  sql: string,
  params?: unknown[],
): Promise<T[][]> {
  return withRetry(async () => {
    const conn: PoolConnection = await getPool().getConnection()
    try {
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
  })
}

export async function callProcedureOut(
  procedureName: string,
  inParams: Record<string, unknown>,
  outParams: string[],
): Promise<Record<string, unknown>> {
  return withRetry(async () => {
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
  })
}

export async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  return withRetry(async () => {
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
  })
}