export function bridgePassword(): string {
  return process.env.BRIDGE_PASSWORD ?? process.env.NEXUS_PASSWORD ?? "151715";
}

export function bridgeAgentToken(): string {
  return process.env.BRIDGE_AGENT_TOKEN ?? process.env.NEXUS_AGENT_TOKEN ?? bridgePassword();
}

export function bridgeSessionSecret(): string {
  return (
    process.env.BRIDGE_SESSION_SECRET ??
    process.env.NEXUS_SESSION_SECRET ??
    process.env.BRIDGE_PASSWORD ??
    process.env.NEXUS_PASSWORD ??
    "bridge-fallback-key"
  );
}
