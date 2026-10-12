# Base Cloud staging setup

Phase 2.5 is in progress. Staging: **https://base-cloud-staging.kingbrownyplayz.workers.dev**.

Staging is isolated from the existing Next/Vercel
application. Do not point `base.lucasbrown.xyz` at this Worker until integration
parity, migration/rollback, live authentication/billing and desktop acceptance
checks are complete. Never paste keys in chat or commit secret files.

## Cloudflare

The existing CLI login was verified. Created staging resources:

- D1: `base-cloud-staging` (schema is a new database, not a production migration).
- R2: `base-cloud-files-staging`, private (R2 was enabled by the owner).
- KV: `CACHE`, bound only for disposable caching.
- Queues: `base-cloud-jobs-staging`, `base-cloud-jobs-dead-staging`.

`apps/cloud/wrangler.json` contains their public identifiers. The Worker uses
Queues for a durable SQL job outbox and an hourly cron. A deployment's public
URL must equal its configured `PUBLIC_URL`; staging uses its workers.dev URL,
while production will eventually use `https://base.lucasbrown.xyz`.

## Clerk

1. Create/sign in to [Clerk Dashboard](https://dashboard.clerk.com/).
2. Create an application named **Base**. Enable **Email** and **Google**. Use its
   **Development** instance for staging. Registration and sign-in happen in the
   system browser, followed by explicit approval of the Base desktop device.
3. Keep the development publishable key and secret key ready for the local
   configuration helper. The secret goes into Worker secrets; the publishable
   key is public and is needed by the hosted sign-in screen.
4. Add a Clerk webhook at the staging URL plus `/api/clerk/webhook`, with
   `user.created`, `user.updated` and `user.deleted`. Keep its signing secret
   ready. This updates account details and revokes sessions on account deletion;
   workspace data is retained. Signature checks happen before any account write.
5. Apple is supported through Clerk's social connection, but its setup requires
   your Apple Developer Services ID, Team ID and signing key. Configure these
   inside Clerk, never in the desktop bundle. Until configured, Apple sign-in
   must be recorded as pending, not passed.
6. For production, create the Production instance for **base.lucasbrown.xyz**,
   follow Clerk's DNS instructions in Cloudflare, and configure your own Google
   and Apple OAuth credentials. Keep staging and production accounts separate.

See [Clerk environments](https://clerk.com/docs/guides/development/managing-environments)
and [Apple setup](https://clerk.com/docs/guides/configure/auth-strategies/social-connections/apple).

## Stripe

1. Create/sign in to [Stripe Dashboard](https://dashboard.stripe.com/) and select
   a **sandbox/test environment**. No real charge is needed for acceptance tests.
2. Create **Base Cloud Plus**, with one recurring price: **USD $3.99 monthly**.
   Copy its `price_…` identifier. The backend validates currency, amount and
   recurrence before creating Checkout sessions. Free does not need a product.
3. Enable the Customer Portal, with payment method updates and cancellation.
   The backend creates the customer and subscription through hosted Checkout.
4. The staging Worker is deployed. Add a webhook endpoint:
   `https://base-cloud-staging.kingbrownyplayz.workers.dev/api/stripe/webhook`.
   Select `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `checkout.session.completed`,
   `invoice.paid`, and `invoice.payment_failed`. Use API version
   **2025-09-30.clover**, also explicitly pinned by this backend.
5. Keep the sandbox secret API key and endpoint signing secret ready. The
   publishable Stripe key is not needed: Checkout and the Portal are hosted.

See [Stripe webhook setup](https://docs.stripe.com/events/manage-webhook-endpoints)
and [the pinned API release](https://docs.stripe.com/changelog/clover).

## Enter keys privately

After creating the projects and webhook, run this yourself in a terminal:

```bash
cd /path/to/base
node scripts/configure-cloud.mjs
```

The script prompts for the public Clerk key and Stripe price ID, then reads both
providers’ secret keys and webhook signing secrets with input hidden.
It passes each secret directly to `wrangler secret put` via stdin. Secrets are
never written to arguments, shell history, environment variables or repository
files. It rejects live API keys: this helper is deliberately for staging only.
The public keys/issuer/price are written to the staging config. Tell the agent
only that setup is done; do not send the values.

## Acceptance gates before production

Test email/Google/Apple sign-in, expired/revoked sessions, two devices, a blocked
third Free device, offline edits/restart/reconnect, conflicting edits, private
attachments, workspace separation/export/import, Plus checkout, webhook retries
and ordering, cancellation/expiry, over-quota read/export, backups and rollback.
Run Linux and actual Mac checks. Document any unavailable provider or hardware.
Migration must snapshot all legacy keys and Blob objects, verify checksums,
import into an empty owner-bound workspace, compare data/integration behavior,
and prove rollback before any traffic cutover. No credential reset is allowed.

## macOS service acceptance after configuring staging

These are new Phase 2.5 checks, separate from the Mac tests of Phase 2. Use a
checkout/ZIP containing this checkpoint and run from its repository directory:

```bash
npm ci
npm test
npm run typecheck
npm run desktop:typecheck
cargo test --manifest-path native/BaseWorkspace/Cargo.toml
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
npm run desktop:build
open apps/desktop/src-tauri/target/release/bundle/macos/Base.app
```

In Accounts & Sync, start the local service, open its workspace, create a test
record, quit Base entirely, then check the independent service:

```bash
curl --fail http://127.0.0.1:53318/health
launchctl print "gui/$(id -u)/app.base.workspace"
```

Reopen Base and check that the record remains. Stop Workspace, verify the health
request fails, start again and check that records and workspace identity survive.
Enable login startup, test an actual logout/login and then disable it. Stopping
the service and quitting Base are separate actions. Test Keychain approval and
confirmation keyboard behavior. Record actual memory/CPU with Activity Monitor
or Instruments, including a settled UI-closed service sample; do not substitute
Linux measurements.

For cloud acceptance, use **Connect to a staging cloud** and enter the staging
URL above. Finish sign-in in the system browser and explicitly approve the
connection before clicking Complete sign-in. Keep workspaces separate. Test two
devices, offline edits/restart/reconnect, simultaneous edits and retained
conflicts before testing a third Free device. Exercise sandbox Checkout and
Portal, cancellation/expiry and exports after downgrade. Record which checks
used the real Clerk/Stripe projects; synthetic fixture tests are separate.
