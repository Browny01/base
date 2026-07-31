export function bridgePassword(): string {
  const value = process.env.BRIDGE_PASSWORD ?? process.env.NEXUS_PASSWORD;
  if (!value) throw new Error("BRIDGE_PASSWORD is not configured");
  return value;
}

export function bridgeAgentToken(): string | null {
  return process.env.BRIDGE_AGENT_TOKEN ?? process.env.NEXUS_AGENT_TOKEN ?? null;
}

export function bridgeSessionSecret(): string {
  const value = process.env.BRIDGE_SESSION_SECRET ?? process.env.NEXUS_SESSION_SECRET;
  if (!value) throw new Error("BRIDGE_SESSION_SECRET is not configured");
  return value;
}
