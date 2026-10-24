# Phase 2.5 staging provider acceptance — 2026-10-12

These checks used the owner's real **Clerk Development instance** and **Stripe
sandbox**, against `https://base-cloud-staging.kingbrownyplayz.workers.dev`.
They do not establish production readiness, actual Mac acceptance, or completion
of Phase 2.5. The production domain and existing Vercel data remain unchanged.

## Results

- Clerk server key was accepted; its public signing keys matched the configured
  frontend issuer. Email and Google are enabled. Apple is disabled.
- The hosted account page rendered. Browser testing exposed a CSP defect that
  blocked Clerk's runtime styling, blob workers and protection scripts. The
  corrected policy retains script nonces and allows only documented provider
  hosts. A repeat browser check rendered a styled 402 px sign-in card.
- An isolated Development user signed in through Clerk's one-use ticket flow in
  the collaborative browser. Its real, origin-bound browser JWT
  approved desktop flows; two native sessions were exchanged successfully.
  Reusing an exchange proof failed. A third Free device was denied.
  Backend-issued test JWTs without an authorized origin were correctly rejected;
  verification was not weakened to accommodate them.
- Clerk's actual signed `user.created` webhook populated the account profile.
  Actual `user.deleted` later marked the account deleted and revoked its sessions.
- The two authenticated device sessions synchronized against hosted D1. Replayed
  writes did not advance the revision or duplicate records. A stale concurrent
  edit was returned as a retained conflict, and unknown record fields survived.
  This tests protocol requests simulating offline clients; actual two-desktop
  disconnected/restart/reconnect acceptance still remains necessary.
- Stripe accepted API **2026-09-30.endive**. The configured price is active,
  sandbox-only, USD 399 cents every month. The matching webhook endpoint is
  enabled, uses Endive and subscribes to all six expected snapshot event types.
  The active Portal configuration enables cancellation and payment updates.
- Real Base Checkout requests returned the same session URL after retry.
  Hosted Checkout completed with the sandbox Visa `4242` test card and returned
  to Base's success page. Actual signed Stripe webhooks reconciled D1 to Plus.
- Hosted Portal displayed the subscription and accepted cancellation at period
  end. It showed “Cancels Nov 12”; the update webhook advanced billing state
  while correctly retaining Plus for the paid period.
- A subsequent sandbox API cancellation ended only this test subscription.
  The real deletion webhook reconciled D1 to Free. The test task, unknown fields
  and revision remained intact and were exportable. This proves an immediate
  downgrade; natural expiry, renewal and failed-payment scenarios need further
  provider acceptance (their business logic has fixture coverage).

No real charge, production account, production record or existing credential was
modified. The isolated Clerk user and Stripe customer/subscription were removed.
Cleanup checked the fixture owner's derived workspace ID and deleted only its
staging database rows and two recovery objects. A temporary, authenticated,
expiring, staging-only server harness enabled private provider checks; the normal
Worker was restored and its temporary secret and endpoint were removed. Neither
the harness nor session tokens are included in the source archive.

## Validation and remaining checks

The updated code passed all 139 JavaScript tests, Cloud TypeScript checks, Worker
build and ESLint (zero errors, four existing warnings). The Stripe lifecycle test
now checks the actual outbound Endive version header. Root/desktop TypeScript and the nine standalone service / ten desktop Rust
tests also passed. Actual macOS hardware verification is still pending.

Email and Google configuration/UI presence are verified, but interactive email
password/verification and Google's OAuth round-trip were **not** exercised using
an owner's identity. Ticket-based test sign-in is explicitly separate. Production
Apple needs the owner's Apple Developer account; Clerk Development can use shared
Apple credentials if the owner enables that method. The current staging instance
continues to support Email/Google with Apple disabled.

Other release gates remain in [Phase 2.5](phase-2.5.md): remaining integration
adapters, durable offline file uploads, recovery UI, migration/rollback, large
workspace capacity, signing/updates and actual macOS/multiple-device acceptance.
Phase 3 has not started.

Screenshots: [Clerk](screenshots/desktop-phase25/clerk-staging-sign-in.png),
Portal cancellation was verified; its original screenshot was removed for privacy.

References: [Clerk CSP requirements](https://clerk.com/docs/guides/secure/best-practices/csp-headers),
[Apple setup](https://clerk.com/docs/guides/configure/auth-strategies/social-connections/apple),
[Stripe Endive](https://docs.stripe.com/changelog/endive).
