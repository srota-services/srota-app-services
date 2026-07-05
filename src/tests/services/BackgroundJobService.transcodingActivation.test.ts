/**
 * BackgroundJobService scheduled chapter activation with transcodingReady gate
 */

import Bull from 'bull';
import { BackgroundJobService } from '../../services/BackgroundJobService';

jest.mock('bull');

describe('BackgroundJobService scheduled chapter activation', () => {
   const mockChapterFindUnique = jest.fn();
   const mockChapterUpdate = jest.fn();
   const mockActivationQueueAdd = jest.fn();
   let activationProcessor: (job: Bull.Job) => Promise<void>;

   beforeEach(() => {
      jest.clearAllMocks();

      (Bull as unknown as jest.Mock).mockImplementation((name: string) => {
         const queue = {
            process: jest.fn((jobName: string, handler: (job: Bull.Job) => Promise<void>) => {
               if (name === 'scheduled-activation' && jobName === 'activate-scheduled') {
                  activationProcessor = handler;
               }
            }),
            add: name === 'scheduled-activation' ? mockActivationQueueAdd : jest.fn(),
            on: jest.fn(),
         };
         return queue;
      });

      mockChapterUpdate.mockResolvedValue({});

      const prisma = {
         chapter: {
            findUnique: mockChapterFindUnique,
            update: mockChapterUpdate,
         },
         audioBook: { update: jest.fn() },
         $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
            fn({
               chapter: { update: mockChapterUpdate },
               audioBook: { update: jest.fn() },
            }),
         ),
      } as unknown as ConstructorParameters<typeof BackgroundJobService>[0];

      new BackgroundJobService(prisma);
   });

   it('defers activation when transcoding is not ready', async () => {
      mockChapterFindUnique.mockResolvedValue({ transcodingReady: false });

      await activationProcessor({
         data: { type: 'chapter', id: 'chapter-1', waitAttempt: 0 },
      } as Bull.Job);

      expect(mockChapterUpdate).not.toHaveBeenCalled();
      expect(mockActivationQueueAdd).toHaveBeenCalledWith(
         'activate-scheduled',
         { type: 'chapter', id: 'chapter-1', waitAttempt: 1 },
         expect.objectContaining({ delay: 30_000 }),
      );
   });

   it('activates chapter when transcoding is ready', async () => {
      mockChapterFindUnique.mockResolvedValue({ transcodingReady: true });

      await activationProcessor({
         data: { type: 'chapter', id: 'chapter-1', waitAttempt: 0 },
      } as Bull.Job);

      expect(mockChapterUpdate).toHaveBeenCalledWith(
         expect.objectContaining({
            where: { id: 'chapter-1' },
            data: { isActive: true, scheduledAt: null },
         }),
      );
      expect(mockActivationQueueAdd).not.toHaveBeenCalled();
   });
});
