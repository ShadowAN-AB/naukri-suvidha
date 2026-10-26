import { afterAll, beforeAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';

import { connectDb, disconnectDb } from '../src/db.js';
import { RefreshToken, User } from '../src/model.js';

const models = [User, RefreshToken];

beforeAll(async () => {
  // Last line of defence, kept identical to the API's for the same reason: a
  // misconfigured env file once pointed a suite at a real database, and this
  // suite drops the database at the end.
  const { env } = await import('../src/env.js');
  const dbName = env.MONGODB_URI.split('/').pop().split('?')[0];
  if (!/test/i.test(dbName)) {
    throw new Error(
      `Refusing to run: the test database is "${dbName}", which does not look like a test database. ` +
        `Set MONGODB_URI in services/auth/.env.test to something containing "test".`,
    );
  }

  await connectDb();
  // The unique indexes on email and tokenHash are part of what is under test.
  await Promise.all(models.map((M) => M.syncIndexes()));
});

beforeEach(async () => {
  await Promise.all(models.map((M) => M.deleteMany({})));
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDb();
});
