import type { Redis } from "@upstash/redis";

const REVISION_KEY = "bridge:sync:revision";
const RECORD_REVISIONS_KEY = "bridge:sync:record-revisions";
const CHANGES_KEY = "bridge:sync:changes";

// Legacy integrations still replace the complete Bridge document. Advancing
// the cursor and clearing record revisions forces local-first clients to fetch
// one fresh snapshot instead of silently missing that external mutation.
export async function markFullSnapshotChange(redis: Redis) {
  await Promise.all([
    redis.incr(REVISION_KEY),
    redis.del(RECORD_REVISIONS_KEY),
    redis.del(CHANGES_KEY),
  ]);
}
