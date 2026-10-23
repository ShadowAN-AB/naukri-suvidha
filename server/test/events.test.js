import { afterEach, describe, expect, it } from 'vitest';

import { eventBus } from '../src/infra/events/eventBus.js';
import { eventRetryWorker } from '../src/infra/events/retryWorker.js';
import { EventDelivery } from '../src/infra/events/model.js';
import { MAX_DELIVERY_ATTEMPTS } from '../src/infra/events/retry.js';
import { EVENT_DELIVERY_STATUS } from '../src/lib/constants.js';

const unsubscribes = [];
const listen = (event, name, handler) => {
  unsubscribes.push(eventBus.subscribe(event, name, handler));
};

afterEach(() => {
  while (unsubscribes.length) unsubscribes.pop()();
});

/** publish() is fire-and-forget, so wait for the row rather than a promise. */
async function waitForRow(handler, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const row = await EventDelivery.findOne({ handler }).lean();
    if (row) return row;
    if (Date.now() > deadline) throw new Error(`no delivery row for ${handler}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

/** Make a pending row due now, since backoff puts it seconds away. */
const makeDue = (id) =>
  EventDelivery.updateOne({ _id: id }, { $set: { nextAttemptAt: new Date(Date.now() - 1000) } });

describe('subscribing', () => {
  it('insists on a name', () => {
    expect(() => eventBus.subscribe('test.unnamed', '', () => {})).toThrow(/needs a handler name/);
  });

  it('refuses two handlers with the same name', () => {
    listen('test.dup', 'test:dup', () => {});
    expect(() => eventBus.subscribe('test.dup', 'test:dup', () => {})).toThrow(/Duplicate/);
  });
});

describe('a handler that throws', () => {
  it('is recorded instead of disappearing', async () => {
    listen('test.fails', 'test:always-fails', async () => {
      throw new Error('the database blinked');
    });

    eventBus.publish('test.fails', { student: 'abc' });

    const row = await waitForRow('test:always-fails');
    expect(row.status).toBe(EVENT_DELIVERY_STATUS.PENDING);
    expect(row.attempts).toBe(1);
    expect(row.lastError).toMatch(/blinked/);
    expect(row.payload).toEqual({ student: 'abc' });
    // Backoff, not an immediate hot loop.
    expect(new Date(row.nextAttemptAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('does not take the publisher or the other subscribers down', async () => {
    const seen = [];
    listen('test.mixed', 'test:mixed-bad', async () => {
      throw new Error('nope');
    });
    listen('test.mixed', 'test:mixed-good', async () => {
      seen.push('ran');
    });

    expect(() => eventBus.publish('test.mixed', {})).not.toThrow();
    await waitForRow('test:mixed-bad');
    expect(seen).toEqual(['ran']);
  });
});

describe('the retry worker', () => {
  it('runs it again and marks it done when it succeeds', async () => {
    let attempts = 0;
    listen('test.flaky', 'test:flaky', async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('first time unlucky');
    });

    eventBus.publish('test.flaky', { id: 1 });
    const row = await waitForRow('test:flaky');

    await makeDue(row._id);
    await eventRetryWorker.tick();

    const after = await EventDelivery.findById(row._id).lean();
    expect(after.status).toBe(EVENT_DELIVERY_STATUS.DONE);
    expect(attempts).toBe(2);
  });

  it('gives up into the dead-letter end after the last attempt', async () => {
    listen('test.doomed', 'test:doomed', async () => {
      throw new Error('still broken');
    });

    eventBus.publish('test.doomed', { id: 2 });
    const row = await waitForRow('test:doomed');

    // One attempt short of the limit, so this tick is the final one.
    await EventDelivery.updateOne(
      { _id: row._id },
      { $set: { attempts: MAX_DELIVERY_ATTEMPTS - 1, nextAttemptAt: new Date(Date.now() - 1000) } },
    );
    await eventRetryWorker.tick();

    const after = await EventDelivery.findById(row._id).lean();
    expect(after.status).toBe(EVENT_DELIVERY_STATUS.DEAD);
    expect(after.attempts).toBe(MAX_DELIVERY_ATTEMPTS);
    expect(after.lastError).toMatch(/still broken/);
  });

  it('kills a delivery whose handler no longer exists', async () => {
    const row = await EventDelivery.create({
      event: 'test.renamed',
      handler: 'test:handler-that-was-removed',
      payload: {},
      nextAttemptAt: new Date(Date.now() - 1000),
    });

    await eventRetryWorker.tick();

    const after = await EventDelivery.findById(row._id).lean();
    expect(after.status).toBe(EVENT_DELIVERY_STATUS.DEAD);
    expect(after.lastError).toMatch(/No handler registered/);
  });

  it('requeues what a dead process left running', async () => {
    const row = await EventDelivery.create({
      event: 'test.stranded',
      handler: 'test:stranded',
      payload: {},
      status: EVENT_DELIVERY_STATUS.RUNNING,
    });

    await eventRetryWorker.recover();

    const after = await EventDelivery.findById(row._id).lean();
    expect(after.status).toBe(EVENT_DELIVERY_STATUS.PENDING);
  });

  it('reports what is waiting and what gave up', async () => {
    await EventDelivery.create({
      event: 'test.stats',
      handler: 'test:stats',
      status: EVENT_DELIVERY_STATUS.DEAD,
    });
    const stats = await eventRetryWorker.stats();
    expect(stats.dead).toBeGreaterThanOrEqual(1);
    expect(stats).toHaveProperty('pending');
  });
});
