/**
 * Assert the factual claims the system design document makes about this
 * repository.
 *
 * The document is a submittable artifact that was first drafted against a
 * different codebase, so its sections are being retargeted one at a time.
 * The risk is not that a section is vague — it is that a section is
 * *checkably wrong*: an endpoint, an index or a constant that does not
 * exist here. A reader with the repo open finds that in a minute.
 *
 * So every claim a retargeted section makes is pinned here. If someone
 * renames a route or drops an index, this fails and names the section whose
 * prose has just become fiction. It does not read the document — it cannot,
 * the document lives in an artifact — it checks that what the document says
 * is still true of the code.
 *
 *   npm run docs:check
 *
 * Sections covered: §6 Redis, §9 résumé/AI, §11 notifications,
 * §14 reliability & fault tolerance, §15 observability, §18 sequence diagrams,
 * §22 monolith-vs-microservices, plus the document-wide invariants.
 */
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cache = new Map();
/** Set by the old-name invariant so its failure can name the files. */
let offenders = '';

/** Returns '' for a missing file so a claim about it fails rather than throws. */
function read(rel) {
  if (!cache.has(rel)) {
    const abs = path.join(root, rel);
    cache.set(rel, existsSync(abs) ? readFileSync(abs, 'utf8') : '');
  }
  return cache.get(rel);
}

const has = (rel, needle) => read(rel).includes(needle);
const lacks = (rel, needle) => read(rel) !== '' && !read(rel).includes(needle);
const countOf = (rel, needle) => read(rel).split(needle).length - 1;

const AI = 'server/src/modules/ai';
const RES = 'server/src/modules/resumes';
const NOT = 'services/notifications/src';
const AUTH = 'services/auth/src';
const EV = 'server/src/infra/events';
const KIT = 'service-kit/src';
const RT = 'services/realtime/src';

