/**
 * UserAudioBookService Tests
 * Tests for user-audiobook relationship management functionality
 */
import { UserAudioBookService } from '../../services/UserAudioBookService';
import { ApiError } from '../../types/ApiError';
import { UserAudioBookType } from '@prisma/client';
import { attachPrismaTransaction } from '../helpers/prismaMock';

// Mock Prisma client
const mockPrisma = attachPrismaTransaction({
   userAudioBook: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn()
   },
   userProfile: {
      findUnique: jest.fn()
   },
   audioBook: {
      findUnique: jest.fn()
   }
}) as any;

// Mock MessageHandler
jest.mock('../../utils/MessageHandler', () => ({
   MessageHandler: {
      getErrorMessage: (key: string) => {
         const messages: Record<string, string> = {
            'user_audiobooks.fetch_failed': 'Failed to fetch user-audiobook relationships',
            'user_audiobooks.not_found': 'User-audiobook relationship not found',
            'user_audiobooks.create_failed': 'Failed to create user-audiobook relationship',
            'user_audiobooks.update_failed': 'Failed to update user-audiobook relationship',
            'user_audiobooks.delete_failed': 'Failed to delete user-audiobook relationship',
            'user_audiobooks.already_exists': 'User-audiobook relationship already exists',
            'user_audiobooks.user_profile_not_found': 'User profile not found',
            'user_audiobooks.audiobook_not_found': 'Audiobook not found'
         };
         return messages[key] || key;
      }
   }
}));

jest.mock('../../services/FileUrlService', () => ({
   fileUrlService: {
      resolveNestedAudiobookMedia: jest.fn(async (audiobook: { coverImage?: string | null }) => ({
         coverImage: audiobook.coverImage,
         imageAssets: {},
      })),
   },
}));

