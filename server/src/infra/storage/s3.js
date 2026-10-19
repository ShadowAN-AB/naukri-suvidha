import { StorageProvider } from './StorageProvider.js';

/**
 * Production storage. Implemented in Phase 7, before the first deploy:
 * Render's disk is ephemeral, so local disk cannot survive a restart there.
 */
export class S3Storage extends StorageProvider {
  constructor() {
    super();
    throw new Error('S3Storage is implemented in Phase 7. Set STORAGE_PROVIDER=local for now.');
  }
}
