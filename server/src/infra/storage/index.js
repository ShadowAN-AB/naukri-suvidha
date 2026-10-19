import { env } from '../../config/env.js';
import { createLocalDiskStorage } from './localDisk.js';
import { createS3Storage } from './s3.js';

let instance = null;

/** One provider per process, chosen by STORAGE_PROVIDER. */
export function getStorage() {
  if (!instance) {
    instance = env.STORAGE_PROVIDER === 's3' ? createS3Storage() : createLocalDiskStorage();
  }
  return instance;
}

export { StorageProvider } from './StorageProvider.js';
