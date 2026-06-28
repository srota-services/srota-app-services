import fs from 'fs';
import path from 'path';

describe('ApiRouter guest access wiring', () => {
   const apiRouterSource = fs.readFileSync(
      path.resolve(__dirname, '../../routes/ApiRouter.ts'),
      'utf8',
   );

   test('uses blockGuestMutations globally after authenticateJWT', () => {
      const authIdx = apiRouterSource.indexOf('v1Router.use(authenticateJWT)');
      const blockIdx = apiRouterSource.indexOf('v1Router.use(blockGuestMutations())');
      expect(authIdx).toBeGreaterThan(-1);
      expect(blockIdx).toBeGreaterThan(authIdx);
   });

   test('does not mount requireRegisteredUser at router level', () => {
      expect(apiRouterSource).not.toContain('requireRegisteredUser');
   });

   test('mounts catalog routes before catch-all user routers', () => {
      const genresMount = apiRouterSource.indexOf("v1Router.use('/genres'");
      const bookmarksMount = apiRouterSource.indexOf('v1Router.use(\'/\', createBookmarkRoutes');
      expect(genresMount).toBeGreaterThan(-1);
      expect(bookmarksMount).toBeGreaterThan(genresMount);
   });
});
