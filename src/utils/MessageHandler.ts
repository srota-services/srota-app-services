/**
 * Message utility for loading and formatting response messages
 * Provides centralized message management with template support
 */
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

interface MessagesConfig {
   success: {
      audiobooks: {
         retrieved: string;
         retrieved_by_id: string;
         created: string;
         updated: string;
         deleted: string;
         search_results: string;
         stats_retrieved: string;
         by_genre: string;
         by_author: string;
      };
      playback: {
         session_initialized: string;
         sync_executed: string;
         stats_retrieved: string;
         cleanup_completed: string;
      };
      general: {
         success: string;
         health_check: string;
         no_content: string;
      };
   };
   errors: {
      validation: {
         page_positive: string;
         limit_range: string;
         sort_field: string;
         sort_order: string;
         is_active_boolean: string;
         is_public_boolean: string;
         string_length: string;
         id_required: string;
         id_format: string;
         search_required: string;
         title_required: string;
         author_required: string;
         genre_required: string;
         duration_positive: string;
         file_size_positive: string;
         file_path_required: string;
         isbn_format: string;
         chapter_id_required: string;
         bitrate_required: string;
         segment_id_required: string;
      };
      not_found: {
         audiobook: string;
         resource: string;
         route: string;
      };
      conflict: {
         audiobook_exists: string;
         resource_exists: string;
      };
      unauthorized: {
         default: string;
         access_denied: string;
      };
      forbidden: {
         default: string;
         insufficient_permissions: string;
         subscription_required?: string;
         subscription_tier_too_low?: string;
         subscription_tier_too_low_chapter?: string;
      };
      internal: {
         default: string;
         database_operation: string;
         fetch_audiobooks: string;
         fetch_audiobook: string;
         create_audiobook: string;
         update_audiobook: string;
         delete_audiobook: string;
         fetch_stats: string;
         streaming_service_unavailable: string;
      };
   };
   api: {
      info: {
         title: string;
         version: string;
         status_running: string;
         endpoints: {
            health: string;
            audiobooks: string;
            docs: string;
         };
      };
   };
   validation: {
      pagination: {
         max_limit: number;
         default_limit: number;
         default_page: number;
      };
      sort_fields: {
         allowed: string[];
      };
      string_fields: {
         max_length: number;
      };
      isbn: {
         formats: string[];
      };
   };
}

export class MessageHandler {
   private static messages: MessagesConfig | null = null;

   /**
    * Load messages from YAML file
    */
   private static loadMessages(): MessagesConfig {
      if (!this.messages) {
         try {
            const messagesPath = path.join(__dirname, '..', 'config', 'messages.yaml');
            const fileContents = fs.readFileSync(messagesPath, 'utf8');
            this.messages = yaml.load(fileContents) as MessagesConfig;
         } catch (error) {
            console.error('Failed to load messages.yaml:', error);
            // Fallback to default messages
            this.messages = this.getDefaultMessages();
         }
      }
      return this.messages;
   }

