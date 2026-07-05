export const AuthRole = {
   LISTENER: 'LISTENER',
   GLOBAL_ADMIN: 'GLOBAL_ADMIN',
   ORG_ADMIN: 'ORG_ADMIN',
   ORG_COORDINATOR: 'ORG_COORDINATOR',
   AUTHOR: 'AUTHOR',
   GUEST: 'GUEST',
} as const;

export type AuthRoleValue = (typeof AuthRole)[keyof typeof AuthRole];

export const AuthRoleGroups = {
   GLOBAL_ADMIN_ONLY: [AuthRole.GLOBAL_ADMIN],
   GLOBAL_ADMIN_OR_AUTHOR: [AuthRole.GLOBAL_ADMIN, AuthRole.AUTHOR],
   ORG_STAFF: [AuthRole.ORG_ADMIN, AuthRole.ORG_COORDINATOR],
   CONTENT_CREATOR: [AuthRole.ORG_ADMIN, AuthRole.ORG_COORDINATOR, AuthRole.AUTHOR],
   CONTENT_MANAGER: [
      AuthRole.GLOBAL_ADMIN,
      AuthRole.ORG_ADMIN,
      AuthRole.ORG_COORDINATOR,
      AuthRole.AUTHOR,
   ],
   ALL_REGISTERED: [
      AuthRole.LISTENER,
      AuthRole.GLOBAL_ADMIN,
      AuthRole.ORG_ADMIN,
      AuthRole.ORG_COORDINATOR,
      AuthRole.AUTHOR,
   ],
   ALL_AUTHENTICATED: [
      AuthRole.GUEST,
      AuthRole.LISTENER,
      AuthRole.GLOBAL_ADMIN,
      AuthRole.ORG_ADMIN,
      AuthRole.ORG_COORDINATOR,
      AuthRole.AUTHOR,
   ],
} as const;

export function normalizeAuthRole(role: string | undefined): string {
   return (role ?? '').trim().toLowerCase();
}

export function isGlobalAdminRole(role: string | undefined): boolean {
   return normalizeAuthRole(role) === normalizeAuthRole(AuthRole.GLOBAL_ADMIN);
}

export function isOrgAdminRole(role: string | undefined): boolean {
   return normalizeAuthRole(role) === normalizeAuthRole(AuthRole.ORG_ADMIN);
}

export function isOrgCoordinatorRole(role: string | undefined): boolean {
   return normalizeAuthRole(role) === normalizeAuthRole(AuthRole.ORG_COORDINATOR);
}

export function isGlobalAuthorRole(role: string | undefined): boolean {
   return normalizeAuthRole(role) === normalizeAuthRole(AuthRole.AUTHOR);
}

export function isContentCreatorRole(role: string | undefined): boolean {
   const normalized = normalizeAuthRole(role);
   return AuthRoleGroups.CONTENT_CREATOR.some(
      (allowed) => normalizeAuthRole(allowed) === normalized,
   );
}

export function isContentManagerRole(role: string | undefined): boolean {
   const normalized = normalizeAuthRole(role);
   return AuthRoleGroups.CONTENT_MANAGER.some(
      (allowed) => normalizeAuthRole(allowed) === normalized,
   );
}

export function isGuestRole(role: string | undefined): boolean {
   return normalizeAuthRole(role) === normalizeAuthRole(AuthRole.GUEST);
}

export function isRegisteredUserRole(role: string | undefined): boolean {
   const normalized = normalizeAuthRole(role);
   return AuthRoleGroups.ALL_REGISTERED.some(
      (allowed) => normalizeAuthRole(allowed) === normalized,
   );
}

/** Active subscription tier checks apply to LISTENER and GUEST only. */
export function isSubscriptionGatingEnforcedRole(role: string | undefined): boolean {
   const normalized = normalizeAuthRole(role);
   return (
      normalized === normalizeAuthRole(AuthRole.LISTENER) ||
      normalized === normalizeAuthRole(AuthRole.GUEST)
   );
}
