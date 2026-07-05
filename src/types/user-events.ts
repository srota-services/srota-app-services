/**
 * Type definitions for user events and messages
 * Defines interfaces for RabbitMQ user creation events
 */

/**
 * User creation message structure from external service
 */
export interface UserCreationMessage {
   userId: string;
   avatar?: string;
}

export interface UserDeletionMessage {
   userId: string;
   authorId?: string;
}

/**
 * Username generation options
 */
export interface UsernameGenerationOptions {
   wordCount?: number; // Number of words in username (default: 2)
   numberCount?: number; // Number of digits (default: 4)
   maxRetries?: number; // Maximum retries for uniqueness (default: 10)
}

/**
 * Username generation result
 */
export interface UsernameGenerationResult {
   username: string;
   attempts: number;
}

/**
 * User profile creation result
 */
export interface UserProfileCreationResult {
   success: boolean;
   user?: {
      id: string;
      userId: string;
      username: string;
   };
   error?: string;
}
