# Hourly D1 read exhaustion — 18 October 2026

The staging cron runs at minute 15 of every hour. Its unreferenced-recovery
collector repeatedly scanned a workspace's backups for every recovery object.
The primary key indexes identify backups/archives by ID, whereas this query
checks their R2 object key. Returning zero garbage rows did not mean zero reads.

Live Wrangler query insights reported an average **214,174 rows read per cleanup**
(34 executions in the requested analytics window). At 24 runs/day, that average
alone projects to 5,140,176 reads, exceeding Workers Free's 5 million/day allowance.
The next-largest query in the same insights result totaled 5,096 reads. Counts
are database rows scanned, not user records returned or network requests.

## Fix and verification

Migration `0007_recovery_cleanup_indexes.sql` adds exact-key indexes for backups,
migration archives and unfinished jobs. The job predicate explicitly uses the
indexed TEXT expression so SQLite seeks both workspace and key. No existing
records, backups, credentials or retention settings are deleted or rewritten.
The history collector also uses its timestamp index to exclude records younger
than the shortest retention period before checking Free/Plus eligibility.

- Isolated local workerd/D1, 657 retained backups: the unchanged result (no
  eligible garbage) cost **216,810 reads before / 1,314 after**, a 99.4% reduction.
- Larger local fixture, 2,657 objects protected by backups, migration archives
  or unfinished jobs: **5,314 reads**, zero candidates. These are actual D1
  `meta.rows_read` measurements, not estimates based on timing.
- After applying the migration to staging, the collector's read-only query cost
  **1,303 reads**, zero writes and zero candidates; SQL duration 1.25 ms. Its
  live query plan uses exact-key index seeks for all three reference checks.
  At the current size this projects to **31,272 reads/day for this query**,
  excluding other application/maintenance queries. This is not a future quota
  guarantee as workspace usage grows.
- All **183 JavaScript tests** pass. New tests retain 3,000 protected objects,
  reclaim orphan objects in batches of at most 100, preserve recent objects,
  verify the populated index migration and require exact-key query plans.
  They also verify seven-/90-day history retention and indexed age filtering.
  Cloud TypeScript, targeted ESLint and Worker dry-run pass.

The additive migration and Worker fix are deployed to **base-cloud-staging**,
Worker version `ac58bbb5-835e-4539-9147-54ffbe0c44bd`. The hourly schedule,
backup policy and billing tier are unchanged. Existing Vercel production is
untouched. This is a backend change; desktop/browser clients need no update.
The next scheduled run/dashboard aggregate had not yet been observed at handoff;
the production query itself was measured directly on staging.

## Operation and rollback

Use `npx wrangler d1 insights base-cloud-staging --sort-by reads --limit 10`
from `apps/cloud` to identify expensive queries without executing them again.
For another deployment, apply migration 0007 before deploying the changed Worker.
Keep these additive indexes if reverting Worker code: older code also benefits
from the backup/archive indexes. Do not delete recovery data to reclaim a read
allowance; deletion does not undo consumed reads.

Free usage resets daily at **00:00 UTC / 08:00 Australia/Perth**. Already consumed
reads cannot be refunded by an optimization; an exhausted account may reject
queries until reset. Base's local cache/outbox remains the recovery path during
that interruption. No upgrade or billing change was made.

References: [D1 pricing and row accounting](https://developers.cloudflare.com/d1/platform/pricing/),
[D1 indexes](https://developers.cloudflare.com/d1/best-practices/use-indexes/).
