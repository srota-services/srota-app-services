import {
   AuthRole,
   isContentCreatorRole,
   isContentManagerRole,
   isGlobalAdminRole,
   isGlobalAuthorRole,
   isOrgAdminRole,
   isOrgCoordinatorRole,
   isSubscriptionGatingEnforcedRole,
   normalizeAuthRole,
} from '../../constants/authRoles';

describe('authRoles', () => {
   describe('normalizeAuthRole', () => {
      test('normalizes role case-insensitively', () => {
         expect(normalizeAuthRole('GLOBAL_ADMIN')).toBe('global_admin');
         expect(normalizeAuthRole(' global_admin ')).toBe('global_admin');
         expect(normalizeAuthRole(undefined)).toBe('');
      });
   });

   describe('isGlobalAdminRole', () => {
      test('returns true for GLOBAL_ADMIN and global_admin', () => {
         expect(isGlobalAdminRole(AuthRole.GLOBAL_ADMIN)).toBe(true);
         expect(isGlobalAdminRole('global_admin')).toBe(true);
      });

      test('returns false for LISTENER and AUTHOR', () => {
         expect(isGlobalAdminRole(AuthRole.LISTENER)).toBe(false);
         expect(isGlobalAdminRole(AuthRole.AUTHOR)).toBe(false);
      });
   });

   describe('isGlobalAuthorRole', () => {
      test('returns true for AUTHOR and author', () => {
         expect(isGlobalAuthorRole(AuthRole.AUTHOR)).toBe(true);
         expect(isGlobalAuthorRole('author')).toBe(true);
      });

      test('returns false for LISTENER and GLOBAL_ADMIN', () => {
         expect(isGlobalAuthorRole(AuthRole.LISTENER)).toBe(false);
         expect(isGlobalAuthorRole(AuthRole.GLOBAL_ADMIN)).toBe(false);
      });
   });

   describe('isContentCreatorRole', () => {
      test('returns true for ORG_ADMIN, ORG_COORDINATOR, and AUTHOR', () => {
         expect(isContentCreatorRole(AuthRole.ORG_ADMIN)).toBe(true);
         expect(isContentCreatorRole(AuthRole.ORG_COORDINATOR)).toBe(true);
         expect(isContentCreatorRole(AuthRole.AUTHOR)).toBe(true);
      });

      test('returns false for LISTENER and GLOBAL_ADMIN', () => {
         expect(isContentCreatorRole(AuthRole.LISTENER)).toBe(false);
         expect(isContentCreatorRole(AuthRole.GLOBAL_ADMIN)).toBe(false);
      });
   });

   describe('isContentManagerRole', () => {
      test('returns true for GLOBAL_ADMIN, org staff, and AUTHOR', () => {
         expect(isContentManagerRole(AuthRole.GLOBAL_ADMIN)).toBe(true);
         expect(isContentManagerRole(AuthRole.ORG_ADMIN)).toBe(true);
         expect(isContentManagerRole(AuthRole.ORG_COORDINATOR)).toBe(true);
         expect(isContentManagerRole(AuthRole.AUTHOR)).toBe(true);
      });

      test('returns false for LISTENER', () => {
         expect(isContentManagerRole(AuthRole.LISTENER)).toBe(false);
      });
   });

   describe('org staff role helpers', () => {
      test('isOrgAdminRole matches ORG_ADMIN only', () => {
         expect(isOrgAdminRole(AuthRole.ORG_ADMIN)).toBe(true);
         expect(isOrgAdminRole(AuthRole.GLOBAL_ADMIN)).toBe(false);
      });

      test('isOrgCoordinatorRole matches ORG_COORDINATOR only', () => {
         expect(isOrgCoordinatorRole(AuthRole.ORG_COORDINATOR)).toBe(true);
         expect(isOrgCoordinatorRole(AuthRole.ORG_ADMIN)).toBe(false);
      });
   });

   describe('isSubscriptionGatingEnforcedRole', () => {
      test('returns true for LISTENER and GUEST only', () => {
         expect(isSubscriptionGatingEnforcedRole(AuthRole.LISTENER)).toBe(true);
         expect(isSubscriptionGatingEnforcedRole(AuthRole.GUEST)).toBe(true);
         expect(isSubscriptionGatingEnforcedRole(AuthRole.AUTHOR)).toBe(false);
         expect(isSubscriptionGatingEnforcedRole(AuthRole.GLOBAL_ADMIN)).toBe(false);
      });
   });
});