describe('UserAudioBookService', () => {
   let userAudioBookService: UserAudioBookService;

   beforeEach(() => {
      userAudioBookService = new UserAudioBookService(mockPrisma);
      jest.clearAllMocks();
   });

   describe('createUserAudioBook', () => {
      it('creates a user-audiobook relationship as PURCHASED when valid', async () => {
         const mockUserProfile = { id: 'user1', userId: 'user-123', username: 'testuser' };
         const mockAudioBook = { id: 'book1', title: 'Test Book', author: 'Test Author' };
         const mockUserAudioBook = {
            id: 'ua1',
            userProfileId: 'user1',
            audiobookId: 'book1',
            type: UserAudioBookType.PURCHASED,
            createdAt: new Date(),
            updatedAt: new Date()
         };

         mockPrisma.userProfile.findUnique.mockResolvedValue(mockUserProfile);
         mockPrisma.audioBook.findUnique.mockResolvedValue(mockAudioBook);
         mockPrisma.userAudioBook.findUnique.mockResolvedValue(null);
         mockPrisma.userAudioBook.create.mockResolvedValue(mockUserAudioBook);

         const result = await userAudioBookService.createUserAudioBook({
            userProfileId: 'user1',
            audiobookId: 'book1'
         });

         expect(result.userProfileId).toBe('user1');
         expect(result.audiobookId).toBe('book1');
         expect(result.type).toBe(UserAudioBookType.PURCHASED);
         expect(mockPrisma.userAudioBook.create).toHaveBeenCalledWith({
            data: {
               userProfileId: 'user1',
               audiobookId: 'book1',
               type: UserAudioBookType.PURCHASED
            }
         });
      });

      it('throws error when user profile not found', async () => {
         mockPrisma.userProfile.findUnique.mockResolvedValue(null);

         await expect(
            userAudioBookService.createUserAudioBook({
               userProfileId: 'user1',
               audiobookId: 'book1'
            })
         ).rejects.toBeInstanceOf(ApiError);

         expect(mockPrisma.userAudioBook.create).not.toHaveBeenCalled();
      });

      it('throws error when audiobook not found', async () => {
         const mockUserProfile = { id: 'user1', userId: 'user-123', username: 'testuser' };

         mockPrisma.userProfile.findUnique.mockResolvedValue(mockUserProfile);
         mockPrisma.audioBook.findUnique.mockResolvedValue(null);

         await expect(
            userAudioBookService.createUserAudioBook({
               userProfileId: 'user1',
               audiobookId: 'book1'
            })
         ).rejects.toBeInstanceOf(ApiError);

         expect(mockPrisma.userAudioBook.create).not.toHaveBeenCalled();
      });

      it('throws error on duplicate relationship', async () => {
         const mockUserProfile = { id: 'user1', userId: 'user-123', username: 'testuser' };
         const mockAudioBook = { id: 'book1', title: 'Test Book', author: 'Test Author' };
         const mockExisting = {
            id: 'ua1',
            userProfileId: 'user1',
            audiobookId: 'book1',
            type: UserAudioBookType.OWNED
         };

         mockPrisma.userProfile.findUnique.mockResolvedValue(mockUserProfile);
         mockPrisma.audioBook.findUnique.mockResolvedValue(mockAudioBook);
         mockPrisma.userAudioBook.findUnique.mockResolvedValue(mockExisting);

         await expect(
            userAudioBookService.createUserAudioBook({
               userProfileId: 'user1',
               audiobookId: 'book1'
            })
         ).rejects.toBeInstanceOf(ApiError);

         expect(mockPrisma.userAudioBook.create).not.toHaveBeenCalled();
      });
   });

   describe('createOwnedUserAudioBook', () => {
      it('creates OWNED relationship for audiobook creator', async () => {
         const mockUserProfile = { id: 'user1', userId: 'user-123', username: 'testuser' };
         const mockAudioBook = { id: 'book1', title: 'Test Book', author: 'Test Author' };
         const mockUserAudioBook = {
            id: 'ua1',
            userProfileId: 'user1',
            audiobookId: 'book1',
            type: UserAudioBookType.OWNED,
            createdAt: new Date(),
            updatedAt: new Date()
         };

         mockPrisma.userProfile.findUnique.mockResolvedValue(mockUserProfile);
         mockPrisma.audioBook.findUnique.mockResolvedValue(mockAudioBook);
         mockPrisma.userAudioBook.findUnique.mockResolvedValue(null);
         mockPrisma.userAudioBook.create.mockResolvedValue(mockUserAudioBook);

         const result = await userAudioBookService.createOwnedUserAudioBook('user1', 'book1');

         expect(result?.type).toBe(UserAudioBookType.OWNED);
         expect(mockPrisma.userAudioBook.create).toHaveBeenCalledWith({
            data: {
               userProfileId: 'user1',
               audiobookId: 'book1',
               type: UserAudioBookType.OWNED
            }
         });
      });

      it('returns existing relationship without creating duplicate', async () => {
         const mockUserProfile = { id: 'user1', userId: 'user-123', username: 'testuser' };
         const mockAudioBook = { id: 'book1', title: 'Test Book', author: 'Test Author' };
         const mockExisting = {
            id: 'ua1',
            userProfileId: 'user1',
            audiobookId: 'book1',
            type: UserAudioBookType.OWNED,
            createdAt: new Date(),
            updatedAt: new Date()
         };

         mockPrisma.userProfile.findUnique.mockResolvedValue(mockUserProfile);
         mockPrisma.audioBook.findUnique.mockResolvedValue(mockAudioBook);
         mockPrisma.userAudioBook.findUnique.mockResolvedValue(mockExisting);

         const result = await userAudioBookService.createOwnedUserAudioBook('user1', 'book1');

         expect(result?.id).toBe('ua1');
         expect(mockPrisma.userAudioBook.create).not.toHaveBeenCalled();
      });
   });

   describe('getAllUserAudioBooks', () => {
      it('returns paginated user-audiobook relationships', async () => {
         const mockUserAudioBooks = [
            {
               id: 'ua1',
               userProfileId: 'user1',
               audiobookId: 'book1',
               type: UserAudioBookType.OWNED,
               createdAt: new Date(),
               updatedAt: new Date()
            },
            {
               id: 'ua2',
               userProfileId: 'user2',
               audiobookId: 'book2',
               type: UserAudioBookType.PURCHASED,
               createdAt: new Date(),
               updatedAt: new Date()
            }
         ];

         mockPrisma.userAudioBook.findMany.mockResolvedValue(mockUserAudioBooks);
         mockPrisma.userAudioBook.count.mockResolvedValue(2);

         const result = await userAudioBookService.getAllUserAudioBooks({
            page: 1,
            limit: 10
         });

         expect(result.userAudioBooks).toHaveLength(2);
         expect(result.totalCount).toBe(2);
         expect(mockPrisma.userAudioBook.findMany).toHaveBeenCalled();
      });

      it('filters by userProfileId', async () => {
         const mockUserAudioBooks = [
            {
               id: 'ua1',
               userProfileId: 'user1',
               audiobookId: 'book1',
               type: UserAudioBookType.OWNED,
               createdAt: new Date(),
               updatedAt: new Date()
            }
         ];

         mockPrisma.userAudioBook.findMany.mockResolvedValue(mockUserAudioBooks);
         mockPrisma.userAudioBook.count.mockResolvedValue(1);

         const result = await userAudioBookService.getAllUserAudioBooks({
            page: 1,
            limit: 10,
            userProfileId: 'user1'
         });

         expect(result.userAudioBooks).toHaveLength(1);
         expect(mockPrisma.userAudioBook.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
               where: expect.objectContaining({
                  userProfileId: 'user1'
               })
            })
         );
      });

      it('filters by audiobookId', async () => {
         const mockUserAudioBooks = [
            {
               id: 'ua1',
               userProfileId: 'user1',
               audiobookId: 'book1',
               type: UserAudioBookType.OWNED,
               createdAt: new Date(),
               updatedAt: new Date()
            }
         ];

         mockPrisma.userAudioBook.findMany.mockResolvedValue(mockUserAudioBooks);
         mockPrisma.userAudioBook.count.mockResolvedValue(1);

         const result = await userAudioBookService.getAllUserAudioBooks({
            page: 1,
            limit: 10,
            audiobookId: 'book1'
         });

         expect(result.userAudioBooks).toHaveLength(1);
         expect(mockPrisma.userAudioBook.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
               where: expect.objectContaining({
                  audiobookId: 'book1'
               })
            })
         );
      });

      it('filters by type', async () => {
         const mockUserAudioBooks = [
            {
               id: 'ua1',
               userProfileId: 'user1',
               audiobookId: 'book1',
               type: UserAudioBookType.OWNED,
               createdAt: new Date(),
               updatedAt: new Date()
            }
         ];

         mockPrisma.userAudioBook.findMany.mockResolvedValue(mockUserAudioBooks);
         mockPrisma.userAudioBook.count.mockResolvedValue(1);

         const result = await userAudioBookService.getAllUserAudioBooks({
            page: 1,
            limit: 10,
            type: UserAudioBookType.OWNED
         });

         expect(result.userAudioBooks).toHaveLength(1);
         expect(mockPrisma.userAudioBook.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
               where: expect.objectContaining({
                  type: UserAudioBookType.OWNED
               })
            })
         );
      });
   });

   describe('getUserAudioBookById', () => {
      it('returns user-audiobook relationship with relations', async () => {
         const mockUserAudioBook = {
            id: 'ua1',
            userProfileId: 'user1',
            audiobookId: 'book1',
            type: UserAudioBookType.OWNED,
            createdAt: new Date(),
            updatedAt: new Date(),
            userProfile: {
               id: 'user1',
               userId: 'user-123',
               username: 'testuser',
               firstName: 'Test',
               lastName: 'User'
            },
            audiobook: {
               id: 'book1',
               title: 'Test Book',
               author: 'Test Author',
               narrator: 'Test Narrator',
               coverImage: 'image.jpg'
            }
         };

         mockPrisma.userAudioBook.findUnique.mockResolvedValue(mockUserAudioBook);

         const result = await userAudioBookService.getUserAudioBookById('ua1');

         expect(result.id).toBe('ua1');
         expect(result.userProfile).toBeDefined();
         expect(result.audiobook).toBeDefined();
         expect(result.userProfile.username).toBe('testuser');
         expect(result.audiobook.title).toBe('Test Book');
      });

      it('throws error when not found', async () => {
         mockPrisma.userAudioBook.findUnique.mockResolvedValue(null);

         await expect(userAudioBookService.getUserAudioBookById('ua1')).rejects.toBeInstanceOf(ApiError);
      });
   });

   describe('deleteUserAudioBook', () => {
      it('deletes successfully', async () => {
         const mockExisting = {
            id: 'ua1',
            userProfileId: 'user1',
            audiobookId: 'book1',
            type: UserAudioBookType.OWNED,
            createdAt: new Date(),
            updatedAt: new Date()
         };

         mockPrisma.userAudioBook.findUnique.mockResolvedValue(mockExisting);
         mockPrisma.userAudioBook.delete.mockResolvedValue({});

         const result = await userAudioBookService.deleteUserAudioBook('ua1');

         expect(result).toBe(true);
         expect(mockPrisma.userAudioBook.delete).toHaveBeenCalledWith({ where: { id: 'ua1' } });
      });

      it('throws error when not found', async () => {
         mockPrisma.userAudioBook.findUnique.mockResolvedValue(null);

         await expect(userAudioBookService.deleteUserAudioBook('ua1')).rejects.toBeInstanceOf(ApiError);

         expect(mockPrisma.userAudioBook.delete).not.toHaveBeenCalled();
      });
   });

   describe('getUserAudioBooksByUserProfileId', () => {
      it('returns user-audiobook relationships for a user', async () => {
         const mockUserAudioBooks = [
            {
               id: 'ua1',
               userProfileId: 'user1',
               audiobookId: 'book1',
               type: UserAudioBookType.OWNED,
               createdAt: new Date(),
               updatedAt: new Date()
            }
         ];

         mockPrisma.userAudioBook.findMany.mockResolvedValue(mockUserAudioBooks);
         mockPrisma.userAudioBook.count.mockResolvedValue(1);

         const result = await userAudioBookService.getUserAudioBooksByUserProfileId('user1');

         expect(result.userAudioBooks).toHaveLength(1);
         expect(mockPrisma.userAudioBook.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
               where: expect.objectContaining({
                  userProfileId: 'user1'
               })
            })
         );
      });
   });

   describe('getUserAudioBooksByAudiobookId', () => {
      it('returns user-audiobook relationships for an audiobook', async () => {
         const mockUserAudioBooks = [
            {
               id: 'ua1',
               userProfileId: 'user1',
               audiobookId: 'book1',
               type: UserAudioBookType.OWNED,
               createdAt: new Date(),
               updatedAt: new Date()
            }
         ];

         mockPrisma.userAudioBook.findMany.mockResolvedValue(mockUserAudioBooks);
         mockPrisma.userAudioBook.count.mockResolvedValue(1);

         const result = await userAudioBookService.getUserAudioBooksByAudiobookId('book1');

         expect(result.userAudioBooks).toHaveLength(1);
         expect(mockPrisma.userAudioBook.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
               where: expect.objectContaining({
                  audiobookId: 'book1'
               })
            })
         );
      });
   });

   describe('getUserAudioBooksByType', () => {
      it('returns user-audiobook relationships by type', async () => {
         const mockUserAudioBooks = [
            {
               id: 'ua1',
               userProfileId: 'user1',
               audiobookId: 'book1',
               type: UserAudioBookType.OWNED,
               createdAt: new Date(),
               updatedAt: new Date()
            }
         ];

         mockPrisma.userAudioBook.findMany.mockResolvedValue(mockUserAudioBooks);
         mockPrisma.userAudioBook.count.mockResolvedValue(1);

         const result = await userAudioBookService.getUserAudioBooksByType(UserAudioBookType.OWNED);

         expect(result.userAudioBooks).toHaveLength(1);
         expect(mockPrisma.userAudioBook.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
               where: expect.objectContaining({
                  type: UserAudioBookType.OWNED
               })
            })
         );
      });
   });

   describe('Edge cases', () => {
      it('handles empty results', async () => {
         mockPrisma.userAudioBook.findMany.mockResolvedValue([]);
         mockPrisma.userAudioBook.count.mockResolvedValue(0);

         const result = await userAudioBookService.getAllUserAudioBooks({ page: 1, limit: 10 });

         expect(result.userAudioBooks).toHaveLength(0);
         expect(result.totalCount).toBe(0);
      });

      it('handles database errors', async () => {
         const error = new Error('Database connection failed');
         mockPrisma.userAudioBook.findMany.mockRejectedValue(error);

         await expect(userAudioBookService.getAllUserAudioBooks({ page: 1, limit: 10 })).rejects.toThrow(ApiError);
      });
   });
});

