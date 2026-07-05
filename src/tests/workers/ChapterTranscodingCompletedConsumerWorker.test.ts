/**
 * ChapterTranscodingCompletedConsumerWorker tests
 */

import { ChapterTranscodingCompletedConsumerWorker } from '../../workers/ChapterTranscodingCompletedConsumerWorker';
import { RabbitMQFactory } from '../../config/rabbitmq';
import { ChapterService } from '../../services/ChapterService';

jest.mock('../../config/rabbitmq');
jest.mock('../../services/ChapterService');

describe('ChapterTranscodingCompletedConsumerWorker', () => {
   it('delegates messages to ChapterService.handleTranscodingCompleted', async () => {
      const mockHandle = jest.fn().mockResolvedValue(undefined);
      (ChapterService as jest.Mock).mockImplementation(() => ({
         handleTranscodingCompleted: mockHandle,
      }));

      let capturedHandler: ((message: unknown) => Promise<void>) | undefined;
      (RabbitMQFactory.initialize as jest.Mock).mockResolvedValue(undefined);
      (RabbitMQFactory.getConnection as jest.Mock).mockReturnValue({
         consumeChapterTranscodingCompletedMessages: jest.fn(async (handler) => {
            capturedHandler = handler;
         }),
      });

      const worker = new ChapterTranscodingCompletedConsumerWorker({} as never);
      await worker.start();

      const message = {
         chapterId: 'chapter-1',
         audiobookId: 'book-1',
         bitrates: [64, 128, 256],
         status: 'completed' as const,
         timestamp: new Date().toISOString(),
      };

      await capturedHandler!(message);

      expect(mockHandle).toHaveBeenCalledWith(message);
   });
});
