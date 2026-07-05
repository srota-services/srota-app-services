/**
 * Listening history service — user audiobook listening records
 */
import { Prisma, PrismaClient } from '@prisma/client';
import {
   ListeningHistoryQueryParams,
   ListeningHistoryWithAudiobookDto,
   toListeningHistoryWithAudiobookDto,
} from '../models/ListeningHistoryDto';
import { fileUrlService } from './FileUrlService';

const audiobookSelect = {
   id: true,
   title: true,
   author: true,
   narrator: true,
   coverImage: true,
   duration: true,
} as const;

export class ListeningHistoryService {
   constructor(private prisma: PrismaClient) {}

   async getListeningHistoryByUserId(
      userId: string,
      query: ListeningHistoryQueryParams
   ): Promise<{ listeningHistory: ListeningHistoryWithAudiobookDto[]; totalCount: number }> {
      const page = query.page ?? 1;
      const limit = query.limit ?? 20;
      const skip = (page - 1) * limit;
      const sortBy = query.sortBy ?? 'lastListenedAt';
      const sortOrder = query.sortOrder ?? 'desc';

      const where: Prisma.ListeningHistoryWhereInput = { userId };
      if (query.audiobookId) {
         where.audiobookId = query.audiobookId;
      }
      if (query.completed !== undefined) {
         where.completed = query.completed;
      }

      const [rows, totalCount] = await Promise.all([
         this.prisma.listeningHistory.findMany({
            where,
            skip,
            take: limit,
            orderBy: { [sortBy]: sortOrder },
            include: {
               audiobook: {
                  select: audiobookSelect,
               },
            },
         }),
         this.prisma.listeningHistory.count({ where }),
      ]);

      return {
         listeningHistory: await Promise.all(
            rows.map(async row => {
               const dto = toListeningHistoryWithAudiobookDto(row);
               const resolvedMedia = await fileUrlService.resolveNestedAudiobookMedia(dto.audiobook);
               return {
                  ...dto,
                  audiobook: {
                     ...dto.audiobook,
                     ...resolvedMedia,
                  },
               };
            })
         ),
         totalCount,
      };
   }
}
