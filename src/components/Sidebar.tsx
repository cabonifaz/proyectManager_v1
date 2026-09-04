'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import type { Role } from '@/lib/rbac'

const NAV = [
  { label: 'Proyectos',  href: 'projects',  roles: ['super_admin','gestor_proyecto','lider_tecnico','desarrollador'], icon: 'folder' },
  { label: 'Backlog',    href: 'backlog',   roles: ['super_admin','gestor_proyecto','lider_tecnico','desarrollador'], icon: 'list' },
  { label: 'Sprint',     href: 'sprint',    roles: ['super_admin','gestor_proyecto','lider_tecnico','desarrollador'], icon: 'zap' },
  { label: 'Observaciones', href: 'observaciones', roles: ['super_admin','gestor_proyecto','lider_tecnico','desarrollador'], icon: 'alert' },
  { label: 'Dashboard',  href: 'dashboard', roles: ['super_admin','gestor_proyecto','lider_tecnico'], icon: 'chart' },
  { label: 'Usuarios',   href: 'users',     roles: ['super_admin','gestor_proyecto'], icon: 'users' },
]

const ICONS: Record<string, React.ReactNode> = {
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />,
  list: <><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></>,
  zap: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
  alert: <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>,
  chart: <><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></>,
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
}

function Icon({ name }: { name: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      {ICONS[name]}
    </svg>
  )
}

const COLLAPSE_KEY = 'pm_sidebar_collapsed'

export function Sidebar({ tenant, tenantName, role, userName }: { tenant: string; tenantName: string; role: Role; userName: string }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(COLLAPSE_KEY) === '1') setCollapsed(true)
  }, [])

  function toggleCollapsed() {
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
      return next
    })
  }

  return (
    <aside className={`${collapsed ? 'w-16' : 'w-56'} bg-gray-900 text-gray-100 flex flex-col shrink-0 transition-all duration-150`}>
      <div className="px-4 py-5 border-b border-gray-700 flex items-center justify-between gap-2">
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Project Manager</p>
            <p className="font-semibold truncate mt-1">{tenantName}</p>
          </div>
        )}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          className="text-gray-400 hover:text-white shrink-0 p-1"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points={collapsed ? '9 18 15 12 9 6' : '15 18 9 12 15 6'} />
          </svg>
        </button>
      </div>

      <nav className="flex-1 px-2 py-4 space-y-1">
        {NAV.filter(n => n.roles.includes(role)).map(n => {
          const href = `/${tenant}/${n.href}`
          const active = pathname.startsWith(href)
          return (
            <Link
              key={n.href}
              href={href}
              title={n.label}
              className={`flex items-center gap-3 px-3 py-2 rounded text-sm font-medium transition-colors ${
                active ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'
              } ${collapsed ? 'justify-center' : ''}`}
            >
              <Icon name={n.icon} />
              {!collapsed && <span className="truncate">{n.label}</span>}
            </Link>
          )
        })}
      </nav>

      <div className="px-4 py-4 border-t border-gray-700">
        {!collapsed && (
          <>
            <p className="text-xs text-gray-400 truncate mb-2">{userName}</p>
            <p className="text-xs text-gray-500 mb-3 capitalize">{role.replace('_', ' ')}</p>
          </>
        )}
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          title="Cerrar sesión"
          className={`text-xs text-gray-400 hover:text-white py-1 transition-colors flex items-center gap-2 ${collapsed ? 'justify-center w-full' : 'text-left'}`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          {!collapsed && <span>Cerrar sesión</span>}
        </button>
      </div>
    </aside>
  )
}
