// Preloaded by `npm run test:server`: keeps expected errors in tests (a missing device, a refused switch) out of the
// test output. The logger's own tests configure it explicitly.
import { configureLogger } from '../../server/logger.js';

configureLogger({ level: 'silent' });
