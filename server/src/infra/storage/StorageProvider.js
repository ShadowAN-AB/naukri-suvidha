/**
 * Every file the application stores goes through this interface. Phase 4 runs
 * against local disk; Phase 7 swaps in S3 or Cloudinary by changing one env
 * variable, because nothing above this layer knows where bytes actually live.
 *
 * A storageKey is opaque: callers must never build a path from it.
 */
export class StorageProvider {
  /**
   * @param {Buffer} _buffer
   * @param {{ originalName: string, mimeType: string, prefix?: string }} _meta
   * @returns {Promise<{ storageKey: string, sizeBytes: number }>}
   */
  async put(_buffer, _meta) {
    throw new Error('StorageProvider.put is not implemented');
  }

  /** @returns {Promise<Buffer>} */
  async get(_storageKey) {
    throw new Error('StorageProvider.get is not implemented');
  }

  /** @returns {Promise<void>} */
  async delete(_storageKey) {
    throw new Error('StorageProvider.delete is not implemented');
  }

  /** A URL the browser can fetch, signed and time-limited where the backend supports it. */
  async getUrl(_storageKey, _opts) {
    throw new Error('StorageProvider.getUrl is not implemented');
  }
}
