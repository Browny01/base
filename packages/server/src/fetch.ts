/** Retain Next's fetch hints while using native fetch in Workers. The Worker
 * separately caches public responses in KV; these hints never authorize data. */
export function cachedFetch(
  input: RequestInfo | URL,
  init?: RequestInit & {
    next?: { revalidate?: number | false; tags?: string[] };
  },
): Promise<Response> {
  return globalThis.fetch(input, init);
}
