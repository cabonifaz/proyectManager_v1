import NextAuth, { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { query } from '@/lib/db'
import { Role } from '@/lib/rbac'
import { RowDataPacket } from 'mysql2/promise'
import { encryptSlug } from '@/lib/tenant-crypto'

export interface AppUser {
  id: number
  tenantId: number
  tenantSlug: string
  encryptedSlug: string
  name: string
  email: string
  role: Role
  avatarUrl: string | null
}

declare module 'next-auth' {
  interface Session { user: AppUser }
  interface User extends AppUser {}
}

declare module 'next-auth/jwt' {
  interface JWT { user: AppUser }
}

interface UserRow extends RowDataPacket {
  id: number
  tenant_id: number
  tenant_slug: string
  name: string
  email: string
  password_hash: string
  role: Role
  avatar_url: string | null
  active: number
}

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },

  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email:    { label: 'Email',    type: 'email' },
        password: { label: 'Password', type: 'password' },
        slug:     { label: 'Empresa',  type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password || !credentials?.slug) {
          throw new Error('Credenciales incompletas')
        }

        const [user] = await query<UserRow>(
          `SELECT u.id, u.tenant_id, t.slug AS tenant_slug,
                  u.name, u.email, u.password_hash, u.role, u.avatar_url, u.active
           FROM users u
           INNER JOIN tenants t ON t.id = u.tenant_id
           WHERE u.email      = ?
             AND t.slug       = ?
             AND u.deleted_at IS NULL
             AND t.deleted_at IS NULL
             AND t.active     = 1
           LIMIT 1`,
          [credentials.email.toLowerCase(), credentials.slug],
        )

        if (!user)       throw new Error('Usuario o empresa no encontrados')
        if (!user.active) throw new Error('Usuario inactivo')

        const valid = await bcrypt.compare(credentials.password, user.password_hash)
        if (!valid) throw new Error('Contraseña incorrecta')

        query(
          `UPDATE users SET last_login = CURRENT_TIMESTAMP, updated_by = id WHERE id = ?`,
          [user.id],
        ).catch(() => {})

        return {
          id:            String(user.id),
          tenantId:      user.tenant_id,
          tenantSlug:    user.tenant_slug,
          encryptedSlug: encryptSlug(user.tenant_slug),
          name:          user.name,
          email:         user.email,
          role:          user.role,
          avatarUrl:     user.avatar_url,
        }
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) token.user = user as unknown as AppUser
      return token
    },
    async session({ session, token }) {
      session.user = token.user
      return session
    },
  },

  pages: {
    signIn: '/login',
    error:  '/login',
  },

  secret: process.env.NEXTAUTH_SECRET,
}

export default NextAuth(authOptions)