   /**
    * Get default messages as fallback
    */
   private static getDefaultMessages(): MessagesConfig {
      return {
         success: {
            audiobooks: {
               retrieved: 'AudioBooks retrieved successfully',
               retrieved_by_id: 'AudioBook retrieved successfully',
               created: 'AudioBook created successfully',
               updated: 'AudioBook updated successfully',
               deleted: 'AudioBook deleted successfully',
               search_results: 'Search results retrieved successfully',
               stats_retrieved: 'AudioBook statistics retrieved successfully',
               by_genre: 'AudioBooks in genre "{genre}" retrieved successfully',
               by_author: 'AudioBooks by "{author}" retrieved successfully'
            },
            playback: {
               session_initialized: 'Playback session initialized successfully',
               sync_executed: 'Playback sync executed successfully',
               stats_retrieved: 'Playback statistics retrieved successfully',
               cleanup_completed: 'Playback session cleanup completed successfully'
            },
            general: {
               success: 'Success',
               health_check: 'Service is healthy',
               no_content: 'Operation completed successfully'
            }
         },
         errors: {
            validation: {
               page_positive: 'Page must be a positive integer',
               limit_range: 'Limit must be between 1 and 100',
               sort_field: 'Sort field must be one of: {fields}',
               sort_order: 'Sort order must be either "asc" or "desc"',
               is_active_boolean: 'isActive must be either "true" or "false"',
               is_public_boolean: 'isPublic must be either "true" or "false"',
               string_length: '{field} must be less than 100 characters',
               id_required: 'ID parameter is required',
               id_format: 'Invalid ID format',
               search_required: 'Search query is required',
               title_required: 'Title is required',
               author_required: 'Author is required',
               genre_required: 'Genre is required',
               duration_positive: 'Duration must be a positive number',
               file_size_positive: 'File size must be a positive number',
               file_path_required: 'File path is required',
               isbn_format: 'Invalid ISBN format',
               chapter_id_required: 'Chapter ID is required',
               bitrate_required: 'Bitrate is required',
               segment_id_required: 'Segment ID is required'
            },
            not_found: {
               audiobook: 'AudioBook not found',
               resource: 'Resource not found',
               route: 'Route {route} not found'
            },
            conflict: {
               audiobook_exists: 'AudioBook with this ISBN already exists',
               resource_exists: 'Resource already exists'
            },
            unauthorized: {
               default: 'Unauthorized access',
               access_denied: 'Access denied'
            },
            forbidden: {
               default: 'You do not have access to this',
               insufficient_permissions: 'You do not have permission for this action',
               subscription_required: 'Subscribe to listen to this audiobook',
               subscription_tier_too_low:
                  'Your plan does not include this audiobook. Upgrade to listen',
               subscription_tier_too_low_chapter:
                  'Your plan does not include this chapter. Upgrade to listen',
            },
            internal: {
               default: 'Internal server error',
               database_operation: 'Database operation failed',
               fetch_audiobooks: 'Failed to fetch audiobooks',
               fetch_audiobook: 'Failed to fetch audiobook',
               create_audiobook: 'Failed to create audiobook',
               update_audiobook: 'Failed to update audiobook',
               delete_audiobook: 'Failed to delete audiobook',
               fetch_stats: 'Failed to fetch audiobook statistics',
               streaming_service_unavailable: 'Streaming service is currently unavailable'
            }
         },
         api: {
            info: {
               title: 'AudioBook API Server',
               version: '1.0.0',
               status_running: 'running',
               endpoints: {
                  health: '/api/app/health',
                  audiobooks: '/api/v1/audiobooks',
                  docs: '/api/docs'
               }
            }
         },
         validation: {
            pagination: {
               max_limit: 100,
               default_limit: 10,
               default_page: 1
            },
            sort_fields: {
               allowed: ['title', 'author', 'createdAt', 'updatedAt', 'duration']
            },
            string_fields: {
               max_length: 100
            },
            isbn: {
               formats: ['10-digit', '13-digit']
            }
         }
      };
   }

   /**
    * Format message with template variables
    */
   private static formatMessage(message: string, variables: Record<string, any> = {}): string {
      let formattedMessage = message;

      for (const [key, value] of Object.entries(variables)) {
         const placeholder = `{${key}}`;
         formattedMessage = formattedMessage.replace(new RegExp(placeholder, 'g'), String(value));
      }

      return formattedMessage;
   }

   /**
    * Get success message
    */
   static getSuccessMessage(key: string, variables: Record<string, any> = {}): string {
      const messages = this.loadMessages();
      const keys = key.split('.');
      let cursor: any = messages.success;

      for (const segment of keys) {
         if (cursor && Object.prototype.hasOwnProperty.call(cursor, segment)) {
            cursor = cursor[segment];
         } else {
            console.warn(`Success message not found for key: ${key}`);
            return 'Success';
         }
      }

      if (typeof cursor !== 'string') {
         console.warn(`Success message not a string for key: ${key}`);
         return 'Success';
      }

      return this.formatMessage(cursor, variables);
   }

   /**
    * Get error message
    */
   static getErrorMessage(key: string, variables: Record<string, any> = {}): string {
      const messages = this.loadMessages();
      const keys = key.split('.');
      let message: any = messages.errors;

      for (const k of keys) {
         if (message && Object.prototype.hasOwnProperty.call(message, k)) {
            message = message[k];
         } else {
            console.warn(`Error message not found for key: ${key}`);
            return 'An error occurred';
         }
      }

      if (typeof message !== 'string') {
         console.warn(`Error message not a string for key: ${key}`);
         return 'An error occurred';
      }

      return this.formatMessage(message, variables);
   }

   /**
    * Get API info
    */
   static getApiInfo(key: string): any {
      const messages = this.loadMessages();
      const keys = key.split('.');
      let info: any = messages.api;

      for (const k of keys) {
         if (info && Object.prototype.hasOwnProperty.call(info, k)) {
            info = info[k];
         } else {
            return undefined;
         }
      }

      return info;
   }

   /**
    * Get validation rules
    */
   static getValidationRule(key: string): any {
      const messages = this.loadMessages();
      const keys = key.split('.');
      let rule: any = messages.validation;

      for (const k of keys) {
         if (rule && Object.prototype.hasOwnProperty.call(rule, k)) {
            rule = rule[k];
         } else {
            return undefined;
         }
      }

      return rule;
   }

   /**
    * Reload messages (useful for development/testing)
    */
   static reloadMessages(): void {
      this.messages = null;
      this.loadMessages();
   }
}
