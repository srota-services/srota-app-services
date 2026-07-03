/**
 * Page Controller — HTTP handlers for authoring-mode page CRUD.
 */
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { PageService } from '../services/PageService';
import { ContentAuthorizationService } from '../services/ContentAuthorizationService';
import { ResponseHandler } from '../utils/ResponseHandler';
import { ErrorHandler } from '../middleware/ErrorHandler';
import { MessageHandler } from '../utils/MessageHandler';
import { AuthenticatedRequest } from '../types/auth';
import { CreatePageInput } from '../models/PageDto';

export class PageController {
  private pageService: PageService;
  private contentAuthorizationService: ContentAuthorizationService;
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.pageService = new PageService(prisma);
    this.contentAuthorizationService = new ContentAuthorizationService(prisma);
  }

  private getBearerToken(req: Request): string | undefined {
    const authorization = req.headers.authorization;
    if (!authorization || !authorization.startsWith('Bearer ')) {
      return undefined;
    }
    const token = authorization.slice(7).trim();
    return token.length > 0 ? token : undefined;
  }

  getPagesByChapterId = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { chapterId } = req.params;
    const pages = await this.pageService.getPagesByChapterId(chapterId as string);
    ResponseHandler.success(res, pages, MessageHandler.getSuccessMessage('pages.retrieved'));
  });

  getPageById = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const page = await this.pageService.getPageById(id as string);
    ResponseHandler.success(res, page, MessageHandler.getSuccessMessage('pages.retrieved_by_id'));
  });

  createPage = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { chapterId } = req.params;
    const authReq = req as AuthenticatedRequest;
    const externalUserId = authReq.user?.id;
    const accessToken = this.getBearerToken(req);

    const chapter = await this.prisma.chapter.findUnique({
      where: { id: chapterId as string },
      select: { audiobookId: true },
    });
    if (!chapter) {
      ResponseHandler.notFound(res, MessageHandler.getErrorMessage('not_found.chapter'));
      return;
    }

    const { allowed } = await this.contentAuthorizationService.canCreateChapter(
      externalUserId,
      chapter.audiobookId,
      authReq.user?.role,
      accessToken,
    );
    if (!allowed) {
      ResponseHandler.forbidden(res, MessageHandler.getErrorMessage('organizations.admin_required'));
      return;
    }

    const input: CreatePageInput = {
      pageNumber: parseInt(req.body.pageNumber, 10),
      plainText: req.body.plainText,
      richText: req.body.richText,
    };

    const page = await this.pageService.createPage(chapterId as string, input);
    ResponseHandler.success(res, page, MessageHandler.getSuccessMessage('pages.created'), 201);
  });

  updatePage = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;
    const externalUserId = authReq.user?.id;
    const accessToken = this.getBearerToken(req);

    const existing = await this.prisma.page.findUnique({
      where: { id: id as string },
      select: { chapterId: true },
    });
    if (!existing) {
      ResponseHandler.notFound(res, MessageHandler.getErrorMessage('not_found.page'));
      return;
    }

    const chapter = await this.prisma.chapter.findUnique({
      where: { id: existing.chapterId },
      select: { audiobookId: true },
    });
    if (!chapter) {
      ResponseHandler.notFound(res, MessageHandler.getErrorMessage('not_found.chapter'));
      return;
    }

    const { allowed } = await this.contentAuthorizationService.canManageChapter(
      externalUserId,
      existing.chapterId,
      authReq.user?.role,
      accessToken,
    );
    if (!allowed) {
      ResponseHandler.forbidden(res, MessageHandler.getErrorMessage('organizations.admin_required'));
      return;
    }

    const updateData: {
      pageNumber?: number;
      plainText?: string;
      richText?: Record<string, unknown> | unknown[];
    } = {};

    if (req.body.pageNumber !== undefined) {
      updateData.pageNumber = parseInt(req.body.pageNumber, 10);
    }
    if (req.body.plainText !== undefined) {
      updateData.plainText = req.body.plainText;
    }
    if (req.body.richText !== undefined) {
      updateData.richText = req.body.richText;
    }

    const page = await this.pageService.updatePage(id as string, updateData);
    ResponseHandler.success(res, page, MessageHandler.getSuccessMessage('pages.updated'));
  });

  deletePage = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const authReq = req as AuthenticatedRequest;
    const externalUserId = authReq.user?.id;
    const accessToken = this.getBearerToken(req);

    const existing = await this.prisma.page.findUnique({
      where: { id: id as string },
      select: { chapterId: true },
    });
    if (!existing) {
      ResponseHandler.notFound(res, MessageHandler.getErrorMessage('not_found.page'));
      return;
    }

    const { allowed } = await this.contentAuthorizationService.canManageChapter(
      externalUserId,
      existing.chapterId,
      authReq.user?.role,
      accessToken,
    );
    if (!allowed) {
      ResponseHandler.forbidden(res, MessageHandler.getErrorMessage('organizations.admin_required'));
      return;
    }

    await this.pageService.deletePage(id as string);
    ResponseHandler.success(res, null, MessageHandler.getSuccessMessage('pages.deleted'));
  });
}
