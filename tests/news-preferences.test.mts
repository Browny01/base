import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeNewsPrefs, socialFeedQuery } from "../lib/news-prefs.ts";
import { migrateAll, DEFAULT } from "../lib/store.ts";
import { desktopUpdate } from "../apps/cloud/src/desktop-updates.ts";
import { cloudEnvironment } from "./support/cloud-environment.mts";
test("partial source preferences recover News and Settings without losing channels or unknown fields", () => {
  const raw = { youtube: [{id:"test",name:"Channel",channelId:"UCtest",category:"general"}], future: { kept:true } };
  const result = normalizeNewsPrefs(raw as never);
  assert.equal(result.youtube, raw.youtube);
  assert.deepEqual(result.reddit, ["CryptoCurrency", "artificial"]);
  assert.deepEqual(result.creators, []);
  assert.deepEqual((result as unknown as typeof raw).future, raw.future);
  assert.match(socialFeedQuery(raw as never), /youtube=/);
  assert.equal(migrateAll({...DEFAULT,newsPrefs:raw as never},{preserveArchived:true}).newsPrefs.youtube[0].channelId,"UCtest");
  assert.deepEqual(normalizeNewsPrefs({reddit:[],x:[],newsSources:[]}).reddit, []);
  assert.deepEqual(normalizeNewsPrefs({reddit:null} as never).reddit, ["CryptoCurrency","artificial"]);
});
test("desktop release feed is public read-only, platform scoped and cleanly reports no release", async () => {
  const {env} = await cloudEnvironment();
  env.RELEASES = env.FILES; // Isolated in-memory release binding, never a real tenant bucket.
  assert.equal((await desktopUpdate(new Request("https://base.test/api/desktop/updates?target=linux&arch=x86_64"),env))?.status,204);
  assert.equal((await desktopUpdate(new Request("https://base.test/api/desktop/updates?target=../secret&arch=x86_64"),env))?.status,400);
  assert.equal(await desktopUpdate(new Request("https://base.test/api/desktop/download/../../secret"),env),null);
  await env.FILES.put("desktop-releases/latest.json",JSON.stringify({version:"0.1.1",pub_date:new Date().toISOString(),platforms:{"linux-x86_64":{url:"https://base.test/release.AppImage",signature:"signed-fixture"}}}));
  assert.equal((await desktopUpdate(new Request("https://base.test/api/desktop/updates?target=darwin&arch=aarch64"),env))?.status,204);
  const r=await desktopUpdate(new Request("https://base.test/api/desktop/updates?target=linux&arch=x86_64"),env);
  assert.equal((await r!.json() as {version:string}).version,"0.1.1");
});
