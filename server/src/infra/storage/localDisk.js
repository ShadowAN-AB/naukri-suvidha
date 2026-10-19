import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import { StorageProvider } from './StorageProvider.js';
import { env, paths } from '../../config/env.js';

/**
 * Development storage. Keys are random, never derived from the uploaded
 * filename, so a crafted name cannot escape the upload directory.
 */
export class LocalDiskStorage extends StorageProvider {
  constructor(rootDir) {
    super();
    this.root = path.isAbsolute(rootDir) ? rootDir : path.join(paths.packageRoot, rootDir);
  }

  #resolve(storageKey) {
    const full = path.resolve(this.root, storageKey);
    // Defence in depth: refuse anything that resolves outside the root.
    if (!full.startsWith(path.resolve(this.root) + path.sep)) {
      throw new Error('Invalid storage key');
    }
    return full;
  }

  async put(buffer, { originalName, prefix = 'resumes' }) {
    const ext = path.extname(originalName).toLowerCase().slice(0, 10);
    const storageKey = path.posix.join(prefix, `${randomUUID()}${ext}`);
    const full = this.#resolve(storageKey);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, buffer);
    return { storageKey, sizeBytes: buffer.length };
  }

  async get(storageKey) {
    return fs.readFile(this.#resolve(storageKey));
  }

  async delete(storageKey) {
    await fs.rm(this.#resolve(storageKey), { force: true });
  }

  async getUrl(storageKey) {
    // Local files are streamed back through an authenticated route, not linked.
    return `/api/resumes/file/${encodeURIComponent(storageKey)}`;
  }
}

export function createLocalDiskStorage() {
  return new LocalDiskStorage(env.UPLOAD_DIR);
}
