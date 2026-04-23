'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import type { Role } from '@/lib/rbac'

const NAV = [
  { label: 'Proyectos',  href: 'projects',  roles: ['super_admin','gestor_proyecto','lider_tecnico','desarrollador'] },
  { label: 'Backlog',    href: 'backlog',   roles: ['super_admin','gestor_proyecto','lider_tecnico','desarrollador'] },
  { label: 'Sprint',     href: 'sprint',    roles: ['super_admin','gestor_proyecto','lider_tecnico','desarrollador'] },
  { label: 'Dashboard',  href: 'dashboard', roles: ['super_admin','gestor_proyecto','lider_tecnico'] },
  { label: 'Usuarios',   href: 'users',     roles: ['super_admin','gestor_proyecto'] },
]

export function Sidebar({ tenant, role, userName }: { tenant: string; role: Role; userName: string }) {
  const pathname = usePathname()

  return (
    <aside className="w-56 bg-gray-900 text-gray-100 flex flex-col">
      <div className="px-4 py-5 border-b border-gray-700">
        <p className="text-xs text-gray-400 uppercase tracking-wider">Project Manager</p>
        <p className="font-semibold truncate mt-1">{tenant}</p>
      </div>

      <nav className="flex-1 px-2 py-4 space-y-1">
        {NAV.filter(n => n.roles.includes(role)).map(n => {
          const href = `/${tenant}/${n.href}`
          const active = pathname.startsWith(href)
          return (
            <Link
              key={n.href}
              href={href}
              className={`block px-3 py-2 rounded text-sm font-medium transition-colors ${
                active ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
              }`}
            >
              {n.label}
            </Link>
          )
        })}
      </nav>

      <div className="px-4 py-4 border-t border-gray-700">
        <p className="text-xs text-gray-400 truncate mb-2">{userName}</p>
        <p className="text-xs text-gray-500 mb-3 capitalize">{role.replace('_', ' ')}</p>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full text-xs text-gray-400 hover:text-white py-1 text-left transition-colors"
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}