import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';

import { eventBus } from '../src/infra/events/eventBus.js';
import { OutboxEvent } from '../src/infra/events/model.js';
import { outboxWorker } from '../src/infra/events/outboxWorker.js';
import {
  detectTransactionSupport,
  transactionsAvailable,
  withTransaction,
} from '../src/infra/events/transactions.js';
import { OUTBOX_STATUS } from '../src/lib/constants.js';

/**
 * The outbox, and the fact that it is a capability rather than a requirement.
 *
 * These tests run against whatever mongod the suite is pointed at. A
 * developer's is usually a standalone, CI's is a single-node replica set, and
 * both have to be correct - so the tests that depend on transactions ask
 * first rather than assuming, and the ones that do not are written to work
 * either way.
 */

const unsubscribes = [];
const listen = (event, name, handler) => {
  unsubscribes.push(eventBus.subscribe(event, name, handler));
};

afterEach(() => {
  while (unsubscribes.length) unsubscribes.pop()();
});

beforeAll(async () => {
  await detectTransactionSupport();
});

describe('transaction support detection', () => {
  it('matches what the server actually reports, not the connection string', async () => {
    const { setName } = await mongoose.connection.db.admin().command({ hello: 1 });
    expect(transactionsAvailable()).toBe(Boolean(setName));
  });

  it('runs the body either way, and hands over a session only when it can', async () => {
    let got = 'not called';
    const returned = await withTransaction(async (session) => {
      got = session;
      return 'body ran';
    });

    expect(returned).toBe('body ran');
    if (transactionsAvailable()) {
      expect(got).not.toBeNull();
    } else {
      // The whole point: no replica set, no session, and the caller still works.
      expect(got).toBeNull();
    }
  });
});

describe('publishing with a session', () => {
  it('writes an outbox row instead of delivering immediately', async () => {
    let delivered = 0;
    listen('outbox.test.deferred', 'outbox-test:deferred', () => {
      delivered += 1;
    });

    const session = await mongoose.startSession();
    try {
      await eventBus.publish('outbox.test.deferred', { n: 1 }, { session });
    } finally {
      await session.endSession();
    }

    const row = await OutboxEvent.findOne({ event: 'outbox.test.deferred' }).lean();
    expect(row).toBeTruthy();
    expect(row.status).toBe(OUTBOX_STATUS.PENDING);
    expect(row.payload).toEqual({ n: 1 });

    // Deferred means deferred: the handler must not have run yet.
    expect(delivered).toBe(0);
  });

  it('delivers immediately and writes nothing when there is no session', async () => {
    let delivered = 0;
    listen('outbox.test.direct', 'outbox-test:direct', () => {
      delivered += 1;
    });

    await eventBus.publish('outbox.test.direct', { n: 2 });

    expect(delivered).toBe(1);
    expect(await OutboxEvent.countDocuments({ event: 'outbox.test.direct' })).toBe(0);
  });
});

describe('the outbox worker', () => {
  it('publishes a pending row, marks it published, and stamps the time', async () => {
    const seen = [];
    listen('outbox.test.shipped', 'outbox-test:shipped', (payload) => {
      seen.push(payload);
    });

    await OutboxEvent.create({ event: 'outbox.test.shipped', payload: { id: 'abc' } });

    await outboxWorker.start((event, payload) => eventBus.publishNow(event, payload));
    try {
      await outboxWorker.tick();
    } finally {
      outboxWorker.stop();
    }

    expect(seen).toEqual([{ id: 'abc' }]);

    const row = await OutboxEvent.findOne({ event: 'outbox.test.shipped' }).lean();
    expect(row.status).toBe(OUTBOX_STATUS.PUBLISHED);
    expect(row.publishedAt).toBeInstanceOf(Date);
    expect(row.attempts).toBe(1);
  });

  it('leaves a row pending when delivery throws, rather than killing it', async () => {
    await OutboxEvent.create({ event: 'outbox.test.broken', payload: {} });

    await outboxWorker.start(() => {
      throw new Error('broker is down');
    });
    try {
      await outboxWorker.tick();
    } finally {
      outboxWorker.stop();
    }

    const row = await OutboxEvent.findOne({ event: 'outbox.test.broken' }).lean();
    // There is no `dead` status here on purpose: a dead row would be the lost
    // event the outbox exists to prevent.
    expect(row.status).toBe(OUTBOX_STATUS.PENDING);
    expect(row.attempts).toBe(1);
    expect(row.lastError).toContain('broker is down');
  });

  it('requeues rows a dead process left mid-publish', async () => {
    await OutboxEvent.create({
      event: 'outbox.test.stranded',
      payload: {},
      status: OUTBOX_STATUS.PUBLISHING,
      attempts: 1,
    });

    await outboxWorker.recover();

    const row = await OutboxEvent.findOne({ event: 'outbox.test.stranded' }).lean();
    expect(row.status).toBe(OUTBOX_STATUS.PENDING);
  });

  it('claims oldest first, so events keep their commit order', async () => {
    const order = [];
    listen('outbox.test.ordered', 'outbox-test:ordered', (p) => order.push(p.seq));

    // Written out of order, with createdAt set explicitly so the sort has
    // something unambiguous to work with.
    await OutboxEvent.create({
      event: 'outbox.test.ordered',
      payload: { seq: 2 },
      createdAt: new Date('2026-01-01T00:00:02Z'),
    });
    await OutboxEvent.create({
      event: 'outbox.test.ordered',
      payload: { seq: 1 },
      createdAt: new Date('2026-01-01T00:00:01Z'),
    });

    await outboxWorker.start((event, payload) => eventBus.publishNow(event, payload));
    try {
      await outboxWorker.tick();
    } finally {
      outboxWorker.stop();
    }

    expect(order).toEqual([1, 2]);
  });
});
