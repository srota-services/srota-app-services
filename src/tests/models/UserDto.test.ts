/**
 * UserDto Tests
 */
import {
   UserProfileDto,
   UserSession,
   AuthenticatedRequest,
} from '../../models/UserDto';

describe('UserDto', () => {
   const createMockUserProfileDto = (overrides = {}): UserProfileDto => ({
      userId: 'user-id',
      username: 'testuser',
      avatar: 'https://example.com/avatar.jpg',
      imageAssets: { square_120: 'https://example.com/avatar.jpg' },
      ...overrides,
   });

   const createMockUserSession = (overrides = {}): UserSession => ({
      userId: 'user-id',
      username: 'testuser',
      sessionId: 'session-id',
      createdAt: new Date('2024-01-01'),
      lastAccessed: new Date('2024-01-02'),
      ...overrides,
   });

   describe('UserProfileDto', () => {
      it('should represent auth-service public profile fields', () => {
         const profile = createMockUserProfileDto();

         expect(profile.userId).toBe('user-id');
         expect(profile.username).toBe('testuser');
         expect(profile.avatar).toBe('https://example.com/avatar.jpg');
      });
   });

   describe('UserSession', () => {
      it('should create valid UserSession', () => {
         const session = createMockUserSession();

         expect(session.userId).toBe('user-id');
         expect(session.username).toBe('testuser');
         expect(session.sessionId).toBe('session-id');
      });
   });

   describe('AuthenticatedRequest', () => {
      it('should accept user and session context', () => {
         const request: AuthenticatedRequest = {
            user: {
               id: 'user-id',
               role: 'LISTENER',
            },
            session: createMockUserSession(),
         };

         expect(request.user?.id).toBe('user-id');
         expect(request.session?.sessionId).toBe('session-id');
      });
   });
});
