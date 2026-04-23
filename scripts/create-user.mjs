import bcrypt from 'bcryptjs'
import mysql from 'mysql2/promise'

const conn = await mysql.createConnection({
  host:     '84.46.245.240',
  port:     6432,
  database: 'project_manager',
  user:     'user_project_manager_prod',
  password: 'WC39ka10@',
})

const hash = await bcrypt.hash('Admin123!', 12)

await conn.execute(
  `UPDATE users SET password_hash = ? WHERE email = 'admin@sistema.com'`,
  [hash]
)

console.log('Password actualizado OK')
await conn.end()