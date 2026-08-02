# Hermes brief publishing

Bridge stores published Hermes reports as first-class `briefs` records. Hermes publishes through Bridge's authenticated MCP endpoint; dashboard readers do not need a separate service or credential.

## Brief types

The `type` field accepts exactly one of:

- `morning_coo` — Morning COO Brief
- `weekly_business_review` — Weekly Business Review
- `content_opportunity` — Content Opportunity Brief

Every brief has this shape:

```ts
type Brief = {
  id: string;
  type: "morning_coo" | "weekly_business_review" | "content_opportunity";
  title: string;
  contentMarkdown: string;
  generatedAt: string; // ISO 8601 timestamp with timezone
  periodStart?: string; // YYYY-MM-DD; provide with periodEnd
  periodEnd?: string;   // YYYY-MM-DD; provide with periodStart
  workspace?: string;
  sourceRunId?: string;
  status: "published";
  createdAt: string;
  updatedAt: string;
};
```

Bridge assigns `id`, `status`, `createdAt`, and `updatedAt`. The MCP input may include `status`, but its only accepted value is `published`.

## MCP tools

### `upsert_brief`

Publishes one report. Required arguments are `type`, `title`, `contentMarkdown`, and `generatedAt`. `periodStart` and `periodEnd` are optional but must be supplied together.

```json
{
  "type": "weekly_business_review",
  "title": "Weekly Business Review — 27 July to 2 August",
  "contentMarkdown": "## Executive summary\n\nRevenue held above plan...",
  "generatedAt": "2026-08-02T09:15:00+08:00",
  "periodStart": "2026-07-27",
  "periodEnd": "2026-08-02",
  "workspace": "Bridge",
  "sourceRunId": "hermes-weekly-2026-08-02"
}
```

The result includes the stored `record`, `created`, and an `action` of `created` or `updated`.

Idempotency is automatic:

- Reports with a period use `type + periodStart + periodEnd`.
- Reports without a period use `type + the calendar date in generatedAt`.
- Retrying the same report updates its existing record and preserves its original `id` and `createdAt`.

This tool can only replace or append records in `briefs` (plus Bridge's normal document update timestamp). The generic collection mutation tools do not expose `briefs`.

### `get_briefs`

Returns published reports newest first. Both arguments are optional.

```json
{
  "type": "morning_coo",
  "limit": 7
}
```

`limit` defaults to 20 and accepts integers from 1 to 100.

## Scheduled MCP example

A scheduled Hermes run sends the normal MCP `tools/call` JSON-RPC request to Bridge's existing MCP URL. Keep the bearer token in the scheduler's secret store; never place it in a prompt, report, log, or repository.

```sh
curl --request POST "$BRIDGE_MCP_URL" \
  --header "Authorization: Bearer $BRIDGE_MCP_TOKEN" \
  --header "Content-Type: application/json" \
  --data '{
    "jsonrpc": "2.0",
    "id": "publish-morning-brief",
    "method": "tools/call",
    "params": {
      "name": "upsert_brief",
      "arguments": {
        "type": "morning_coo",
        "title": "Morning COO Brief — 2 August",
        "contentMarkdown": "## Today at a glance\n\n- Review current priorities",
        "generatedAt": "2026-08-02T07:30:00+08:00",
        "workspace": "Bridge",
        "sourceRunId": "morning-run-2026-08-02"
      }
    }
  }'
```

Use a timestamp with an explicit timezone. Bridge displays it in each reader's local time.

## Privacy and content rules

Briefs are published dashboard content. Before calling `upsert_brief`, Hermes must summarise source material and remove credentials, API keys, bearer tokens, passwords, private keys, raw model/tool transcripts, and content copied from locked Notes pages. Bridge rejects common secret and raw-transcript patterns as a final safeguard. Locked and trashed Notes remain excluded from MCP reads and must never be reconstructed into a brief.

Markdown is rendered through Bridge's HTML-escaping Markdown renderer. External links are allowed; raw HTML is displayed as text rather than executed.

## Dashboard behaviour

The configurable **Hermes Briefings** widget appears immediately after News by default. It always presents the current Morning COO, Weekly Business Review, and Content Opportunity brief in that order. Missing report types show an honest unpublished state. Older reports remain available from **History**, and reports beyond their expected publishing cadence receive a stale label.
