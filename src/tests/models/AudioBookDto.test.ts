/**
 * AudioBookDto Tests
 * Tests for AudioBook DTO conversion and validation
 */

import {
   CreateAudioBookDto,
   UpdateAudioBookDto,
   AudioBookQueryParams,
   toAudioBookDto,
} from '../../models/AudioBookDto';

describe('AudioBookDto', () => {
   const createMockPrismaAudioBook = (overrides = {}) => {
      return {
         id: 'test-audiobook-id',
         title: 'Test Audiobook',
         author: 'Test Author',
         narrator: 'Test Narrator',
         description: 'Test Description',
         duration: 3600,
         fileSize: BigInt(1024 * 1024 * 500),
         coverImage: 'https://example.com/cover.jpg',
         ownerType: 'ORGANIZATION' as const,
         ownerId: 'org-1',
         language: 'en',
         publisher: 'Test Publisher',
         publishDate: new Date('2024-01-01'),
         isbn: '1234567890123',
         isActive: true,
         isPublic: true,
         subscriptionGatingMode: 'NONE' as const,
         minSubscriptionTier: null,
         isOfflineAvailable: false,
         createdAt: new Date('2024-01-01'),
         updatedAt: new Date('2024-01-02'),
         scheduledAt: null,
         moodId: null,
         audiobookTags: [],
         audioBookGenres: [],
         ...overrides,
      };
   };

   describe('toAudioBookDto', () => {
      it('should convert Prisma AudioBook to DTO with all fields', () => {
         const prismaAudioBook = createMockPrismaAudioBook();

         const result = toAudioBookDto(prismaAudioBook);

         expect(result.id).toBe(prismaAudioBook.id);
         expect(result.title).toBe(prismaAudioBook.title);
         expect(result.author).toBe(prismaAudioBook.author);
         expect(result.owner).toEqual({ type: 'ORGANIZATION', id: 'org-1' });
      });

      it('should map AUTHOR owner type', () => {
         const prismaAudioBook = createMockPrismaAudioBook({
            ownerType: 'AUTHOR',
            ownerId: 'author-1',
         });

         const result = toAudioBookDto(prismaAudioBook);

         expect(result.owner).toEqual({ type: 'AUTHOR', id: 'author-1' });
      });

      it('should handle null optional string fields by converting to undefined', () => {
         const prismaAudioBook = createMockPrismaAudioBook({
            narrator: null,
            description: null,
            coverImage: null,
            publisher: null,
            isbn: null,
         });

         const result = toAudioBookDto(prismaAudioBook);

         expect(result.narrator).toBeUndefined();
         expect(result.description).toBeUndefined();
         expect(result.coverImage).toBeUndefined();
         expect(result.publisher).toBeUndefined();
         expect(result.isbn).toBeUndefined();
      });

      it('should convert BigInt fileSize to Number', () => {
         const largeFileSize = BigInt('9223372036854775807');
         const prismaAudioBook = createMockPrismaAudioBook({
            fileSize: largeFileSize,
         });

         const result = toAudioBookDto(prismaAudioBook);

         expect(result.fileSize).toBe(Number(largeFileSize));
         expect(typeof result.fileSize).toBe('number');
      });

      it('should handle genres when present', () => {
         const mockGenre = {
            id: 'genre-id',
            name: 'Fantasy',
            createdAt: new Date(),
            updatedAt: new Date(),
         };

         const prismaAudioBook = createMockPrismaAudioBook({
            audioBookGenres: [{
               id: 'abg-1',
               audiobookId: 'test-audiobook-id',
               genreId: 'genre-id',
               createdAt: new Date(),
               genre: mockGenre,
            }],
         });

         const result = toAudioBookDto(prismaAudioBook);

         expect(result.genres?.[0]?.name).toBe('Fantasy');
      });
   });

   describe('CreateAudioBookDto', () => {
      it('should accept valid CreateAudioBookDto with required owner', () => {
         const createDto: CreateAudioBookDto = {
            title: 'New Audiobook',
            author: 'New Author',
            owner: { type: 'ORGANIZATION', id: 'org-id' },
            genreIds: ['genre-id'],
         };

         expect(createDto.owner).toEqual({ type: 'ORGANIZATION', id: 'org-id' });
      });

      it('should accept optional fields in CreateAudioBookDto', () => {
         const createDto: CreateAudioBookDto = {
            title: 'New Audiobook',
            author: 'New Author',
            owner: { type: 'AUTHOR', id: 'author-id' },
            narrator: 'Narrator Name',
            genreIds: ['genre-id'],
            language: 'en',
         };

         expect(createDto.owner.type).toBe('AUTHOR');
      });
   });

   describe('UpdateAudioBookDto', () => {
      it('should accept optional owner update', () => {
         const updateDto: UpdateAudioBookDto = {
            owner: { type: 'ORGANIZATION', id: 'org-2' },
         };

         expect(updateDto.owner?.id).toBe('org-2');
      });
   });

   describe('AudioBookQueryParams', () => {
      it('should accept owner filter parameters', () => {
         const params: AudioBookQueryParams = {
            ownerType: 'ORGANIZATION',
            ownerId: 'org-1',
            ownerIds: ['org-1', 'org-2'],
         };

         expect(params.ownerType).toBe('ORGANIZATION');
         expect(params.ownerId).toBe('org-1');
         expect(params.ownerIds).toHaveLength(2);
      });
   });
});
