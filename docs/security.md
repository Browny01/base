# Bridge security

Bridge is a private, single-user application. Security is layered so a failure
in one control does not expose the workspace.

## Application controls

- `BRIDGE_PASSWORD` is required. There is no source-code fallback.
- `BRIDGE_SESSION_SECRET` (or the legacy `NEXUS_SESSION_SECRET`) signs seven-day,
  HTTP-only, Secure, SameSite=Strict session cookies.
- Five failed passwords within 15 minutes lock both the IP and browser device
  for 30 minutes. Upstash Redis makes the limit durable across Vercel instances;
  an in-memory fallback covers local development and transient Redis failures.
- Sensitive route handlers verify the signed session independently of Proxy.
- Cross-site browser mutations are rejected, and security headers include CSP,
  HSTS, clickjacking protection, MIME-sniff protection, and a restrictive
  permissions policy.
- Agent, widget, MCP, and cron endpoints use separate bearer credentials and
  fail closed when their credential is missing.

Required variables are documented in `.env.example`. Use a password manager and
unique random values. Rotating `BRIDGE_SESSION_SECRET` immediately invalidates all
site sessions; rotating `BRIDGE_AGENT_TOKEN`, `MCP_TOKEN`, or `CRON_SECRET`
requires updating their respective clients.

## Vercel Firewall rollout

Firewall changes are deliberately staged before enforcement:

1. Publish new rules in `log` mode.
2. Review matches in Vercel Firewall traffic for several days.
3. Enforce on a Preview deployment and test legitimate clients.
4. Move production to `rate_limit`, `challenge`, or `deny` and monitor for 24
   hours.

The current draft contains a login threshold of 20 POSTs per IP per 10 minutes
and an exploit-probe observation rule. The application-level five-failure
lockout remains the primary login control. Do not permanently ban an IP after a
few failures: mobile carriers, offices, VPNs, and home networks share addresses.

Vercel's automatic DDoS mitigation is already enabled. Attack Mode is an
emergency control for an active attack, not a setting to leave on continuously.
