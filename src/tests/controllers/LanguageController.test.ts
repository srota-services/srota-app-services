/**
 * LanguageController Tests
 */
import { PrismaClient } from '@prisma/client';
import { LanguageController } from '../../controllers/LanguageController';
import { LanguageService } from '../../services/LanguageService';
import { ResponseHandler } from '../../utils/ResponseHandler';
import { MessageHandler } from '../../utils/MessageHandler';

jest.mock('../../services/LanguageService');
jest.mock('../../utils/ResponseHandler');
jest.mock('../../utils/MessageHandler');

describe('LanguageController', () => {
   let languageController: LanguageController;
   let mockLanguageService: jest.Mocked<LanguageService>;
   let mockReq: any;
   let mockRes: any;
   let mockNext: jest.Mock;

   beforeEach(() => {
      mockReq = { params: {}, body: {}, originalUrl: '/api/v1/languages' };
      mockRes = {
         status: jest.fn().mockReturnThis(),
         json: jest.fn().mockReturnThis(),
      };
      mockNext = jest.fn();
      (MessageHandler.getSuccessMessage as jest.Mock).mockImplementation((key: string) => key);
      jest.clearAllMocks();

      languageController = new LanguageController({} as PrismaClient);
      mockLanguageService = (languageController as any).languageService;
   });

   it('getAllLanguages returns success response', async () => {
      const languages = [{ id: 'l1', name: 'Bengali', code: 'bn', createdAt: new Date(), updatedAt: new Date() }];
      mockLanguageService.getAllLanguages.mockResolvedValue(languages);

      await languageController.getAllLanguages(mockReq, mockRes, mockNext);

      expect(ResponseHandler.success).toHaveBeenCalledWith(mockRes, languages, 'languages.retrieved');
   });

   it('createLanguage returns 201', async () => {
      mockReq.body = { name: 'Hindi', code: 'hi' };
      const created = { id: 'l2', name: 'Hindi', code: 'hi', createdAt: new Date(), updatedAt: new Date() };
      mockLanguageService.createLanguage.mockResolvedValue(created);

      await languageController.createLanguage(mockReq, mockRes, mockNext);

      expect(ResponseHandler.success).toHaveBeenCalledWith(mockRes, created, 'languages.created', 201);
   });
});
