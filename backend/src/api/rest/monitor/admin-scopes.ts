export const AdminScope = {
  MonitorRead: 'monitor:read',
  MonitorWrite: 'monitor:write',
  ReplayRead: 'replay:read',
  ReplayWrite: 'replay:write',
} as const;

export type AdminScope = (typeof AdminScope)[keyof typeof AdminScope];

export const ALL_ADMIN_SCOPES: readonly AdminScope[] = [
  AdminScope.MonitorRead,
  AdminScope.MonitorWrite,
  AdminScope.ReplayRead,
  AdminScope.ReplayWrite,
];

export const READ_ONLY_MONITOR_SCOPES: readonly AdminScope[] = [
  AdminScope.MonitorRead,
];

export const REPLAY_ADMIN_SCOPES: readonly AdminScope[] = [
  AdminScope.ReplayRead,
  AdminScope.ReplayWrite,
];

export function hasAdminScopes(
  granted: readonly AdminScope[],
  required: readonly AdminScope[],
): boolean {
  return required.every((scope) => granted.includes(scope));
}
