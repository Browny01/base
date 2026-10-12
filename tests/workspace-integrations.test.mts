import { integration } from "../apps/cloud/src/integrations.ts";
import { cloudEnvironment } from "./support/cloud-environment.mts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { GET as calcom } from "../packages/server/src/calcom-bookings.ts";
import { GET as socialFeed } from "../packages/server/src/social-feed.ts";
import { GET as liveStatus } from "../packages/server/src/live-status.ts";

test("shared Cal.com handler preserves date validation, authentication and normalized bookings", async () => {
  const saved = globalThis.fetch,
    calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return Response.json({
      data: [
        {
          id: 1,
          title: "Review",
          start: "2026-10-12T09:00:00Z",
          end: "2026-10-12T10:00:00Z",
          status: "accepted",
          attendees: [{ name: "Alex" }],
        },
        { id: 2, status: "cancelled", start: "2026-10-12T09:00:00Z" },
      ],
    });
  };
  try {
    assert.deepEqual(
      await (
        await calcom(new Request("https://base.example/api/calcom/bookings"))
      ).json(),
      { configured: false },
    );
    assert.equal(calls.length, 0);
    assert.equal(
      (
        await calcom(
          new Request(
            "https://base.example/api/calcom/bookings?start=2026-10-12",
          ),
          "fixture-key",
        )
      ).status,
      400,
    );
    assert.equal(calls.length, 0);
    const response = await calcom(
      new Request(
        "https://base.example/api/calcom/bookings?start=2026-10-12&end=2026-10-13",
      ),
      "fixture-key",
    );
    const value = (await response.json()) as {
      bookings: { id: number; attendee: string; startTime: string }[];
    };
    assert.equal(value.bookings.length, 1);
    assert.equal(value.bookings[0].attendee, "Alex");
    assert.equal(value.bookings[0].startTime, "2026-10-12T09:00:00Z");
    assert.equal(
      new Headers(calls[0].init?.headers).get("Authorization"),
      "Bearer fixture-key",
    );
    assert.equal(new URL(calls[0].url).hostname, "api.cal.com");
  } finally {
    globalThis.fetch = saved;
  }
});
test("shared social feeds use bounded fetch and parseString instead of a local Node HTTP server", async () => {
  const saved = globalThis.fetch,
    calls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    return new Response(
      `<?xml version="1.0"?><rss version="2.0"><channel><title>Fixture</title><item><title>News item</title><link>https://example.com/article</link><guid>fixture-${url.includes("reddit") ? "reddit" : "youtube"}</guid><pubDate>Mon, 12 Oct 2026 09:00:00 GMT</pubDate><description>Read this</description></item></channel></rss>`,
    );
  };
  try {
    const response = await socialFeed(
      new Request(
        "https://base.example/api/social-feed?youtube=UCfixture%7CChannel%7Ctechnology&reddit=base&x=creator",
      ),
    );
    const value = (await response.json()) as {
      items: { sourceType: string }[];
    };
    assert.equal(value.items.length, 2);
    assert.deepEqual(value.items.map((item) => item.sourceType).sort(), [
      "reddit",
      "youtube",
    ]);
    assert.equal(calls.length, 2);
    assert.ok(
      calls.every((url) =>
        ["www.youtube.com", "www.reddit.com"].includes(new URL(url).hostname),
      ),
    );
  } finally {
    globalThis.fetch = saved;
  }
});
test("shared live status handles malformed creator inputs without breaking the response", async () => {
  const saved = globalThis.fetch;
  globalThis.fetch = async () => new Response("Twitch");
  try {
    const response = await liveStatus(
      new Request("https://base.example/api/live-status?creator=twitch"),
    );
    assert.equal(response.status, 200);
  } finally {
    globalThis.fetch = saved;
  }
});

test("cloud AI briefings require a caller key and keep disposable cache entries tenant scoped", async () => {
  const { env, account } = cloudEnvironment(),
    alice = await account("alice"),
    bob = await account("bob");
  const cache = new Map<string, string>();
  env.CACHE = {
    get: async (key: string) => cache.get(key) ?? null,
    put: async (key: string, value: string) => {
      cache.set(key, value);
    },
  } as unknown as typeof env.CACHE;
  const saved = globalThis.fetch,
    oldKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "fixture-global-denied";
  let modelCalls = 0,
    networkCalls = 0;
  globalThis.fetch = async (input, init) => {
    networkCalls++;
    if (new URL(String(input)).hostname === "api.openai.com") {
      modelCalls++;
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        "Bearer fixture-caller-key",
      );
      return Response.json({
        choices: [{ message: { content: "## Markets\n- Fixture briefing" } }],
      });
    }
    return new Response(
      '<?xml version="1.0"?><rss version="2.0"><channel><title>Fixture</title><item><title>Market update</title><link>https://example.com/news</link></item></channel></rss>',
    );
  };
  const request = (apiKey?: string) =>
    new Request(env.PUBLIC_URL + "/api/news/summary", {
      method: "POST",
      body: JSON.stringify({ model: "gpt-5.4-mini", apiKey }),
    });
  try {
    assert.equal(
      (await integration(env, request(), alice.principal))?.status,
      400,
    );
    assert.equal(networkCalls, 0);
    assert.equal(
      (await integration(env, request("fixture-caller-key"), alice.principal))
        ?.status,
      200,
    );
    const cached = await integration(
      env,
      request("fixture-caller-key"),
      alice.principal,
    );
    assert.equal(((await cached!.json()) as { cached: boolean }).cached, true);
    assert.equal(modelCalls, 1);
    assert.equal(
      (await integration(env, request("fixture-caller-key"), bob.principal))
        ?.status,
      200,
    );
    assert.equal(modelCalls, 2);
    assert.equal(cache.size, 2);
    assert.ok(
      [...cache.keys(), ...cache.values()].every(
        (value) => !value.includes("fixture-caller-key"),
      ),
    );
  } finally {
    globalThis.fetch = saved;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
  }
});