const claims = [
  // ---- document-wide invariants -------------------------------------------
  // Scanned across every tracked text file rather than a couple of entrypoints:
  // the one place the old name actually survived was server/.env.example, which
  // a fresh checkout copies to make its .env — so the narrow check passed while
  // a new setup would still have created a database called after the old name.
  ['invariant', 'the old product name appears in no tracked file',
    () => {
      // `git grep` exits 1 when it matches nothing, which is the passing case
      // here — so the exit code has to be read rather than left to throw.
      const r = spawnSync('git', ['grep', '-ril', '-e', 'nexus', '-e', 'smart-placement',
        '--', '.', ':!package-lock.json', ':!CLAUDE.md', ':!server/scripts/check-design-doc.js'],
        { cwd: root, encoding: 'utf8' });
      if (r.error || r.status === null) return false; // git missing: do not claim a pass
      if (r.status === 1) return true;                // no matches: clean
      if (r.status !== 0) return false;               // a real git failure
      offenders = r.stdout.trim();
      return offenders === '';
    }],
  ['invariant', 'no email/SMTP transport exists (§4.12)',
    () => !existsSync(path.join(root, 'server/src/modules/notifications/email.js'))
       && !/nodemailer/i.test(read('server/package.json'))],
  ['invariant', 'no conversational assistant route exists (§4.12)',
    () => lacks(`${AI}/routes.js`, "'/ask'") && lacks(`${AI}/routes.js`, 'ChatMessage')],
  ['invariant', 'the transactional outbox exists and every publish site uses it',
    () => {
      // §7.7 claims all eight sites are converted, so a bare publish with no
      // session would make that false - and would silently reopen the window
      // for whichever event it was.
      const r = spawnSync('git', ['grep', '-c', 'eventBus.publish(', '--',
        'server/src/modules'], { cwd: root, encoding: 'utf8' });
      if (r.status !== 0) return false;
      const total = r.stdout.trim().split('\n')
        .reduce((n, line) => n + Number(line.split(':').pop()), 0);
      return total === 8 && has(`${EV}/transactions.js`, 'withTransaction');
    }],

  // Counts the document states in prose. These are the claims that rot most
  // quietly - nobody re-counts a collection list - so the numbers the
  // document gives are pinned here, and adding one without updating §1, §2.7,
  // §8.1, §22 and §23 fails the build.
  // Counted across all three services. `users` and `refreshTokens` moved to
  // the auth service and `notifications` to the notifications service, each in
  // its own database - so the API's barrel holds eleven while the *system*
  // still has fourteen, which is what the document says. Counting one side
  // would silently "lose" the three that only moved.
  ['counts', '§1 and §8 say fourteen collections, across three services',
    () => {
      const names = (rel) =>
        (read(rel).match(/^export \{([^}]*)\}/gm) || [])
          .join(',').replace(/export \{|\}/g, '')
          .split(',').map((x) => x.trim()).filter(Boolean);
      const api = names('server/src/models.js');
      // The two services register theirs directly rather than re-exporting,
      // so they are counted by their mongoose.model calls. The notifications
      // service registers EventDelivery too, which is its retry queue and not
      // one of the fourteen, so Notification is counted on its own.
      const auth = countOf(`${AUTH}/model.js`, 'mongoose.model(');
      const notif = countOf(`${NOT}/model.js`, "mongoose.model('Notification'");
      return api.length === 11 && auth === 2 && notif === 1
          && api.length + auth + notif === 14;
    }],
  // Fourteen, across three services. The glob has to name every service's
  // test directory: it listed only two when notifications was extracted, so
  // the count stayed at thirteen and passed while there were fourteen - the
  // exact rot this check exists to catch, in the check itself.
  ['counts', '§1 says 15 test files, across four services',
    () => {
      // `git ls-files` lists the *tracked* tree, so a new suite does not
      // count until it is committed - which means this claim passes right up
      // to the commit that should have updated it and fails immediately
      // after. Two other claims here have the same property (`git grep` for
      // the absent rate-limit option, `git ls-tree` for the service count),
      // and all three have now bitten exactly once. A docs:check run before
      // committing is not evidence about the committed tree.
      const r = spawnSync('git',
        ['ls-files', 'server/test/*.test.js', 'services/*/test/*.test.js'],
        { cwd: root, encoding: 'utf8' });
      return r.status === 0 && r.stdout.trim().split('\n').length === 15;
    }],

  // ---- §6 Redis & caching --------------------------------------------------
  ['§6', 'the cache picks redis or memory behind one interface',
    () => has('server/src/infra/cache/index.js', 'redisEnabled() ? new RedisCache() : new MemoryCache()')],
  ['§6', 'admin:analytics is the cache key',
    () => has('server/src/modules/admin/service.js', "ANALYTICS_KEY = 'admin:analytics'")],
  ['§6', 'the analytics TTL is 60s',
    () => has('server/src/modules/admin/service.js', 'ANALYTICS_TTL_SECONDS = 60')],
  ['§6', 'a cache read failure is treated as a miss',
    () => has('server/src/infra/cache/redis.js', 'treating as a miss')],
  ['§6', 'clear() is prefix-scoped (scanStream), never FLUSHDB',
    () => has('server/src/infra/cache/redis.js', 'scanStream')
       && !/redis\.(flushdb|flushall)\s*\(/i.test(read('server/src/infra/cache/redis.js'))],
  ['§6', 'the global /api limit is 300 per minute',
    () => has('server/src/app.js', 'limit: 300')],
  // In the auth service since step 5, along with login itself. The store they
  // are built from is service-kit's, so both services share the one that is
  // shared across replicas.
  ['§6', 'login is 5 per minute and counts failures only',
    () => has(`${AUTH}/rateLimit.js`, 'limit: 5')
       && has(`${AUTH}/rateLimit.js`, 'skipSuccessfulRequests: true')],
  ['§6', 'registration is 40 per hour and skips failures',
    () => has(`${AUTH}/rateLimit.js`, 'limit: 40')
       && has(`${AUTH}/rateLimit.js`, 'skipFailedRequests: true')],
  ['§6', 'there is no forgot-password route to rate limit',
    () => lacks(`${AUTH}/routes.js`, 'forgot-password')],
  // Both in service-kit since step 5: the auth service shares the login rate
  // limit across its own replicas, so it needs this connection too, and these
  // two bounds are each a crash that a second copy would reintroduce. Pinned
  // against the kit rather than the thin per-service constructor, because a
  // file that no longer holds the flag would pass `lacks` vacuously.
  ['§6', 'the ioredis offline queue is left enabled',
    () => lacks(`${KIT}/redis.js`, 'enableOfflineQueue: false')
       && has(`${KIT}/redis.js`, 'maxRetriesPerRequest: 2')],
  ['§6', 'the pub/sub pair is unbounded, unlike the main connection',
    () => has(`${KIT}/redis.js`, 'duplicate({ maxRetriesPerRequest: null })')
       && has(`${KIT}/redis.js`, 'maxRetriesPerRequest: 2')],
  ['§6', 'no distributed locks are used',
    () => !/lock:(apply|schedule|analyze|rollup)/.test(
      read('server/src/modules/applications/service.js') + read('server/src/modules/interviews/service.js'))],
  ['§6', 'the refresh token is an httpOnly cookie, not a Redis key',
    // In service-kit since the auth service was extracted: it mints these and
    // the API verifies them, so one definition of a session is the point. The
    // claim the document makes is unchanged - only where it is true moved.
    () => has(`${KIT}/tokens.js`, 'httpOnly: true')
       && has(`${KIT}/tokens.js`, "REFRESH_COOKIE = 'naukri_suvidha_rt'")],
  ['§6', 'duplicate applies are stopped by a unique index',
    () => has('server/src/modules/applications/model.js', 'jobId: 1, studentId: 1 }, { unique: true')],

  // ---- §7 message broker --------------------------------------------------
  ['§7', 'exactly seven domain events exist',
    () => {
      // In service-kit since notifications was extracted: the event name is
      // the Kafka topic, so it is a contract between two processes.
      const m = read(`${KIT}/events.js`).match(/EVENTS = Object\.freeze\(\{([\s\S]*?)\}\)/);
      return m ? m[1].split('\n').filter((l) => l.includes(':')).length === 7 : false;
    }],
  ['§7', 'the seven event names are the ones the table lists',
    () => ["RESUME_UPLOADED: 'resume.uploaded'", "RESUME_PROCESSED: 'resume.processed'",
           "JOB_CREATED: 'job.created'", "JOB_APPROVED: 'job.approved'",
           "APPLICATION_SUBMITTED: 'application.submitted'",
           "APPLICATION_STATUS_CHANGED: 'application.status_changed'",
           "INTERVIEW_SCHEDULED: 'interview.scheduled'"]
      .every((e) => has(`${KIT}/events.js`, e))],
  // Eight across two services now. The API's AI worker subscribes on its own
  // bus; the notifications service registers handlers with its consumer-only
  // `on()`. Different call, same contract - the name becomes the group id.
  ['§7', 'exactly eight named subscribers exist, across two services',
    () => countOf(`${AI}/worker.js`, 'eventBus.subscribe') === 3
       && countOf(`${NOT}/consumers.js`, '  on(') === 5],
  ['§7', 'the subscriber names are the ones that become consumer groups',
    () => ["'ai:resume-uploaded'", "'ai:job-approved'", "'ai:resume-processed'"]
            .every((n) => has(`${AI}/worker.js`, n))
       && ["'notifications:job-approved'", "'notifications:application-submitted'",
           "'notifications:application-status-changed'", "'notifications:resume-processed'",
           "'notifications:interview-scheduled'"]
            .every((n) => has(`${NOT}/consumers.js`, n))],
  ['§7', 'job.created is published and has no subscriber',
    () => has('server/src/modules/jobs/service.js', 'EVENTS.JOB_CREATED')
       && !has(`${AI}/worker.js`, 'JOB_CREATED') && !has(`${NOT}/consumers.js`, 'JOB_CREATED')],
  ['§7', 'resume.processed is published by ai and consumed by ai',
    () => has(`${AI}/worker.js`, 'EVENTS.RESUME_PROCESSED')
       && has(`${AI}/worker.js`, "'ai:resume-processed'")],
  ['§7', 'interview.scheduled is published from two sites, and there is no rescheduled event',
    () => countOf('server/src/modules/interviews/service.js', 'EVENTS.INTERVIEW_SCHEDULED') === 2
       && !has('server/src/lib/constants.js', 'interview.rescheduled')],
  ['§7', 'a duplicate subscriber name throws',
    () => has(`${EV}/eventBus.js`, 'Duplicate event handler name')],
  ['§7', 'the group id is the subscriber name with colons rewritten to dots',
    // Derived in service-kit: the API's producer and the notifications
    // service's consumer must reach the same group id for a handler name.
    () => has(`${KIT}/events.js`, "handlerName.replace(/:/g, '.')")
       && has(`${EV}/kafka.js`, 'groupIdFor(name)')],
  ['§7', 'no module imports another module\'s service',
    () => {
      const r = spawnSync('git', ['grep', '-l', "from '../", '--',
        'server/src/modules/*/service.js'], { cwd: root, encoding: 'utf8' });
      if (r.status === 1) return true;
      if (r.status !== 0) return false;
      // Cross-module imports are allowed for models, not services.
      return !/from '\.\.\/[a-z]+\/service\.js'/.test(
        r.stdout.trim().split('\n').map((f) => read(f)).join('\n'));
    }],
  ['§7', 'cross-module coupling is model imports, as the section says',
    () => has('server/src/modules/jobs/service.js', "from '../ai/model.js'")
       && has('server/src/modules/applications/service.js', "from '../admin/model.js'")],
  ['§7', 'consumers start in parallel, not serially',
    () => has(`${EV}/eventBus.js`, 'Promise.all')],
  // Each service registers before it starts its transport, because the
  // consumer groups are built from the registered handlers.
  ['§7', 'each service registers its subscribers before starting its transport',
    () => read('server/src/server.js').indexOf('aiWorker.start()')
          < read('server/src/server.js').indexOf('eventBus.startTransport()')
       && read(`${NOT}/server.js`).indexOf('registerConsumers()')
          < read(`${NOT}/server.js`).indexOf('startConsumers()')],
  ['§7', 'the producer creates every event topic, not just the ones it consumes',
    // Derived from handlers until notifications moved out: that service
    // subscribes to two topics nothing here listens to, so deriving would
    // leave them uncreated and lose the cold-start race.
    () => has(`${EV}/eventBus.js`, 'ensureTopics(Object.values(EVENTS))')],
  ['§7', 'produceAndWait throws, so the outbox worker can retry',
    () => has(`${EV}/kafka.js`, 'export async function produceAndWait')
       && !has(`${EV}/kafka.js`, 'export function produce(')],
  ['§7', 'a direct publish still only logs, and says the event was lost',
    () => has(`${EV}/eventBus.js`, 'publish failed outside a transaction; event lost')],
  ['§7', 'publish writes an outbox row when given a session',
    () => has(`${EV}/eventBus.js`, "OutboxEvent.create([{ event, payload }], { session })")],
  ['§7', 'transaction support is detected from the server, not the URI',
    () => has(`${EV}/transactions.js`, 'command({ hello: 1 })')],
  ['§7', 'withTransaction runs the body with no session when there are none',
    () => has(`${EV}/transactions.js`, 'if (!transactionsAvailable()) return fn(null)')],
  ['§7', 'the outbox claims oldest-first, preserving commit order',
    () => has(`${EV}/outboxWorker.js`, 'sort: { createdAt: 1 }')],
  ['§7', 'the outbox claim is gated on a due time, or a failed row hot-loops',
    () => has(`${EV}/outboxWorker.js`, 'nextAttemptAt: { $lte: new Date() }')],
  ['§7', 'there is no dead status on an outbox row',
    () => !/OUTBOX_STATUS\.DEAD/.test(read(`${EV}/outboxWorker.js`))
       && !has('server/src/lib/constants.js', "DEAD: 'dead',\n  PUBLISH")],
  ['§7', 'stranded publishing rows are requeued at boot',
    () => has(`${EV}/outboxWorker.js`, 'requeued stranded outbox events')],
  ['§7', 'retry is 5 attempts with the stated backoff, ending dead',
    () => has(`${KIT}/events.js`, 'MAX_DELIVERY_ATTEMPTS = 5')
       && has(`${KIT}/events.js`, '10s, 20s, 40s, 80s, 160s')],
  ['§7', 'every service waits for topic leaders before subscribing',
    // In service-kit, and no longer `waitForLeaders: true` - that flag skips
    // the topics it did not create, so two services racing each other both
    // believe the topics are ready and the loser subscribes to a leaderless
    // partition. Creation and readiness are separated now.
    () => has(`${KIT}/kafkaTopics.js`, 'leaderlessTopics')
       && has(`${KIT}/kafkaTopics.js`, 'fetchTopicMetadata')
       && has(`${EV}/kafka.js`, 'ensureTopicsShared')
       && has(`${NOT}/consumer.js`, 'ensureOwnTopics')],

  // ---- §9 résumé & AI ------------------------------------------------------
  ['§9', 'the five résumé endpoints exist',
    () => ["router.post('/'", "router.get('/search'", "router.get('/'",
           "router.get('/:id/file'", "router.get('/:id/text'"]
      .every((r) => has(`${RES}/routes.js`, r))],
  ['§9', 'the four ai endpoints exist',
    () => ["router.get('/health'", "router.get('/tasks'",
           "router.post('/rescore'", "router.post('/reembed'"]
      .every((r) => has(`${AI}/routes.js`, r))],
  ['§9', '/api/ai/health is open (no requireAuth on that route)',
    () => /router\.get\('\/health',\s*async/.test(read(`${AI}/routes.js`))],
  ['§9', 'the three AiTask types exist',
    () => ['EXTRACT_RESUME', 'SCORE_FIT', 'EMBED_RESUME']
      .every((t) => has('server/src/lib/constants.js', t))],
  ['§9', 'AiTask has five statuses including dead',
    () => ["QUEUED: 'queued'", "RUNNING: 'running'", "DONE: 'done'",
           "FAILED: 'failed'", "DEAD: 'dead'"]
      .every((s) => has('server/src/lib/constants.js', s))],
  ['§9', 'the worker runs at AI_CONCURRENCY and claims atomically',
    () => has(`${AI}/worker.js`, 'new PQueue({ concurrency: env.AI_CONCURRENCY')
       && has(`${AI}/worker.js`, 'AiTask.findOneAndUpdate')],
  ['§9', 'extraction makes exactly two attempts',
    () => has(`${AI}/extract.js`, 'for (const attempt of [1, 2])')
       && has(`${AI}/extract.js`, 'safeParse')],
  ['§9', 'a non-retryable provider error skips the second attempt',
    () => has(`${AI}/extract.js`, 'err.retryable === false')],
  ['§9', 'fallback scores are capped by the shared constant and flagged',
    () => has(`${AI}/fallback.js`, 'Math.min(FALLBACK_SCORE_CAP')
       && has(`${AI}/fallback.js`, "from '@naukri-suvidha/shared'")
       && has(`${AI}/model.js`, 'fallback: { type: Boolean')],
  ['§9', 'FitScore is unique per student+job',
    () => has(`${AI}/model.js`, 'index({ studentId: 1, jobId: 1 }, { unique: true })')],
  ['§9', 'the heavy résumé fields are select:false',
    () => has(`${RES}/model.js`, 'extractedText: { type: String, select: false }')
       && has(`${RES}/model.js`, 'embedding: { type: [Number], select: false')],
  ['§9', 'search narrows the corpus before ranking',
    () => has(`${RES}/search.js`, 'before ranking')
       && has(`${RES}/search.js`, 'Job.find({ companyId: company._id }).distinct')],
  ['§9', 'the four pluggable infra interfaces exist',
    () => ['storage/StorageProvider', 'llm/LLMProvider',
           'embeddings/EmbeddingProvider', 'vector/VectorIndex']
      .every((f) => existsSync(path.join(root, `server/src/infra/${f}.js`)))],

  // ---- §11 notifications ---------------------------------------------------
  ['§11', 'the three notification endpoints exist',
    () => ["router.get('/'", "router.post('/read-all'", "router.post('/:id/read'"]
      .every((r) => has(`${NOT}/routes.js`, r))],
  ['§11', 'there are exactly five named subscribers',
    () => countOf(`${NOT}/consumers.js`, '  on(') === 5],
  ['§11', 'the notifications service publishes nothing',
    // It is a pure consumer: no producer, no outbox, nothing to commit an
    // event with. Its consumer.js has no produce path at all.
    () => lacks(`${NOT}/consumer.js`, '.producer(')
       && lacks(`${NOT}/consumer.js`, 'produceAndWait')
       && lacks(`${NOT}/consumers.js`, 'publish(')],
  ['§11', 'its handlers read nothing but their event',
    // The property the extraction rests on. There are no students, jobs or
    // companies in its database, so a handler that reached for one would be a
    // runtime error - this keeps it from being reintroduced.
    () => lacks(`${NOT}/consumers.js`, 'findById')
       && lacks(`${NOT}/consumers.js`, 'findOne')],
  ['§11', 'the enum holds exactly the four current types',
    () => ["JOB_APPROVED: 'job.approved'", "APPLICATION_STATUS: 'application.status'",
           "RESUME_PROCESSED: 'resume.processed'", "INTERVIEW_SCHEDULED: 'interview.scheduled'"]
      .every((t) => has(`${NOT}/constants.js`, t))],
  ['§11', 'both Notification indexes exist',
    () => has(`${NOT}/model.js`, 'index({ userId: 1, createdAt: -1 })')
       && has(`${NOT}/model.js`, 'index({ userId: 1, readAt: 1 })')],
  ['§11', 'read state is a nullable date, not a boolean',
    () => has(`${NOT}/model.js`, 'readAt: { type: Date, default: null }')],
  ['§11', 'retry is 5 attempts with 10s/20s/40s/80s/160s backoff',
    () => has(`${KIT}/events.js`, 'MAX_DELIVERY_ATTEMPTS = 5')
       && has(`${KIT}/events.js`, '10s, 20s, 40s, 80s, 160s')],
  ['§11', 'stranded deliveries are requeued at boot',
    // The worker is in service-kit: both services keep their own retry queue
    // in their own database and run the same logic over it.
    () => has(`${KIT}/retryWorker.js`, 'requeued stranded deliveries')],
  ['§11', 'sockets join one room per user and carry three events',
    // The room format is a cross-service contract, and more so since the
    // gateway was extracted: the API and notifications both address rooms
    // they do not hold, through the Redis adapter. A local rename in the
    // realtime service would stop both their pushes arriving with nothing
    // failing in either process.
    () => has(`${KIT}/constants.js`, 'roomForUser = (userId)')
       && has(`${RT}/sockets.js`, 'socket.join(roomForUser(userId))')
       && ["NOTIFICATION_NEW: 'notification:new'", "APPLICATION_STATUS: 'application:status'",
           "RESUME_PROCESSED: 'resume:processed'"]
         .every((e) => has(`${KIT}/constants.js`, e))],

  // ---- §14 reliability & fault tolerance ----------------------------------
  // Retargeted 29 Oct 2026. This section had the most checkably wrong fact in
  // the document - it specified `/healthz` and `/readyz`, which this repository
  // has never served - and around that it described circuit breakers, an
  // `X-Deadline-Ms` header, `X-Degraded`, PodDisruptionBudgets, anti-affinity,
  // a three-node replica set, a Redis cluster and three brokers. None of it
  // exists, so four of the nine claims below are *absence* claims: adding any
  // of those things makes the section's prose false, and the section is worth
  // nothing if it cannot be trusted about what the system does not do.
  ['§14', 'no /healthz or /readyz is served anywhere',
    () => {
      // The whole reason this section was next. If someone adds either path,
      // the section's correction ("this repository has never served either")
      // becomes a lie and the probe matrix is wrong too.
      const r = spawnSync('git', ['grep', '-l', '-E', 'healthz|readyz', '--',
        'server/src', 'services', 'client/src', 'infra', 'service-kit/src',
        'docker-compose.yml', ':!server/scripts/check-design-doc.js'],
        { cwd: root, encoding: 'utf8' });
      if (r.error || r.status === null) return false; // git missing
      return r.status === 1;                          // no matches: clean
    }],
  ['§14', 'no circuit breaker, deadline header or degraded header exists',
    () => {
      // `deadline` on its own is excluded deliberately: a Job has an
      // application deadline, which is a different sense of the word and
      // would make this claim fail on an unrelated field.
      const r = spawnSync('git', ['grep', '-l', '-E',
        'opossum|CircuitBreaker|X-Deadline|x-deadline|X-Degraded|x-degraded',
        '--', 'server/src', 'services', 'client/src', 'infra', 'service-kit/src',
        'package.json', '*/package.json', 'services/*/package.json'],
        { cwd: root, encoding: 'utf8' });
      if (r.error || r.status === null) return false;
      return r.status === 1;
    }],
  ['§14', 'no PodDisruptionBudget and no anti-affinity rule exist',
    // §14.7 says pod spread is a *preference* and that there are no budgets.
    // Adding either would make the redundancy table understate the system.
    () => {
      const r = spawnSync('git', ['grep', '-l', '-E',
        'PodDisruptionBudget|podAntiAffinity|affinity:', '--', 'infra'],
        { cwd: root, encoding: 'utf8' });
      if (r.error || r.status === null) return false;
      return r.status === 1;
    }],
  ['§14', 'the rate limiter degrades to a per-process counter, not to no limit',
    // Both halves matter and the absence half is the easier one to lose.
    // `passOnStoreError: true` is the one-line "fix" that makes a Redis
    // outage mean *unlimited* password guessing on /login - the limiter
    // stops failing requests by stopping being a limiter. §14.4 says the
    // outage degrades a shared limit to a per-process one, so the fallback
    // store has to be there AND that option has to stay away.
    () => {
      // Scoped to the two files that construct limiters, which is the only
      // place the option has any effect - and it has to be scoped, because
      // `rateLimitStore.js` explains in prose why the option is banned. A
      // grep over all of src counted that explanation as a violation, which
      // is how this claim failed on the commit that introduced it. Same
      // lesson as §15's package.json-only search: an absence claim has to
      // search where the thing would *act*, not where it is discussed.
      const r = spawnSync('git', ['grep', '-l', 'passOnStoreError', '--',
        'server/src/app.js', 'services/*/src/rateLimit.js'],
        { cwd: root, encoding: 'utf8' });
      if (r.error || r.status === null) return false;
      if (r.status !== 1) return false; // the option is in use: §14.4 is wrong
      return has(`${KIT}/rateLimitStore.js`, 'class FallbackRateLimitStore')
          && has(`${KIT}/redis.js`, 'new FallbackRateLimitStore(')
          // Gating on the connection state rather than on a failed command is
          // what keeps an outage from costing ~15s a request, which was long
          // enough for the limiter's own window to expire underneath it.
          && has(`${KIT}/redis.js`, "status === 'ready'");
    }],
  ['§14', 'liveness is a TCP check in all three Deployments, readiness is HTTP',
    // The section's central probe argument: liveness failing means "kill this
    // container", so pointing it at a dependency check would turn one mongo
    // blip into a restart of every replica at once.
    () => [['infra/k8s/api.yaml', '/api/health'],
           ['infra/k8s/auth.yaml', '/health'],
           ['infra/k8s/notifications.yaml', '/health']]
      .every(([f, path]) => /livenessProbe:\s*\n(?:\s*#[^\n]*\n)*\s*tcpSocket:/.test(read(f))
                         && has(f, `path: ${path}`))],
  ['§14', 'rolling updates are maxUnavailable: 0 with a 5s preStop, and the '
        + 'notifications grace period is the longest',
    () => ['infra/k8s/api.yaml', 'infra/k8s/auth.yaml', 'infra/k8s/notifications.yaml']
      .every((f) => has(f, 'maxUnavailable: 0') && has(f, "'sleep 5'"))
       && has('infra/k8s/api.yaml', 'terminationGracePeriodSeconds: 30')
       && has('infra/k8s/auth.yaml', 'terminationGracePeriodSeconds: 30')
       // 45, because a SIGTERM can land mid-handler and leaving the consumer
       // group cleanly is what stops the survivor waiting out a session
       // timeout before it takes the partitions.
       && has('infra/k8s/notifications.yaml', 'terminationGracePeriodSeconds: 45')],
  ['§14', 'the three retry queues keep the attempt caps and curves §14.3 states',
    () => has(`${EV}/outboxWorker.js`, 'const MAX_PUBLISH_ATTEMPTS = 10')
       // 2s floor, 60s ceiling: the fast path for every event.
       && has(`${EV}/outboxWorker.js`, '60_000')
       && has(`${KIT}/events.js`, 'MAX_DELIVERY_ATTEMPTS = 5')
       // 10s, 20s, 40s, 80s, 160s under a ten-minute ceiling: a long-stop.
       && has(`${KIT}/events.js`, 'BASE_MS = 5_000')
       && has(`${KIT}/events.js`, 'CEILING_MS = 10 * 60_000')
       && /AI_TASK_MAX_ATTEMPTS:[^\n]*default\(3\)/.test(read('server/src/config/env.js'))],
  ['§14', 'the timeouts §14.2 tabulates are the ones in the code',
    // The 2s introspection budget lives in the realtime service now - it went
    // with the sockets, and the API no longer calls auth at all. The 3s is
    // auth's own budget for its two calls into the API, which §14.2 had
    // labelled with the API's variable and the wrong direction.
    () => /AUTH_SERVICE_TIMEOUT_MS:[^\n]*default\(2000\)/.test(read(`${RT}/env.js`))
       && /API_INTERNAL_TIMEOUT_MS:[^\n]*default\(3000\)/.test(read(`${AUTH}/env.js`))
       && !has('server/src/config/env.js', 'AUTH_SERVICE_URL:')
       && /AI_TIMEOUT_MS:[^\n]*default\(30_000\)/.test(read('server/src/config/env.js'))
       && ['server/src/config/db.js', `${AUTH}/db.js`, `${NOT}/db.js`]
            .every((f) => has(f, 'serverSelectionTimeoutMS: 10_000'))
       && has(`${KIT}/redis.js`, 'maxRetriesPerRequest: 2')
       // The 2s introspection subrequest, in both edges: the one synchronous
       // crossing on the request path, and the tightest budget in the system.
       && ['infra/nginx/default.conf.template', 'infra/k8s/edge-nginx.conf.template']
            .every((f) => /proxy_read_timeout\s+2s;/.test(read(f))
                       && /proxy_read_timeout\s+3600s;/.test(read(f)))],
  ['§14', 'the data tier is one instance each, and the replica set is single-node',
    // §14.7's headline: below the application tier nothing is redundant. The
    // replica set exists for transactions, not availability - one node.
    () => ['infra/k8s/mongo.yaml', 'infra/k8s/redis.yaml', 'infra/k8s/kafka.yaml']
      .every((f) => has(f, 'replicas: 1'))
       && has('infra/k8s/mongo.yaml', "'--replSet', 'rs0'")
       && has('docker-compose.yml', "'--replSet', 'rs0'")
       // A preference, not a rule: on one cold bring-up it held, on another
       // all four pods landed on one node. Both are correct behaviour.
       && has('infra/k8s/api.yaml', 'whenUnsatisfiable: ScheduleAnyway')],

  // ---- §15 observability --------------------------------------------------
  // Retargeted 29 Oct 2026. It was the last section describing a stack that is
  // not installed - Prometheus, Grafana, Loki, OpenTelemetry, Tempo, Sentry,
  // alerting - and it stayed wrong precisely because nothing here checked it.
  // The absence claims matter more than the presence ones: a dependency added
  // later makes the section's "what is not built" table a lie, and that is the
  // kind of lie a reader with the repository open finds first.
  ['§15', 'no metrics, tracing or error-tracking tooling is installed',
    () => {
      // package.json only - the lockfile carries @opentelemetry/api
      // transitively via vitest and the Anthropic SDK, which the section says
      // so a grep of the lockfile is not evidence either way.
      const r = spawnSync('git', ['grep', '-l', '-E',
        'prom-client|@sentry/|@opentelemetry/(sdk|auto|exporter)|jaeger-client|opossum',
        '--', 'package.json', '*/package.json', 'services/*/package.json'],
        { cwd: root, encoding: 'utf8' });
      if (r.error || r.status === null) return false; // git missing
      return r.status === 1;                          // no matches: clean
    }],
  ['§15', 'no service exposes an application /metrics route',
    () => {
      const r = spawnSync('git', ['grep', '-l', "'/metrics'", '--',
        'server/src', 'services'], { cwd: root, encoding: 'utf8' });
      if (r.error || r.status === null) return false;
      return r.status === 1;
    }],
  ['§15', 'one logger, and it removes credentials rather than masking them',
    () => has(`${KIT}/logger.js`, "'req.headers.authorization'")
       && has(`${KIT}/logger.js`, "'*.passwordHash'")
       && has(`${KIT}/logger.js`, 'remove: true')],
  ['§15', 'the request id is honoured from an incoming header, not only minted',
    // This is what makes it cross a process boundary: the edge stamps it and
    // every service downstream keeps it.
    () => has(`${KIT}/requestId.js`, "req.get('x-request-id')")
       && has('infra/nginx/default.conf.template', 'X-Request-ID')
       && has('infra/k8s/edge-nginx.conf.template', 'X-Request-ID')],
  ['§15', 'all five health endpoints exist',
    () => has('server/src/app.js', "app.get('/api/health'")
       && has(`${AI}/routes.js`, "router.get('/health'")
       && has(`${AUTH}/app.js`, "app.get('/health'")
       && has(`${NOT}/app.js`, "app.get('/health'")
       && has(`${RT}/app.js`, "app.get('/health'")],
  ['§15', 'readiness answers 503 on an unreachable db - in every service that has one',
    () => ['server/src/app.js', `${AUTH}/app.js`, `${NOT}/app.js`]
      .every((f) => has(f, 'res.status(db ? 200 : 503)'))
       // realtime owns no data, so it has no db to be unreachable and must
       // not pretend otherwise: pulling it from the Service would drop every
       // open socket. The absence is the claim.
       && !has(`${RT}/app.js`, 'res.status(db ? 200 : 503)')],
  ['§15', 'the notifications health endpoint reports the broker and the push path',
    // The one service that can be completely healthy and useless, so its
    // health endpoint has to say more than "db up".
    () => has(`${NOT}/app.js`, "'no broker configured'")
       && has(`${NOT}/app.js`, "'via the redis adapter'")],
  ['§15', 'three queues keep a terminal state rather than only logging a failure',
    () => has('server/src/lib/constants.js', "DEAD: 'dead'")
       && has(`${KIT}/events.js`, "DEAD: 'dead'")
       && has(`${EV}/outboxWorker.js`, 'stuck')],

  // ---- §22 monolith vs microservices --------------------------------------
  // Retargeted 29 Oct 2026. It argued for the monolith with the extraction as
  // future work; two services are out, so the argument is now a measurement.
  // The three figures in §22.5 are the kind that rot silently - one of them
  // already had, because the audit-log fix removed a `populate` and the count
  // was written from memory of the figure before it.
  ['§22', 'exactly three services are extracted, and seven modules remain',
    () => {
      const ls = (p) => {
        const r = spawnSync('git', ['ls-tree', '-d', '--name-only', `HEAD:${p}`],
          { cwd: root, encoding: 'utf8' });
        return r.status === 0 ? r.stdout.trim().split('\n').filter(Boolean) : [];
      };
      const services = ls('services');
      const modules = ls('server/src/modules');
      return services.length === 3
        && ['auth', 'notifications', 'realtime']
          .every((n) => services.includes(`services/${n}`.split('/').pop()))
        // `internal` is the service-to-service surface the extractions needed,
        // not a domain module - the section says so, so it is counted apart.
        && modules.filter((m) => m !== 'internal').length === 7;
    }],
  ['§22', 'the database-per-module figures are what the section says',
    () => {
      const count = (args) => {
        const r = spawnSync('git', ['grep', '-c', ...args], { cwd: root, encoding: 'utf8' });
        if (r.status !== 0) return -1;
        return r.stdout.trim().split('\n')
          .reduce((n, line) => n + Number(line.split(':').pop()), 0);
      };
      // Six populate call sites, in service files only: a model's comment
      // mentioning populate is not a call, and a nested `populate:` option is
      // not a second site.
      const populates = count(['-F', '.populate(', '--', 'server/src/modules/*/service.js']);
      // One $lookup, the analytics join - the thing that cannot cross at all.
      const lookups = count(['-F', '$lookup', '--', 'server/src']);
      // 29 cross-module model imports: 27 static, 2 dynamic.
      const statics = count(['-E', "^import .* from '\\.\\./[a-z]*/model\\.js';",
        '--', 'server/src/modules']);
      const dynamics = count(['-E', "await import\\('\\.\\./[a-z]*/model\\.js'\\)",
        '--', 'server/src/modules']);
      return populates === 6 && lookups === 1 && statics + dynamics === 29;
    }],
  ['§22', 'every service has a suite of its own',
    () => {
      const pkg = read('package.json');
      return ['test:api', 'test:auth', 'test:notifications', 'test:realtime']
        .every((s) => pkg.includes(s));
    }],
  ['§22', 'the section no longer calls the extraction future work',
    // The failure this retarget fixed: it described the extraction as a plan.
    // Pinned against the code it now describes rather than the prose.
    () => has('services/auth/src/server.js', 'auth service listening')
       && has(`${NOT}/server.js`, 'notifications service listening')],

  // ---- §18 sequence diagrams ----------------------------------------------
  ['§18', 'A: login is rate limited and timing-safe for unknown accounts',
    () => has(`${AUTH}/routes.js`, "router.post('/login', loginLimiter")
       && has(`${AUTH}/service.js`, 'DUMMY_HASH')],
  ['§18', 'B: the job list narrows by eligibility in the query',
    () => has('server/src/modules/jobs/service.js', 'eligibilityFilter')
       && has('server/src/modules/jobs/service.js', 'eligibleOnly')],
  ['§18', 'C: apply checks eligibility then relies on the index',
    () => has('server/src/modules/applications/service.js', 'checkEligibility(student, job)')
       && has('server/src/modules/applications/service.js', 'Deduplication is the unique')],
  ['§18', 'E: the overlap check is computed in the query',
    () => has('server/src/modules/interviews/service.js', 'durationMinutes')
       && has('server/src/modules/interviews/service.js', 'Two ranges overlap')],
  ['§18', 'E: the pre-write race is still documented as open',
    () => has('server/src/modules/interviews/service.js', 'can both pass it')],
  ['§18', 'F: the recruiter corpus resolves company to its applicants',
    () => has(`${RES}/search.js`, 'Application.find({ jobId: { $in: jobIds } }).distinct')],
];

let failed = 0;
let section = null;
for (const [sec, claim, test] of claims) {
  if (sec !== section) {
    section = sec;
    console.log(`\n${sec}`);
  }
  let ok = false;
  try {
    ok = test() === true;
  } catch {
    ok = false;
  }
  if (!ok) failed += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${claim}`);
  if (!ok && offenders) {
    for (const f of offenders.split('\n')) console.log(`         ${f}`);
  }
}

const total = claims.length;
console.log(
  `\n${total - failed}/${total} claims hold.` +
    (failed
      ? ` ${failed} failed — the document now says something untrue of this code.\n`
      : ' The retargeted sections still describe this repository.\n'),
);
process.exit(failed ? 1 : 0);
