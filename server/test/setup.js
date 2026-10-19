import { afterAll, beforeAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';

import { connectDb, disconnectDb } from '../src/config/db.js';
import * as models from '../src/models.js';

beforeAll(async () => {
  // Last line of defence. This suite deletes every collection between tests
  // and drops the database at the end, so it must never be pointed at a real
  // one. A misconfigured env file did exactly that once; this makes it loud.
  const { env } = await import('../src/config/env.js');
  const dbName = env.MONGODB_URI.split('/').pop().split('?')[0];
  if (!/test/i.test(dbName)) {
    throw new Error(
      `Refusing to run: the test database is "${dbName}", which does not look like a test database. ` +
        `Set MONGODB_URI in server/.env.test to something containing "test".`,
    );
  }

  await connectDb();
  // Indexes are part of what is under test - deduplication is enforced by one.
  await Promise.all(Object.values(models).map((M) => M.syncIndexes()));
});

beforeEach(async () => {
  // Every test starts from nothing, so order between tests cannot matter.
  await Promise.all(Object.values(models).map((M) => M.deleteMany({})));
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDb();
});
