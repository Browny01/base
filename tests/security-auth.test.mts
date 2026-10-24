import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET } from "../app/api/widget/summary/route.ts";
import { baseAgentToken, baseWidgetToken } from "../lib/env.ts";

test("widget authentication fails closed when unconfigured, empty or incorrect", async () => {
  const keys = ["BASE_WIDGET_TOKEN", "BRIDGE_WIDGET_TOKEN", "BASE_AGENT_TOKEN", "BRIDGE_AGENT_TOKEN", "NEXUS_AGENT_TOKEN", "BASE_PASSWORD", "BRIDGE_PASSWORD", "NEXUS_PASSWORD"];
  const saved = keys.map(key => process.env[key]);
  const request = (token?: string) => new NextRequest("https://base.example/api/widget/summary", {headers: token ? {"x-base-token": token} : {}});
  try {
    keys.forEach(key => delete process.env[key]);
    assert.equal((await GET(request())).status, 401);
    process.env.BASE_AGENT_TOKEN = "";
    assert.equal((await GET(request())).status, 401);
    process.env.BASE_AGENT_TOKEN = "fixture-" + crypto.randomUUID();
    assert.equal(baseAgentToken(), process.env.BASE_AGENT_TOKEN);
    assert.equal((await GET(request())).status, 401);
    assert.equal((await GET(request("wrong"))).status, 401);
    assert.equal((await GET(request("é".repeat(40)))).status, 401);
    process.env.BASE_WIDGET_TOKEN = "fixture-widget-" + crypto.randomUUID();
    assert.equal(baseWidgetToken(), process.env.BASE_WIDGET_TOKEN);
    assert.notEqual(baseAgentToken(), process.env.BASE_WIDGET_TOKEN);
    assert.equal((await GET(request(process.env.BASE_AGENT_TOKEN))).status, 401);
  } finally {
    keys.forEach((key, i) => { if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i]; });
  }
});
