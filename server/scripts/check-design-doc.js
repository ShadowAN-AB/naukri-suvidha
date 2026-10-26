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
 * §18 sequence diagrams, plus the three document-wide invariants.
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
const NOT = 'server/src/modules/notifications';
const AUTH = 'services/auth/src';
const EV = 'server/src/infra/events';
const KIT = 'service-kit/src';

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
  // Counted across both services since step 5. `users` and `refreshTokens`
  // moved to the auth service's own database, so the API's barrel holds
  // twelve - but the *system* still has fourteen, which is what the document
  // says. Counting only the API's would have silently "lost" two.
  ['counts', '§1 and §8 say fourteen collections, across both services',
    () => {
      const names = (rel) =>
        (read(rel).match(/^export \{([^}]*)\}/gm) || [])
          .join(',').replace(/export \{|\}/g, '')
          .split(',').map((x) => x.trim()).filter(Boolean);
      const api = names('server/src/models.js');
      // The auth service registers its two directly rather than re-exporting
      // them, so they are counted by their mongoose.model calls. Its barrel
      // also exports the two schemas, for the seed script - those are not
      // collections and must not be counted.
      const auth = countOf(`${AUTH}/model.js`, 'mongoose.model(');
      return api.length === 12 && auth === 2 && api.length + auth === 14;
    }],
  // Twelve since step 5, not eleven: the auth service brought its own suite,
  // and server/test/auth.test.js became access.test.js - what is left of this
  // service's side once credentials and sessions moved.
  ['counts', '§1 says 12 test files, across both services',
    () => {
      const r = spawnSync('git',
        ['ls-files', 'server/test/*.test.js', 'services/auth/test/*.test.js'],
        { cwd: root, encoding: 'utf8' });
      return r.status === 0 && r.stdout.trim().split('\n').length === 12;
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
      const m = read('server/src/lib/constants.js').match(/EVENTS = Object\.freeze\(\{([\s\S]*?)\}\)/);
      return m ? m[1].split('\n').filter((l) => l.includes(':')).length === 7 : false;
    }],
  ['§7', 'the seven event names are the ones the table lists',
    () => ["RESUME_UPLOADED: 'resume.uploaded'", "RESUME_PROCESSED: 'resume.processed'",
           "JOB_CREATED: 'job.created'", "JOB_APPROVED: 'job.approved'",
           "APPLICATION_SUBMITTED: 'application.submitted'",
           "APPLICATION_STATUS_CHANGED: 'application.status_changed'",
           "INTERVIEW_SCHEDULED: 'interview.scheduled'"]
      .every((e) => has('server/src/lib/constants.js', e))],
  ['§7', 'exactly eight named subscribers exist',
    () => countOf(`${AI}/worker.js`, 'eventBus.subscribe') === 3
       && countOf(`${NOT}/consumers.js`, 'eventBus.subscribe') === 5],
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
    () => has(`${EV}/kafka.js`, "name.replace(/:/g, '.')")],
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
  ['§7', 'the transport starts after every module has subscribed',
    () => has('server/src/server.js', 'registerNotificationConsumers()')
       && read('server/src/server.js').indexOf('registerNotificationConsumers()')
          < read('server/src/server.js').indexOf('eventBus.startTransport()')],
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
    () => has(`${EV}/retry.js`, 'MAX_DELIVERY_ATTEMPTS = 5')
       && has(`${EV}/retry.js`, '10s, 20s, 40s, 80s, 160s')],
  ['§7', 'ensureTopics waits for leaders before any consumer subscribes',
    () => has(`${EV}/kafka.js`, 'waitForLeaders: true')],

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
    () => countOf(`${NOT}/consumers.js`, 'eventBus.subscribe') === 5],
  ['§11', 'notifications publishes nothing',
    () => lacks(`${NOT}/consumers.js`, 'eventBus.publish')],
  ['§11', 'the enum holds exactly the four current types',
    () => ["JOB_APPROVED: 'job.approved'", "APPLICATION_STATUS: 'application.status'",
           "RESUME_PROCESSED: 'resume.processed'", "INTERVIEW_SCHEDULED: 'interview.scheduled'"]
      .every((t) => has('server/src/lib/constants.js', t))],
  ['§11', 'both Notification indexes exist',
    () => has(`${NOT}/model.js`, 'index({ userId: 1, createdAt: -1 })')
       && has(`${NOT}/model.js`, 'index({ userId: 1, readAt: 1 })')],
  ['§11', 'read state is a nullable date, not a boolean',
    () => has(`${NOT}/model.js`, 'readAt: { type: Date, default: null }')],
  ['§11', 'retry is 5 attempts with 10s/20s/40s/80s/160s backoff',
    () => has(`${EV}/retry.js`, 'MAX_DELIVERY_ATTEMPTS = 5')
       && has(`${EV}/retry.js`, '10s, 20s, 40s, 80s, 160s')],
  ['§11', 'stranded deliveries are requeued at boot',
    () => has(`${EV}/retryWorker.js`, 'requeued stranded deliveries')],
  ['§11', 'sockets join one room per user and carry three events',
    () => has('server/src/modules/realtime/index.js', 'roomFor = (userId)')
       && ["NOTIFICATION_NEW: 'notification:new'", "APPLICATION_STATUS: 'application:status'",
           "RESUME_PROCESSED: 'resume:processed'"]
         .every((e) => has('server/src/modules/realtime/index.js', e))],

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
