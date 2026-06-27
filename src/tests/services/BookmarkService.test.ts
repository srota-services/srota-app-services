/**
 * BookmarkService chapter-only bookmark tests
 */
import { PrismaClient } from '@prisma/client';
import { BookmarkService } from '../../services/BookmarkService';
import { HttpStatusCode } from '../../types/common';
import { attachPrismaTransaction } from '../helpers/prismaMock';

jest.mock('../../utils/MessageHandler', () => ({
   MessageHandler: {
      getErrorMessage: (key: string) => key,
   },
}));

describe('BookmarkService chapter-only bookmarks', () => {
   const userProfileId = 'profile-1';
   const chapterId = 'chapter-1';
   const audiobookId = 'audiobook-1';

   let prisma: {
      chapter: { findUnique: jest.Mock };
      bookmark: {
         findUnique: jest.Mock;
         create: jest.Mock;
         findMany: jest.Mock;
         count: jest.Mock;
      };
   };
   let service: BookmarkService;

   beforeEach(() => {
      prisma = attachPrismaTransaction({
         chapter: { findUnique: jest.fn() },
         bookmark: {
            findUnique: jest.fn(),
            create: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn(),
         },
      });
      service = new BookmarkService(prisma as unknown as PrismaClient);
   });

   describe('createBookmark', () => {
      it('returns 409 when chapter is already bookmarked', async () => {
         prisma.chapter.findUnique.mockResolvedValue({ id: chapterId, audiobookId });
         prisma.bookmark.findUnique.mockResolvedValue({ id: 'existing-bookmark' });

         await expect(
            service.createBookmark(userProfileId, { chapterId })
         ).rejects.toMatchObject({
            statusCode: HttpStatusCode.CONFLICT,
         });
      });

      it('creates bookmark with chapter included', async () => {
         prisma.chapter.findUnique.mockResolvedValue({ id: chapterId, audiobookId });
         prisma.bookmark.findUnique.mockResolvedValue(null);
         prisma.bookmark.create.mockResolvedValue({
            id: 'bookmark-1',
            userProfileId,
            chapterId,
            createdAt: new Date(),
            updatedAt: new Date(),
            chapter: {
               id: chapterId,
               title: 'Chapter 1',
               chapterNumber: 1,
               audiobookId,
            },
         });

         const result = await service.createBookmark(userProfileId, { chapterId });

         expect(result.chapterId).toBe(chapterId);
         expect(result.chapter?.title).toBe('Chapter 1');
      });
   });

   describe('getBookmarks', () => {
      it('filters by audiobookId via chapter relation', async () => {
         prisma.bookmark.findMany.mockResolvedValue([]);
         prisma.bookmark.count.mockResolvedValue(0);

         await service.getBookmarks(userProfileId, { audiobookId });

         expect(prisma.bookmark.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
               where: {
                  userProfileId,
                  chapter: { audiobookId },
               },
            })
         );
      });
   });
});
