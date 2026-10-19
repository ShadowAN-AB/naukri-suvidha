import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { StorageProvider } from './StorageProvider.js';
import { env } from '../../config/env.js';

/**
 * Production storage.
 *
 * Render's disk is ephemeral: anything written to it is gone on the next
 * deploy or restart, which would lose every uploaded resume. This is the swap
 * the plan calls for before the first deploy, not during it.
 *
 * Written against the S3 API rather than one vendor, so the same code runs on
 * AWS S3, Cloudflare R2, Backblaze B2 or a local MinIO - set S3_ENDPOINT for
 * anything that is not AWS.
 */
export class S3Storage extends StorageProvider {
  constructor(config) {
    super();
    if (!config.bucket) throw new Error('S3_BUCKET is required when STORAGE_PROVIDER=s3');
    if (!config.accessKeyId || !config.secretAccessKey) {
      throw new Error('S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required');
    }

    this.bucket = config.bucket;
    this.config = config;
    this.client = null;
  }

  /**
   * The SDK is loaded on first use, not at import. Development runs on local
   * disk and should not pay to parse an AWS client it will never call.
   */
  async #s3() {
    if (this.client) return this.client;
    const { S3Client } = await import('@aws-sdk/client-s3');
    this.client = new S3Client({
      region: this.config.region,
      ...(this.config.endpoint ? { endpoint: this.config.endpoint, forcePathStyle: true } : {}),
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
    });
    return this.client;
  }

  async put(buffer, { originalName, mimeType, prefix = 'resumes' }) {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const ext = path.extname(originalName).toLowerCase().slice(0, 10);
    // Same rule as local disk: the key is random and never derived from the
    // uploaded filename.
    const storageKey = `${prefix}/${randomUUID()}${ext}`;

    const client = await this.#s3();
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: buffer,
        ContentType: mimeType,
        // Resumes are personal data. The bucket should be private and reads
        // should go through the API, which checks who is asking.
        ACL: undefined,
      }),
    );

    return { storageKey, sizeBytes: buffer.length };
  }

  async get(storageKey) {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await this.#s3();
    const res = await client.send(new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }));
    return Buffer.from(await res.Body.transformToByteArray());
  }

  async delete(storageKey) {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await this.#s3();
    await client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }));
  }

  async getUrl(storageKey) {
    // Deliberately not a presigned URL: a resume is read through the API so
    // the same access rules apply as everywhere else. A signed link would be
    // forwardable to anyone.
    return `/api/resumes/file/${encodeURIComponent(storageKey)}`;
  }
}

export function createS3Storage() {
  return new S3Storage({
    bucket: env.S3_BUCKET,
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT || undefined,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  });
}
