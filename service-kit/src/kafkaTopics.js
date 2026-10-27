/**
 * Make every topic exist *and* have a leader, whoever gets there first.
 *
 * Shared, and this one earned its place twice over. Both services call it, and
 * two copies of it were both wrong in the same way within an hour of each
 * other.
 *
 * The history is worth keeping, because the obvious implementations all look
 * fine and all fail on a cold cluster:
 *
 * 1. *Subscribe and hope.* `nc -z kafka 9092` passes the moment the broker
 *    binds, which is well before any topic exists, so the first consumer's
 *    metadata request gets `This server does not host this topic-partition`
 *    and `subscribe` throws out of boot. kafkajs marks that error
 *    `retriable: true`, which is what makes it look survivable - nothing
 *    retries at that level.
 *
 * 2. *Let the other service create them.* There is no ordering between pods;
 *    Kubernetes starts them in parallel. Whoever subscribes first loses.
 *
 * 3. *Both call `createTopics({ waitForLeaders: true })`.* This is the subtle
 *    one, and it is why this function is not three lines. `createTopics` is
 *    **not** a silent no-op for a topic that already exists - the broker
 *    returns a per-topic error, kafkajs logs "Topic creation errors", and the
 *    call resolves anyway. Crucially it then does **not** wait for leaders on
 *    the topics it did not create. So two services racing each other both
 *    believe the topics are ready, and the loser subscribes to a partition
 *    whose leader has not been elected yet - and gets the error from (1).
 *
 * So creation and readiness are separated. Create, ignore who won, and then
 * poll the metadata until every partition actually reports a leader. That is
 * true regardless of who created what, which is the only property that
 * survives being started in parallel.
 */
export async function ensureTopics({
  admin,
  events,
  logger,
  numPartitions = 1,
  replicationFactor = 1,
  timeoutMs = 30_000,
  pollMs = 250,
}) {
  if (!events || events.length === 0) return;

  try {
    await admin.connect();

    /*
     * Ask for all of them. A topic that exists comes back as a per-topic
     * error and the call still resolves, so there is nothing useful to branch
     * on here - which is exactly why the wait below is separate rather than
     * `waitForLeaders: true`.
     */
    await admin
      .createTopics({
        topics: events.map((topic) => ({ topic, numPartitions, replicationFactor })),
      })
      .catch((err) => {
        // Only a total failure lands here - an unreachable broker, say. The
        // per-topic "already exists" case resolves.
        logger.warn({ err }, 'createTopics failed; relying on the leader wait');
      });

    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const missing = await leaderlessTopics(admin, events);
      if (missing.length === 0) {
        logger.info({ topics: events.length }, 'topics ready, leaders elected');
        return;
      }
      if (Date.now() > deadline) {
        /*
         * Not fatal, deliberately. A subscribe may still succeed, and a
         * broker that is genuinely unreachable produces a better message from
         * the subscribe than this could. Throwing here would turn a slow
         * broker into a crash loop, which is the thing this exists to stop.
         */
        logger.warn({ missing }, 'gave up waiting for topic leaders; subscribing anyway');
        return;
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
  } finally {
    await admin.disconnect().catch(() => {});
  }
}

/** Topics that do not yet exist, or have a partition with no leader. */
async function leaderlessTopics(admin, events) {
  let metadata;
  try {
    metadata = await admin.fetchTopicMetadata({ topics: events });
  } catch {
    // The usual reason is that a topic does not exist yet, which is precisely
    // what we are waiting for.
    return events;
  }

  const byName = new Map(metadata.topics.map((t) => [t.name, t]));
  return events.filter((name) => {
    const topic = byName.get(name);
    if (!topic || topic.partitions.length === 0) return true;
    // -1 is kafka's "no leader elected".
    return topic.partitions.some((p) => p.leader === undefined || p.leader < 0);
  });
}
