/**
 * Swagger/OpenAPI Configuration
 * Code-first approach for API documentation
 */
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';
import { config } from './env';

const options: swaggerJsdoc.Options = {
   definition: {
      openapi: '3.0.0',
      info: {
         title: 'AudioBook API',
         version: '1.0.0',
         description: 'A comprehensive REST API for managing audiobooks with features like search, filtering, and statistics.',
         contact: {
            name: 'AudioBook API Support',
            email: 'support@audiobook-api.com'
         },
         license: {
            name: 'MIT',
            url: 'https://opensource.org/licenses/MIT'
         }
      },
      servers: [
         {
            url: `http://localhost:${config.PORT}`,
            description: 'Development server'
         },
         {
            url: 'https://api.audiobook.com',
            description: 'Production server'
         }
      ],
      components: {
         securitySchemes: {
            bearerAuth: {
               type: 'http',
               scheme: 'bearer',
               bearerFormat: 'JWT',
               description: 'JWT access token from auth-service (Authorization: Bearer <token>)'
            },
            sessionAuth: {
               type: 'apiKey',
               in: 'cookie',
               name: 'connect.sid',
               description: 'Legacy session cookie (prefer bearerAuth for v1 API)'
            },
            csrfToken: {
               type: 'apiKey',
               in: 'header',
               name: 'X-CSRF-Token',
               description: 'CSRF token for auth-service cookie flows'
            }
         },
         schemas: {
            ImageAssetsMap: {
               type: 'object',
               additionalProperties: { type: 'string' },
               description: 'Map of image variantKey to resolved URL',
               example: {
                  portrait_7_10: 'https://cdn.example.com/uploads/images/audiobook/ab1/portrait_7_10.jpg',
                  square_64: 'https://cdn.example.com/uploads/images/audiobook/ab1/square_64.jpg',
               },
            },
            AudioBookOwnerType: {
               type: 'string',
               enum: ['AUTHOR', 'ORGANIZATION'],
               description: 'Polymorphic owner kind (auth-service Author or Organization)',
            },
            SubscriptionGatingMode: {
               type: 'string',
               enum: ['NONE', 'AUDIOBOOK', 'CHAPTER'],
               description:
                  'NONE = no gating. AUDIOBOOK = whole-book tier on minSubscriptionTier. CHAPTER = per-chapter tier (uniform across all chapters); audiobook detail stays open.',
            },
            SubscriptionAccess: {
               type: 'object',
               required: ['canAccess'],
               properties: {
                  canAccess: { type: 'boolean' },
                  message: { type: 'string' },
                  requiredTier: { type: 'integer' },
                  userTier: { type: 'integer', nullable: true },
               },
            },
            AudioBookOwnerInput: {
               type: 'object',
               required: ['type', 'id'],
               properties: {
                  type: { $ref: '#/components/schemas/AudioBookOwnerType' },
                  id: {
                     type: 'string',
                     description: 'Auth-service Author or Organization id',
                     example: 'corg1234567890abcdefghij',
                  },
               },
               example: { type: 'ORGANIZATION', id: 'corg1234567890abcdefghij' },
            },
            AudioBookOwner: {
               type: 'object',
               required: ['type', 'id'],
               properties: {
                  type: { $ref: '#/components/schemas/AudioBookOwnerType' },
                  id: { type: 'string', example: 'corg1234567890abcdefghij' },
                  author: {
                     type: 'object',
                     nullable: true,
                     properties: {
                        id: { type: 'string' },
                        slug: { type: 'string' },
                        userId: { type: 'string' },
                        firstName: { type: 'string', nullable: true },
                        lastName: { type: 'string', nullable: true },
                        avatar: { type: 'string', nullable: true },
                        imageAssets: { $ref: '#/components/schemas/ImageAssetsMap' },
                     },
                  },
                  organization: {
                     type: 'object',
                     nullable: true,
                     properties: {
                        id: { type: 'string' },
                        name: { type: 'string' },
                        slug: { type: 'string' },
                        description: { type: 'string', nullable: true },
                        image: { type: 'string', nullable: true },
                        imageAssets: { $ref: '#/components/schemas/ImageAssetsMap' },
                        preferredGenre: { type: 'string', nullable: true },
                        websiteUrl: { type: 'string', nullable: true },
                        teamSize: { type: 'string', nullable: true },
                     },
                  },
               },
            },
            AudioBook: {
               type: 'object',
               required: ['id', 'title', 'author', 'language', 'isActive', 'isPublic', 'owner'],
               properties: {
                  id: {
                     type: 'string',
                     format: 'uuid',
                     description: 'Unique identifier for the audiobook',
                     example: '123e4567-e89b-12d3-a456-426614174000'
                  },
                  title: {
                     type: 'string',
                     description: 'Title of the audiobook',
                     example: 'The Great Gatsby'
                  },
                  author: {
                     type: 'string',
                     description: 'Author of the audiobook',
                     example: 'F. Scott Fitzgerald'
                  },
                  narrator: {
                     type: 'string',
                     description: 'Narrator of the audiobook',
                     example: 'Jake Gyllenhaal',
                     nullable: true
                  },
                  description: {
                     type: 'string',
                     description: 'Description of the audiobook',
                     example: 'A classic American novel set in the Jazz Age',
                     nullable: true
                  },
                  duration: {
                     type: 'number',
                     description: 'Duration in minutes',
                     example: 180,
                     minimum: 0
                  },
                  fileSize: {
                     type: 'number',
                     description: 'File size in bytes',
                     example: 52428800,
                     minimum: 0
                  },
                  filePath: {
                     type: 'string',
                     description: 'Path to the audio file',
                     example: '/uploads/audiobooks/great-gatsby.mp3'
                  },
                  coverImage: {
                     type: 'string',
                     description: 'Primary cover image URL (default portrait_7_10 variant)',
                     example: 'https://example.com/covers/great-gatsby.jpg',
                     nullable: true
                  },
                  imageAssets: { $ref: '#/components/schemas/ImageAssetsMap' },
                  genre: {
                     type: 'string',
                     description: 'Genre of the audiobook',
                     example: 'Fiction',
                     nullable: true
                  },
                  language: {
                     type: 'string',
                     description: 'Language of the audiobook',
                     example: 'English'
                  },
                  publisher: {
                     type: 'string',
                     description: 'Publisher of the audiobook',
                     example: 'Penguin Random House',
                     nullable: true
                  },
                  publishDate: {
                     type: 'string',
                     format: 'date',
                     description: 'Publication date',
                     example: '1925-04-10',
                     nullable: true
                  },
                  isbn: {
                     type: 'string',
                     description: 'ISBN number',
                     example: '978-0-7432-7356-5',
                     nullable: true
                  },
                  isActive: {
                     type: 'boolean',
                     description: 'Whether the audiobook is active',
                     example: true
                  },
                  isPublic: {
                     type: 'boolean',
                     description: 'Whether the audiobook is publicly available',
                     example: true
                  },
                  subscriptionGatingMode: {
                     $ref: '#/components/schemas/SubscriptionGatingMode',
                  },
                  minSubscriptionTier: {
                     type: 'integer',
                     nullable: true,
                     description:
                        'Required tier when subscriptionGatingMode is AUDIOBOOK. Must be null when mode is CHAPTER or NONE.',
                  },
                  subscriptionAccess: {
                     $ref: '#/components/schemas/SubscriptionAccess',
                  },
                  owner: {
                     $ref: '#/components/schemas/AudioBookOwner',
                  },
                  createdAt: {
                     type: 'string',
                     format: 'date-time',
                     description: 'Creation timestamp',
                     example: '2024-01-15T10:30:00Z'
                  },
                  updatedAt: {
                     type: 'string',
                     format: 'date-time',
                     description: 'Last update timestamp',
                     example: '2024-01-15T10:30:00Z'
                  },
                  chapterCount: {
                     type: 'integer',
                     description: 'Number of chapters in this audiobook',
                     example: 12,
                     minimum: 0,
                  }
               }
            },
            CreateAudioBookRequest: {
               type: 'object',
               required: ['title', 'author', 'owner', 'genreIds', 'coverImage'],
               properties: {
                  title: {
                     type: 'string',
                     description: 'Title of the audiobook',
                     example: 'The Great Gatsby'
                  },
                  author: {
                     type: 'string',
                     description: 'Display author name on the audiobook',
                     example: 'F. Scott Fitzgerald'
                  },
                  owner: {
                     $ref: '#/components/schemas/AudioBookOwnerInput',
                  },
                  narrator: {
                     type: 'string',
                     example: 'Jake Gyllenhaal'
                  },
                  description: {
                     type: 'string',
                     example: 'A classic American novel set in the Jazz Age'
                  },
                  genreIds: {
                     type: 'array',
                     items: { type: 'string' },
                     description: 'At least one genre ID (JSON array or comma-separated in form-data)',
                     example: ['cgenre1234567890abcdefgh']
                  },
                  coverImage: {
                     type: 'string',
                     format: 'binary',
                     description: 'Cover image file (required on create)'
                  },
                  language: {
                     type: 'string',
                     example: 'bn',
                     default: 'bn'
                  },
                  publisher: { type: 'string', example: 'Penguin Random House' },
                  publishDate: { type: 'string', format: 'date', example: '1925-04-10' },
                  isbn: { type: 'string', example: '978-0-7432-7356-5' },
                  isActive: { type: 'boolean', example: true, default: true },
                  isPublic: { type: 'boolean', example: true, default: true },
                  tagIds: {
                     type: 'array',
                     items: { type: 'string' },
                     description: 'Optional tag IDs (JSON array or comma-separated in form-data)',
                  },
                  minSubscriptionTier: {
                     type: 'integer',
                     nullable: true,
                     description:
                        'Minimum subscription tier. With subscriptionGatingMode AUDIOBOOK, gates the whole book. With CHAPTER, applied uniformly to all chapters (audiobook field stored as null).',
                     example: 2,
                  },
                  subscriptionGatingMode: {
                     $ref: '#/components/schemas/SubscriptionGatingMode',
                  },
                  scheduledAt: {
                     type: 'string',
                     format: 'date-time',
                     description: 'Optional future publish date; audiobook stays inactive until this time',
                  },
               },
            },
            CreateAudioBookFormData: {
               type: 'object',
               required: ['title', 'author', 'owner', 'genreIds', 'coverImage'],
               description: 'Multipart form-data variant. Stringify JSON fields (owner, genreIds, tagIds) when sending as form fields.',
               properties: {
                  title: { type: 'string', example: 'My Audiobook' },
                  author: { type: 'string', example: 'Jane Doe' },
                  owner: {
                     type: 'string',
                     description: 'JSON string {"type":"ORGANIZATION"|"AUTHOR","id":"..."}',
                     example: '{"type":"ORGANIZATION","id":"corg1234567890abcdefghij"}',
                  },
                  genreIds: {
                     type: 'string',
                     description: 'JSON array string or comma-separated genre IDs',
                     example: '["cgenre1234567890abcdefgh"]',
                  },
                  tagIds: {
                     type: 'string',
                     description: 'Optional. JSON array string or comma-separated tag IDs',
                     example: '["ctag1234567890abcdefghij"]',
                  },
                  coverImage: { type: 'string', format: 'binary', description: 'Cover image file (required on create)' },
                  narrator: { type: 'string', description: 'Optional narrator name' },
                  description: { type: 'string', description: 'Optional description' },
                  language: { type: 'string', example: 'bn', description: 'Optional language code (defaults to bn)' },
                  publisher: { type: 'string', description: 'Optional publisher' },
                  publishDate: { type: 'string', format: 'date', description: 'Optional publication date' },
                  isbn: { type: 'string', description: 'Optional ISBN' },
                  isActive: { type: 'boolean', description: 'Optional active flag (defaults to true)' },
                  isPublic: { type: 'boolean', description: 'Optional public flag (defaults to true)' },
                  minSubscriptionTier: { type: 'integer', description: 'Optional minimum subscription tier' },
                  scheduledAt: { type: 'string', format: 'date-time', description: 'Optional scheduled publish time' },
               },
            },
            UpdateAudioBookRequest: {
               type: 'object',
               properties: {
                  title: {
                     type: 'string',
                     description: 'Title of the audiobook',
                     example: 'The Great Gatsby'
                  },
                  author: {
                     type: 'string',
                     description: 'Author of the audiobook',
                     example: 'F. Scott Fitzgerald'
                  },
                  narrator: {
                     type: 'string',
                     description: 'Narrator of the audiobook',
                     example: 'Jake Gyllenhaal'
                  },
                  description: {
                     type: 'string',
                     description: 'Description of the audiobook',
                     example: 'A classic American novel set in the Jazz Age'
                  },
                  duration: {
                     type: 'number',
                     description: 'Duration in minutes',
                     example: 180,
                     minimum: 0
                  },
                  fileSize: {
                     type: 'number',
                     description: 'File size in bytes',
                     example: 52428800,
                     minimum: 0
                  },
                  filePath: {
                     type: 'string',
                     description: 'Path to the audio file',
                     example: '/uploads/audiobooks/great-gatsby.mp3'
                  },
                  coverImage: {
                     type: 'string',
                     description: 'URL to the cover image',
                     example: 'https://example.com/covers/great-gatsby.jpg'
                  },
                  genre: {
                     type: 'string',
                     description: 'Genre of the audiobook',
                     example: 'Fiction'
                  },
                  language: {
                     type: 'string',
                     description: 'Language of the audiobook',
                     example: 'English'
                  },
                  publisher: {
                     type: 'string',
                     description: 'Publisher of the audiobook',
                     example: 'Penguin Random House'
                  },
                  publishDate: {
                     type: 'string',
                     format: 'date',
                     description: 'Publication date',
                     example: '1925-04-10'
                  },
                  isbn: {
                     type: 'string',
                     description: 'ISBN number',
                     example: '978-0-7432-7356-5'
                  },
                  isActive: {
                     type: 'boolean',
                     description: 'Whether the audiobook is active',
                     example: true
                  },
                  isPublic: {
                     type: 'boolean',
                     description: 'Whether the audiobook is publicly available',
                     example: true
                  },
                  genreIds: {
                     type: 'array',
                     items: { type: 'string' },
                     description: 'Optional genre IDs to replace current genres',
                  },
                  tagIds: {
                     type: 'array',
                     items: { type: 'string' },
                     description: 'Optional tag IDs to replace current tags',
                  },
                  minSubscriptionTier: {
                     type: 'integer',
                     nullable: true,
                     description: 'Optional minimum subscription tier required to access',
                  },
                  scheduledAt: {
                     type: 'string',
                     format: 'date-time',
                     description: 'Optional scheduled publish time',
                  },
                  owner: {
                     $ref: '#/components/schemas/AudioBookOwnerInput',
                  }
               }
            },
            AudioBookStats: {
               type: 'object',
               properties: {
                  totalAudioBooks: {
                     type: 'number',
                     description: 'Total number of audiobooks',
                     example: 150
                  },
                  activeAudioBooks: {
                     type: 'number',
                     description: 'Number of active audiobooks',
                     example: 145
                  },
                  publicAudioBooks: {
                     type: 'number',
                     description: 'Number of public audiobooks',
                     example: 120
                  },
                  totalDuration: {
                     type: 'number',
                     description: 'Total duration in minutes',
                     example: 45000
                  },
                  averageDuration: {
                     type: 'number',
                     description: 'Average duration in minutes',
                     example: 300
                  },
                  genres: {
                     type: 'array',
                     items: {
                        type: 'object',
                        properties: {
                           genre: {
                              type: 'string',
                              example: 'Fiction'
                           },
                           count: {
                              type: 'number',
                              example: 45
                           }
                        }
                     }
                  },
                  languages: {
                     type: 'array',
                     items: {
                        type: 'object',
                        properties: {
                           language: {
                              type: 'string',
                              example: 'English'
                           },
                           count: {
                              type: 'number',
                              example: 120
                           }
                        }
                     }
                  }
               }
            },
            Chapter: {
               type: 'object',
               properties: {
                  id: { type: 'string' },
                  audiobookId: { type: 'string' },
                  title: { type: 'string' },
                  description: { type: 'string', nullable: true },
                  chapterNumber: { type: 'integer' },
                  duration: { type: 'integer' },
                  filePath: { type: 'string' },
                  fileSize: { type: 'integer' },
                  coverImage: { type: 'string', description: 'Primary cover image (square_960 variant)' },
                  imageAssets: { $ref: '#/components/schemas/ImageAssetsMap' },
                  isActive: { type: 'boolean' },
                  sourceUploadStatus: {
                     type: 'string',
                     enum: ['pending', 'ready', 'failed'],
                     description: 'Source audio upload lifecycle status',
                  },
                  sourceUploadError: {
                     type: 'string',
                     nullable: true,
                     description: 'Error when sourceUploadStatus is failed',
                  },
                  scheduledAt: { type: 'string', format: 'date-time', nullable: true },
                  minSubscriptionTier: {
                     type: 'integer',
                     nullable: true,
                     description:
                        'Minimum tier when parent audiobook uses CHAPTER gating. All chapters in an audiobook must share the same value.',
                  },
                  subscriptionAccess: {
                     $ref: '#/components/schemas/SubscriptionAccess',
                  },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' },
               },
            },
            PaginationInfo: {
               type: 'object',
               properties: {
                  currentPage: {
                     type: 'number',
                     description: 'Current page number',
                     example: 1
                  },
                  totalPages: {
                     type: 'number',
                     description: 'Total number of pages',
                     example: 10
                  },
                  totalItems: {
                     type: 'number',
                     description: 'Total number of items',
                     example: 100
                  },
                  itemsPerPage: {
                     type: 'number',
                     description: 'Number of items per page',
                     example: 10
                  },
                  hasNextPage: {
                     type: 'boolean',
                     description: 'Whether there is a next page',
                     example: true
                  },
                  hasPreviousPage: {
                     type: 'boolean',
                     description: 'Whether there is a previous page',
                     example: false
                  }
               }
            },
            CommentUser: {
               type: 'object',
               properties: {
                  username: { type: 'string', nullable: true },
                  avatar: { type: 'string', nullable: true, description: 'Primary avatar URL (square_120 variant)' },
                  imageAssets: { $ref: '#/components/schemas/ImageAssetsMap' },
               }
            },
            CommentMeta: {
               type: 'object',
               required: ['position'],
               properties: {
                  position: {
                     type: 'number',
                     minimum: 0,
                     description: 'Playback position in seconds',
                     example: 1200
                  }
               }
            },
            Comment: {
               type: 'object',
               properties: {
                  id: { type: 'string' },
                  userProfileId: { type: 'string' },
                  audiobookId: { type: 'string' },
                  parentId: { type: 'string', nullable: true },
                  content: { type: 'string' },
                  meta: { $ref: '#/components/schemas/CommentMeta', nullable: true },
                  user: { $ref: '#/components/schemas/CommentUser' },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' },
                  replies: {
                     type: 'array',
                     items: { $ref: '#/components/schemas/Comment' }
                  }
               }
            },
            CreateCommentRequest: {
               type: 'object',
               required: ['audiobookId', 'content'],
               properties: {
                  audiobookId: { type: 'string' },
                  content: { type: 'string' },
                  parentId: { type: 'string' },
                  meta: { $ref: '#/components/schemas/CommentMeta' }
               }
            },
            UpdateCommentRequest: {
               type: 'object',
               properties: {
                  content: { type: 'string' },
                  meta: { $ref: '#/components/schemas/CommentMeta', nullable: true }
               }
            },
            Review: {
               type: 'object',
               properties: {
                  id: { type: 'string' },
                  userProfileId: { type: 'string' },
                  audiobookId: { type: 'string' },
                  rating: { type: 'integer', minimum: 1, maximum: 5 },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' }
               }
            },
            CreateReviewRequest: {
               type: 'object',
               required: ['audiobookId', 'rating'],
               properties: {
                  audiobookId: { type: 'string' },
                  rating: { type: 'integer', minimum: 1, maximum: 5 }
               }
            },
            UpdateReviewRequest: {
               type: 'object',
               required: ['rating'],
               properties: {
                  rating: { type: 'integer', minimum: 1, maximum: 5 }
               }
            },
            Favorite: {
               type: 'object',
               properties: {
                  id: { type: 'string' },
                  userProfileId: { type: 'string' },
                  audiobookId: { type: 'string' },
                  createdAt: { type: 'string', format: 'date-time' }
               }
            },
            CreateFavoriteRequest: {
               type: 'object',
               required: ['audiobookId'],
               properties: {
                  audiobookId: { type: 'string' }
               }
            },
            Bookmark: {
               type: 'object',
               properties: {
                  id: { type: 'string' },
                  userProfileId: { type: 'string' },
                  chapterId: { type: 'string' },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' },
                  chapter: {
                     type: 'object',
                     properties: {
                        id: { type: 'string' },
                        title: { type: 'string' },
                        chapterNumber: { type: 'integer' },
                        audiobookId: { type: 'string' }
                     }
                  }
               }
            },
            CreateBookmarkRequest: {
               type: 'object',
               required: ['chapterId'],
               properties: {
                  chapterId: { type: 'string' }
               }
            },
            Playlist: {
               type: 'object',
               properties: {
                  id: { type: 'string' },
                  userProfileId: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string', nullable: true },
                  isPublic: { type: 'boolean' },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' },
                  items: {
                     type: 'array',
                     items: { $ref: '#/components/schemas/PlaylistItem' }
                  }
               }
            },
            CreatePlaylistRequest: {
               type: 'object',
               required: ['name'],
               properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  isPublic: { type: 'boolean', default: false }
               }
            },
            UpdatePlaylistRequest: {
               type: 'object',
               properties: {
                  name: { type: 'string' },
                  description: { type: 'string', nullable: true },
                  isPublic: { type: 'boolean' }
               }
            },
            PlaylistItem: {
               type: 'object',
               properties: {
                  id: { type: 'string' },
                  playlistId: { type: 'string' },
                  audiobookId: { type: 'string' },
                  position: { type: 'integer', minimum: 1 },
                  createdAt: { type: 'string', format: 'date-time' }
               }
            },
            CreatePlaylistItemRequest: {
               type: 'object',
               required: ['audiobookId'],
               properties: {
                  audiobookId: { type: 'string' },
                  position: { type: 'integer', minimum: 1 }
               }
            },
            UpdatePlaylistItemRequest: {
               type: 'object',
               required: ['position'],
               properties: {
                  position: { type: 'integer', minimum: 1 }
               }
            },
            Author: {
               type: 'object',
               properties: {
                  id: { type: 'string' },
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  email: { type: 'string', nullable: true },
                  address: { type: 'string', nullable: true },
                  contact: { type: 'string', nullable: true },
                  profileImage: { type: 'string', nullable: true, description: 'URL to profile picture' },
                  organizations: {
                     type: 'array',
                     items: {
                        type: 'object',
                        properties: {
                           id: { type: 'string' },
                           name: { type: 'string' },
                           slug: { type: 'string' }
                        }
                     }
                  },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' }
               }
            },
            Organization: {
               type: 'object',
               properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  slug: { type: 'string' },
                  description: { type: 'string', nullable: true },
                  image: { type: 'string', nullable: true, description: 'URL to organization image' },
                  preferredGenre: {
                     type: 'string',
                     nullable: true,
                     description: 'Preferred genre name'
                  },
                  websiteUrl: { type: 'string', nullable: true, format: 'uri' },
                  teamSize: {
                     type: 'string',
                     nullable: true,
                     enum: ['1-10', '11-50', '51-200', '200+']
                  },
                  memberCount: { type: 'integer', nullable: true },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' }
               }
            },
            ApiResponse: {
               type: 'object',
               properties: {
                  success: {
                     type: 'boolean',
                     description: 'Whether the request was successful',
                     example: true
                  },
                  message: {
                     type: 'string',
                     description: 'Response message',
                     example: 'AudioBooks retrieved successfully'
                  },
                  data: {
                     type: 'object',
                     description: 'Response data'
                  },
                  timestamp: {
                     type: 'string',
                     format: 'date-time',
                     description: 'Response timestamp',
                     example: '2024-01-15T10:30:00Z'
                  }
               },
               example: {
                  success: true,
                  message: 'AudioBooks retrieved successfully',
                  data: {},
                  timestamp: '2024-01-15T10:30:00Z'
               }
            },
            CacheInvalidateEvent: {
               type: 'object',
               required: ['version', 'service', 'resource', 'action', 'id', 'queryKeys', 'timestamp'],
               description:
                  'TanStack Query cache-invalidation payload on SSE event `cache-invalidate`. Invalidate each key via queryClient.invalidateQueries({ queryKey }). For `subscription-catalog`, skip when relatedIds.userId does not match the current user; use removeQueries then invalidateQueries so tier-gated audiobook/chapter cache is cleared and refetched. For `subscription-gating`, invalidate when audiobook/chapter gating config changes (including chapter minSubscriptionTier updates with relatedIds.chapterId and relatedIds.audiobookId) or when relayed from auth after plan tier definition changes.',
               properties: {
                  version: { type: 'integer', example: 1 },
                  service: { type: 'string', enum: ['app'], example: 'app' },
                  resource: {
                     type: 'string',
                     example: 'audiobook',
                     description:
                        'Stable entity name (audiobook, chapter, playlist, subscription-catalog, subscription-gating, …). subscription-catalog is relayed from auth when a user effective subscription tier changes. subscription-gating is emitted locally when gating mode/tier changes on audiobooks/chapters (chapter tier updates include relatedIds.chapterId), relayed from auth when plan tier definitions change, and relayed to auth SSE when chapter tier changes are published from app-service.',
                  },
                  action: { type: 'string', enum: ['created', 'updated', 'deleted'] },
                  id: { type: 'string' },
                  queryKeys: {
                     type: 'array',
                     items: { type: 'array', items: { type: 'string' } },
                     example: [['audiobooks'], ['audiobooks', 'cab1234567890abcdefghij']],
                  },
                  relatedIds: {
                     type: 'object',
                     additionalProperties: { type: 'string' },
                     example: { audiobookId: 'cab1234567890abcdefghij' },
                  },
                  timestamp: { type: 'string', format: 'date-time' },
               },
            },
            Genre: {
               type: 'object',
               properties: {
                  id: { type: 'string', example: 'cgenre1234567890abcdefgh' },
                  name: { type: 'string', example: 'Fiction' },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' },
               },
            },
            AuthorProfile: {
               type: 'object',
               properties: {
                  id: { type: 'string' },
                  authorId: { type: 'string', example: 'cauthor1234567890abcdefgh' },
                  avatar: { type: 'string', nullable: true, example: 'https://cdn.example.com/avatar.jpg', description: 'Primary avatar (square_120 variant)' },
                  imageAssets: { $ref: '#/components/schemas/ImageAssetsMap' },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' },
               },
            },
            PaginatedResponse: {
               type: 'object',
               properties: {
                  success: {
                     type: 'boolean',
                     description: 'Whether the request was successful',
                     example: true
                  },
                  message: {
                     type: 'string',
                     description: 'Response message',
                     example: 'AudioBooks retrieved successfully'
                  },
                  data: {
                     type: 'array',
                     items: {
                        $ref: '#/components/schemas/AudioBook'
                     }
                  },
                  pagination: {
                     $ref: '#/components/schemas/PaginationInfo'
                  },
                  timestamp: {
                     type: 'string',
                     format: 'date-time',
                     description: 'Response timestamp',
                     example: '2024-01-15T10:30:00Z'
                  }
               },
               example: {
                  success: true,
                  message: 'AudioBooks retrieved successfully',
                  data: [
                     {
                        id: '123e4567-e89b-12d3-a456-426614174000',
                        title: 'The Great Gatsby',
                        author: 'F. Scott Fitzgerald',
                        narrator: 'Jake Gyllenhaal',
                        description: 'A classic American novel set in the Jazz Age',
                        duration: 180,
                        fileSize: 52428800,
                        filePath: '/uploads/audiobooks/great-gatsby.mp3',
                        coverImage: 'https://example.com/covers/great-gatsby.jpg',
                        genre: 'Fiction',
                        language: 'English',
                        publisher: 'Penguin Random House',
                        publishDate: '1925-04-10',
                        isbn: '978-0-7432-7356-5',
                        isActive: true,
                        isPublic: true,
                        createdAt: '2024-01-15T10:30:00Z',
                        updatedAt: '2024-01-15T10:30:00Z'
                     }
                  ],
                  pagination: {
                     currentPage: 1,
                     totalPages: 10,
                     totalItems: 100,
                     itemsPerPage: 10,
                     hasNextPage: true,
                     hasPreviousPage: false
                  },
                  timestamp: '2024-01-15T10:30:00Z'
               }
            },
            ErrorResponse: {
               type: 'object',
               properties: {
                  success: {
                     type: 'boolean',
                     description: 'Whether the request was successful',
                     example: false
                  },
                  message: {
                     type: 'string',
                     description: 'Error message',
                     example: 'AudioBook not found'
                  },
                  error: {
                     type: 'object',
                     properties: {
                        name: {
                           type: 'string',
                           example: 'ApiError'
                        },
                        message: {
                           type: 'string',
                           example: 'AudioBook not found'
                        },
                        statusCode: {
                           type: 'number',
                           example: 404
                        },
                        errorType: {
                           type: 'string',
                           example: 'NOT_FOUND'
                        },
                        timestamp: {
                           type: 'string',
                           format: 'date-time',
                           example: '2024-01-15T10:30:00Z'
                        },
                        path: {
                           type: 'string',
                           example: '/api/v1/audiobooks/123'
                        }
                     }
                  },
                  timestamp: {
                     type: 'string',
                     format: 'date-time',
                     description: 'Response timestamp',
                     example: '2024-01-15T10:30:00Z'
                  }
               },
               example: {
                  success: false,
                  message: 'AudioBook not found',
                  error: {
                     name: 'ApiError',
                     message: 'AudioBook not found',
                     statusCode: 404,
                     errorType: 'NOT_FOUND',
                     timestamp: '2024-01-15T10:30:00Z',
                     path: '/api/v1/audiobooks/123'
                  },
                  timestamp: '2024-01-15T10:30:00Z'
               }
            },
            ValidationError: {
               type: 'object',
               properties: {
                  success: {
                     type: 'boolean',
                     description: 'Whether the request was successful',
                     example: false
                  },
                  message: {
                     type: 'string',
                     description: 'Error message',
                     example: 'Validation failed'
                  },
                  errors: {
                     type: 'array',
                     items: {
                        type: 'object',
                        properties: {
                           field: {
                              type: 'string',
                              example: 'title'
                           },
                           message: {
                              type: 'string',
                              example: 'Title is required'
                           }
                        }
                     }
                  },
                  timestamp: {
                     type: 'string',
                     format: 'date-time',
                     description: 'Response timestamp',
                     example: '2024-01-15T10:30:00Z'
                  }
               }
            },
         },
         parameters: {
            PageParam: {
               name: 'page',
               in: 'query',
               description: 'Page number for pagination',
               required: false,
               schema: {
                  type: 'integer',
                  minimum: 1,
                  default: 1,
                  example: 1
               }
            },
            LimitParam: {
               name: 'limit',
               in: 'query',
               description: 'Number of items per page',
               required: false,
               schema: {
                  type: 'integer',
                  minimum: 1,
                  maximum: 100,
                  default: 10,
                  example: 10
               }
            },
            SortByParam: {
               name: 'sortBy',
               in: 'query',
               description: 'Field to sort by',
               required: false,
               schema: {
                  type: 'string',
                  enum: ['title', 'author', 'duration', 'createdAt', 'updatedAt'],
                  default: 'createdAt',
                  example: 'createdAt'
               }
            },
            SortOrderParam: {
               name: 'sortOrder',
               in: 'query',
               description: 'Sort order',
               required: false,
               schema: {
                  type: 'string',
                  enum: ['asc', 'desc'],
                  default: 'desc',
                  example: 'desc'
               }
            },
            OwnerTypeParam: {
               name: 'ownerType',
               in: 'query',
               description: 'Filter by polymorphic owner type',
               schema: { type: 'string', enum: ['AUTHOR', 'ORGANIZATION'], example: 'ORGANIZATION' },
            },
            OwnerIdParam: {
               name: 'ownerId',
               in: 'query',
               description: 'Filter by owner id (auth-service Author or Organization id)',
               schema: { type: 'string', example: 'corg1234567890abcdefghij' },
            },
            OwnerIdsParam: {
               name: 'ownerIds',
               in: 'query',
               description: 'Comma-separated owner ids (same ownerType)',
               schema: { type: 'string', example: 'corg1234567890abcdefghij,corg0987654321abcdefghij' },
            },
            GenreParam: {
               name: 'genre',
               in: 'query',
               description: 'Deprecated — use genreIds or genreId instead',
               required: false,
               deprecated: true,
               schema: {
                  type: 'string',
                  example: 'Fiction'
               }
            },
            GenreIdsParam: {
               name: 'genreIds',
               in: 'query',
               description: 'Optional comma-separated genre IDs to filter by',
               required: false,
               schema: {
                  type: 'string',
                  example: 'cgenre1234567890abcdefgh,cgenre0987654321abcdefgh'
               }
            },
            GenreIdParam: {
               name: 'genreId',
               in: 'query',
               description: 'Optional single genre ID filter (alternative to genreIds)',
               required: false,
               schema: {
                  type: 'string',
                  example: 'cgenre1234567890abcdefgh'
               }
            },
            MoodIdsParam: {
               name: 'moodIds',
               in: 'query',
               description: 'Optional comma-separated mood IDs (alternative to moodId)',
               required: false,
               schema: {
                  type: 'string',
                  example: 'cmood1234567890abcdefghij,cmood0987654321abcdefghij'
               }
            },
            ActiveParam: {
               name: 'active',
               in: 'query',
               description: 'Optional filter for active audiobooks only (true) or inactive only (false)',
               required: false,
               schema: {
                  type: 'boolean',
                  example: true
               }
            },
            ScheduledParam: {
               name: 'scheduled',
               in: 'query',
               description: 'Optional filter for scheduled (future) audiobooks when true',
               required: false,
               schema: {
                  type: 'boolean',
                  example: false
               }
            },
            StreamingUserQueryParam: {
               name: 'user',
               in: 'query',
               description: 'Optional user ID for proxy auth when Bearer token is not used (app-service forwards as user_id header)',
               required: false,
               schema: {
                  type: 'string',
                  example: 'cuser1234567890abcdefghij'
               }
            },
            MoodIdParam: {
               name: 'moodId',
               in: 'query',
               description: 'Filter by mood ID (supports comma-separated moodIds for multiple moods)',
               required: false,
               schema: {
                  type: 'string',
                  example: 'clxyz1234567890abcdefghij'
               }
            },
            LanguageParam: {
               name: 'language',
               in: 'query',
               description: 'Filter by language',
               required: false,
               schema: {
                  type: 'string',
                  example: 'English'
               }
            },
            AuthorParam: {
               name: 'author',
               in: 'query',
               description: 'Filter by author',
               required: false,
               schema: {
                  type: 'string',
                  example: 'F. Scott Fitzgerald'
               }
            },
            NarratorParam: {
               name: 'narrator',
               in: 'query',
               description: 'Filter by narrator',
               required: false,
               schema: {
                  type: 'string',
                  example: 'Jake Gyllenhaal'
               }
            },
            IsActiveParam: {
               name: 'isActive',
               in: 'query',
               description: 'Filter by active status',
               required: false,
               schema: {
                  type: 'boolean',
                  example: true
               }
            },
            IsPublicParam: {
               name: 'isPublic',
               in: 'query',
               description: 'Filter by public status',
               required: false,
               schema: {
                  type: 'boolean',
                  example: true
               }
            },
            SearchParam: {
               name: 'search',
               in: 'query',
               description: 'Search term for title, author, or description',
               required: false,
               schema: {
                  type: 'string',
                  example: 'gatsby'
               }
            },
            QueryParam: {
               name: 'q',
               in: 'query',
               description: 'Search query',
               required: true,
               schema: {
                  type: 'string',
                  example: 'gatsby'
               }
            },
            IdParam: {
               name: 'id',
               in: 'path',
               description: 'AudioBook ID',
               required: true,
               schema: {
                  type: 'string',
                  format: 'uuid',
                  example: '123e4567-e89b-12d3-a456-426614174000'
               }
            },
            GenrePathParam: {
               name: 'genre',
               in: 'path',
               description: 'Genre name',
               required: true,
               schema: {
                  type: 'string',
                  example: 'Fiction'
               }
            },
            AuthorPathParam: {
               name: 'author',
               in: 'path',
               description: 'Author name',
               required: true,
               schema: {
                  type: 'string',
                  example: 'F. Scott Fitzgerald'
               }
            }
         },
         responses: {
            Success: {
               description: 'Successful response',
               content: {
                  'application/json': {
                     schema: {
                        $ref: '#/components/schemas/ApiResponse'
                     }
                  }
               }
            },
            PaginatedSuccess: {
               description: 'Successful paginated response',
               content: {
                  'application/json': {
                     schema: {
                        $ref: '#/components/schemas/PaginatedResponse'
                     }
                  }
               }
            },
            Created: {
               description: 'Resource created successfully',
               content: {
                  'application/json': {
                     schema: {
                        $ref: '#/components/schemas/ApiResponse'
                     }
                  }
               }
            },
            NoContent: {
               description: 'No content',
               content: {
                  'application/json': {
                     schema: {
                        type: 'object',
                        properties: {
                           success: {
                              type: 'boolean',
                              example: true
                           },
                           message: {
                              type: 'string',
                              example: 'Resource deleted successfully'
                           }
                        }
                     }
                  }
               }
            },
            BadRequest: {
               description: 'Bad request',
               content: {
                  'application/json': {
                     schema: {
                        $ref: '#/components/schemas/ErrorResponse'
                     }
                  }
               }
            },
            ValidationError: {
               description: 'Validation error',
               content: {
                  'application/json': {
                     schema: {
                        $ref: '#/components/schemas/ValidationError'
                     }
                  }
               }
            },
            NotFound: {
               description: 'Resource not found',
               content: {
                  'application/json': {
                     schema: {
                        $ref: '#/components/schemas/ErrorResponse'
                     }
                  }
               }
            },
            NotFoundError: {
               $ref: '#/components/responses/NotFound'
            },
            Forbidden: {
               description: 'Access forbidden',
               content: {
                  'application/json': {
                     schema: {
                        $ref: '#/components/schemas/ErrorResponse'
                     }
                  }
               }
            },
            UnauthorizedError: {
               description: 'Authentication required or token invalid',
               content: {
                  'application/json': {
                     schema: {
                        $ref: '#/components/schemas/ErrorResponse'
                     },
                     example: {
                        success: false,
                        message: 'Unauthorized',
                        timestamp: '2024-01-15T10:30:00Z'
                     }
                  }
               }
            },
            Conflict: {
               description: 'Resource conflict',
               content: {
                  'application/json': {
                     schema: {
                        $ref: '#/components/schemas/ErrorResponse'
                     }
                  }
               }
            },
            ForbiddenError: {
               description: 'Access forbidden',
               content: {
                  'application/json': {
                     schema: { $ref: '#/components/schemas/ErrorResponse' },
                  },
               },
            },
            InternalServerError: {
               description: 'Internal server error',
               content: {
                  'application/json': {
                     schema: {
                        $ref: '#/components/schemas/ErrorResponse'
                     }
                  }
               }
            }
         }
      },
      tags: [
         {
            name: 'AudioBooks',
            description: 'Operations related to audiobooks'
         },
         {
            name: 'Comments',
            description: 'Audiobook comments and nested replies'
         },
         {
            name: 'Reviews',
            description: 'Audiobook star ratings'
         },
         {
            name: 'Favorites',
            description: 'User favorite audiobooks'
         },
         {
            name: 'Bookmarks',
            description: 'User chapter bookmarks'
         },
         {
            name: 'Notes',
            description: 'User notes for audiobooks and chapters'
         },
         {
            name: 'Playlists',
            description: 'User playlists and playlist items'
         },
         {
            name: 'Organizations',
            description: 'Organization catalog and audiobook listings'
         },
         {
            name: 'AuthorProfiles',
            description: 'App-service author profile (avatar) linked to auth-service Author'
         },
         {
            name: 'Streaming',
            description: 'HLS streaming proxy to streaming-service'
         },
         {
            name: 'Events',
            description: 'SSE cache-invalidation stream for TanStack Query clients'
         },
         {
            name: 'Health',
            description: 'Health check endpoints'
         }
      ]
   },
   apis: [
      './src/routes/*.ts',
      './src/docs/*.ts',
      './src/controllers/*.ts'
   ]
};

const specs = swaggerJsdoc(options);

export const setupSwagger = (app: Express): void => {
   // Swagger UI
   app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
      explorer: true,
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'AudioBook API Documentation',
      swaggerOptions: {
         persistAuthorization: true,
         displayRequestDuration: true,
         filter: true,
         showExtensions: true,
         showCommonExtensions: true
      }
   }));

   // JSON endpoint for OpenAPI spec
   app.get('/api-docs.json', (_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(specs);
   });
};

export { specs };
