// Environment access, in one place.
//
// The app was Nexus, then Bridge, and is now Base. New deployments set BASE_*,
// but the older names are still honoured — a rename that required everyone to
// rotate their secrets would lock people out of their own data, and prod
// currently still has BRIDGE_PASSWORD_HASH / BRIDGE_SESSION_SECRET set.

export function basePassword(): string | undefined {
  return process.env.BASE_PASSWORD ?? process.env.BRIDGE_PASSWORD ?? process.env.NEXUS_PASSWORD;
}

// Optional scrypt hash of the login password ("<salt-base64>:<hash-base64>").
// When set, the login route verifies against this hash and the plaintext
// BASE_PASSWORD value never needs to exist on the server.
export function basePasswordHash(): string | undefined {
  return process.env.BASE_PASSWORD_HASH ?? process.env.BRIDGE_PASSWORD_HASH;
}

export function baseAgentToken(): string | undefined {
  return process.env.BASE_AGENT_TOKEN ?? process.env.BRIDGE_AGENT_TOKEN ?? process.env.NEXUS_AGENT_TOKEN ?? basePassword();
}

// Secret used to sign session tokens. Prefer a dedicated random secret; it
// falls back to the login password (never a hardcoded constant) so existing
// deployments keep working until BASE_SESSION_SECRET is set.
export function baseSessionSecret(): string | undefined {
  return process.env.BASE_SESSION_SECRET ?? process.env.BRIDGE_SESSION_SECRET ?? process.env.NEXUS_SESSION_SECRET ?? basePassword();
}