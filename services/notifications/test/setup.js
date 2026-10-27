import { afterAll, beforeAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';

import { connectDb, disconnectDb } from '../src/db.js';
import { EventDelivery, Notification } from '../src/model.js';

const models = [Notification, EventDelivery];

beforeAll(async () => {
  // The same guard the other two suites carry, for the same reason: this one
  // drops the database at the end, and a misconfigured env file once pointed a
  // suite at a developer's real one.
  const { env } = await import('../src/env.js');
  const dbName = env.MONGODB_URI.split('/').pop().split('?')[0];
  if (!/test/i.test(dbName)) {
    throw new Error(
      `Refusing to run: the test database is "${dbName}", which does not look like a test database. ` +
        `Set MONGODB_URI in services/notifications/.env.test to something containing "test".`,
    );
  }

  await connectDb();
  await Promise.all(models.map((M) => M.syncIndexes()));
});

beforeEach(async () => {
  await Promise.all(models.map((M) => M.deleteMany({})));
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDb();
});
