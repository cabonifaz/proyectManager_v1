export type Role = 'super_admin' | 'gestor_proyecto' | 'lider_tecnico' | 'desarrollador'

export type Permission =
  | 'tenant:create' | 'tenant:read' | 'tenant:update' | 'tenant:delete'
  | 'user:create' | 'user:read' | 'user:update' | 'user:delete'
  | 'project:create' | 'project:read' | 'project:update' | 'project:delete'
  | 'project:manage_members' | 'project:manage_columns'
  | 'backlog:create' | 'backlog:read' | 'backlog:update' | 'backlog:delete'
  | 'backlog:update_tech'
  | 'sprint:create' | 'sprint:read' | 'sprint:update' | 'sprint:delete'
  | 'sprint:manage' | 'sprint:assign_talent'
  | 'sprint_item:create' | 'sprint_item:read' | 'sprint_item:update' | 'sprint_item:delete'
  | 'sprint_item:update_own'
  | 'dashboard:read' | 'dashboard:export'

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  super_admin: [
    'tenant:create', 'tenant:read', 'tenant:update', 'tenant:delete',
    'user:create', 'user:read', 'user:update', 'user:delete',
    'project:create', 'project:read', 'project:update', 'project:delete',
    'project:manage_members', 'project:manage_columns',
    'backlog:create', 'backlog:read', 'backlog:update', 'backlog:delete',
    'backlog:update_tech',
    'sprint:create', 'sprint:read', 'sprint:update', 'sprint:delete',
    'sprint:manage', 'sprint:assign_talent',
    'sprint_item:create', 'sprint_item:read', 'sprint_item:update', 'sprint_item:delete',
    'sprint_item:update_own',
    'dashboard:read', 'dashboard:export',
  ],
  gestor_proyecto: [
    'user:read',
    'project:create', 'project:read', 'project:update',
    'project:manage_members', 'project:manage_columns',
    'backlog:create', 'backlog:read', 'backlog:update', 'backlog:delete',
    'backlog:update_tech',
    'sprint:create', 'sprint:read', 'sprint:update',
    'sprint:manage', 'sprint:assign_talent',
    'sprint_item:create', 'sprint_item:read', 'sprint_item:update', 'sprint_item:delete',
    'dashboard:read', 'dashboard:export',
  ],
  lider_tecnico: [
    'user:read',
    'project:read',
    'backlog:read', 'backlog:update', 'backlog:update_tech',
    'sprint:read', 'sprint:update',
    'sprint:assign_talent',
    'sprint_item:create', 'sprint_item:read', 'sprint_item:update',
    'sprint_item:update_own',
    'dashboard:read',
  ],
  desarrollador: [
    'project:read',
    'backlog:read',
    'sprint:read',
    'sprint_item:read',
    'sprint_item:update_own',
    'dashboard:read',
  ],
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}

export function getPermissions(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] ?? []
}

export function requirePermission(role: Role, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new ForbiddenError(`Role '${role}' does not have permission '${permission}'`)
  }
}

export function canEditOwnOnly(role: Role): boolean {
  return role === 'desarrollador'
}

export class ForbiddenError extends Error {
  readonly statusCode = 403
  constructor(message = 'Forbidden') {
    super(message)
    this.name = 'ForbiddenError'
  }
}