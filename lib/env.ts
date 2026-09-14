export function bridgePassword(): string | undefined {
  return process.env.BRIDGE_PASSWORD ?? process.env.NEXUS_PASSWORD;
}

// Optional scrypt hash of the login password ("<salt-base64>:<hash-base64>").
// When set, the login route verifies against this hash and the plaintext
// BRIDGE_PASSWORD value never needs to exist on the server.
export function bridgePasswordHash(): string | undefined {
  return process.env.BRIDGE_PASSWORD_HASH;
}

export function bridgeAgentToken(): string | undefined {
  return process.env.BRIDGE_AGENT_TOKEN ?? process.env.NEXUS_AGENT_TOKEN ?? bridgePassword();
}

// Secret used to sign session tokens. Prefer a dedicated random secret; it
// falls back to the login password (never a hardcoded constant) so existing
// deployments keep working until BRIDGE_SESSION_SECRET is set.
export function bridgeSessionSecret(): string | undefined {
  return process.env.BRIDGE_SESSION_SECRET ?? process.env.NEXUS_SESSION_SECRET ?? bridgePassword();
}