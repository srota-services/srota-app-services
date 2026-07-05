/**
 * API versioning and routing configuration
 * Provides structured routing following best practices
 */
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateJWT, authenticateJWTOrQuery } from '../middleware/AuthMiddleware';
import { blockGuestMutations } from '../middleware/RoleMiddleware';
import { createAudioBookRoutes } from './audioBookRoutes';
import { createChapterRoutes } from './chapterRoutes';
import { createPageRoutes } from './pageRoutes';
import { createPlaybackRoutes } from './playbackRoutes';
import { createBookmarkRoutes } from './bookmarkRoutes';
import { createOfflineDownloadRoutes } from './offlineDownloadRoutes';
import { createHealthRoutes } from './healthRoutes';
import { createGenreRoutes } from './genreRoutes';
import { createLanguageRoutes } from './languageRoutes';
import { createMoodRoutes } from './moodRoutes';
import { createStreamingRoutes } from './streamingRoutes';
import { createUserAudioBookRoutes } from './userAudioBookRoutes';
import { createTagRoutes } from './tagRoutes';
import { createOrganizationCatalogRoutes } from './organizationCatalogRoutes';
import { createCommentRoutes } from './commentRoutes';
import { createReviewRoutes } from './reviewRoutes';
import { createOrganizationReviewRoutes } from './organizationReviewRoutes';
import { createAuthorReviewRoutes } from './authorReviewRoutes';
import { createFavoriteRoutes } from './favoriteRoutes';
import { createPlaylistRoutes } from './playlistRoutes';
import { createListeningHistoryRoutes } from './listeningHistoryRoutes';
import { createDomainEventsRoutes } from './domainEventsRoutes';

export class ApiRouter {
  private static instance: ApiRouter;
  private router: Router;
  private prisma: PrismaClient;

  private constructor() {
    this.router = Router();
    this.prisma = new PrismaClient();
    this.setupRoutes();
  }

  /**
   * Singleton pattern for router instance
   */
  public static getInstance(): ApiRouter {
    if (!ApiRouter.instance) {
      ApiRouter.instance = new ApiRouter();
    }
    return ApiRouter.instance;
  }

  /**
   * Get the configured router
   */
  public getRouter(): Router {
    return this.router;
  }

  /**
   * Setup all API routes
   */
  private setupRoutes(): void {
    // Health check endpoint (service-specific prefix)
    this.router.use('/app', createHealthRoutes());

    // API versioning
    this.setupV1Routes();
  }

  /**
   * Setup API v1 routes
   * Protected with JWT authentication middleware
   */
  private setupV1Routes(): void {
    const v1Router = Router();

    // SSE stream supports Bearer header or ?access_token= (EventSource)
    v1Router.use('/events', createDomainEventsRoutes());

    // Streaming supports Bearer or ?access_token= for HLS segment requests
    v1Router.use('/stream', authenticateJWTOrQuery, createStreamingRoutes(this.prisma));

    // Apply JWT authentication middleware to all other v1 routes
    v1Router.use(authenticateJWT);

    // Guests may browse via GET; block POST/PUT/PATCH/DELETE globally
    v1Router.use(blockGuestMutations());

    // Catalog routes (guest browse)
    v1Router.use('/audiobooks', createAudioBookRoutes(this.prisma));
    v1Router.use('/genres', createGenreRoutes(this.prisma));
    v1Router.use('/languages', createLanguageRoutes(this.prisma));
    v1Router.use('/moods', createMoodRoutes(this.prisma));
    v1Router.use('/tags', createTagRoutes(this.prisma));
    v1Router.use('/organizations', createOrganizationCatalogRoutes(this.prisma));

    // Chapter routes (mixed catalog GET + content management)
    v1Router.use('/', createChapterRoutes(this.prisma));
    v1Router.use('/', createPageRoutes(this.prisma));

    // User-specific features
    v1Router.use('/playback', createPlaybackRoutes(this.prisma));
    v1Router.use('/', createBookmarkRoutes(this.prisma));
    v1Router.use('/', createOfflineDownloadRoutes(this.prisma));
    v1Router.use('/user-audiobooks', createUserAudioBookRoutes(this.prisma));
    v1Router.use('/comments', createCommentRoutes(this.prisma));
    v1Router.use('/reviews', createReviewRoutes(this.prisma));
    v1Router.use('/organization-reviews', createOrganizationReviewRoutes(this.prisma));
    v1Router.use('/author-reviews', createAuthorReviewRoutes(this.prisma));
    v1Router.use('/favorites', createFavoriteRoutes(this.prisma));
    v1Router.use('/playlists', createPlaylistRoutes(this.prisma));
    v1Router.use('/listening-history', createListeningHistoryRoutes(this.prisma));

    // Mount v1 routes
    this.router.use('/v1', v1Router);
  }

}
