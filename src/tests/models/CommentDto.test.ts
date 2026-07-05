import { toCommentDto } from '../../models/CommentDto';

describe('CommentDto', () => {
   it('maps comment fields without embedded user profile', () => {
      const dto = toCommentDto({
         id: 'comment-1',
         userId: 'user-1',
         audiobookId: 'book-1',
         parentId: null,
         content: 'Great narration',
         meta: { position: 120 },
         createdAt: new Date('2024-01-01T00:00:00Z'),
         updatedAt: new Date('2024-01-02T00:00:00Z'),
      });

      expect(dto.userId).toBe('user-1');
      expect(dto.content).toBe('Great narration');
      expect(dto.user).toBeUndefined();
   });
});
