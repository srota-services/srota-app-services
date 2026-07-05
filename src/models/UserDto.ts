/**
 * User DTO (Data Transfer Object) classes
 * Provides type-safe data structures for API communication
 */

/** Auth-service public user profile stub for API responses */
export interface UserProfileDto {
   userId: string;
   username: string;
   avatar?: string;
   imageAssets?: Record<string, string>;
}

/**
 * User session interface
 */
export interface UserSession {
   userId: string;
   username: string;
   sessionId: string;
   createdAt: Date;
   lastAccessed: Date;
}

/**
 * Request interface with user context
 */
export interface AuthenticatedRequest {
   user?: {
      id: string;
      email?: string;
      role: string;
   };
   session?: UserSession;
}
