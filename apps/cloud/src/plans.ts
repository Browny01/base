import type { WorkspaceRow } from "./types.ts";
export const PLANS = {
  free: {
    label: "Base Cloud Free",
    usdMonthly: 0,
    storageBytes: 250_000_000,
    devices: 2,
    recoveryDays: 7,
    uploadBytes: 10_000_000,
    backupHours: 24,
  },
  plus: {
    label: "Base Cloud Plus",
    usdMonthly: 399,
    storageBytes: 10_000_000_000,
    devices: null,
    recoveryDays: 90,
    uploadBytes: 100_000_000,
    backupHours: 1,
  },
} as const;
export function effectivePlan(
  workspace: WorkspaceRow,
  at = Math.floor(Date.now() / 1000),
) {
  return workspace.plan === "plus" &&
    ["active", "trialing"].includes(workspace.subscription_status) &&
    workspace.paid_until > at
    ? "plus"
    : "free";
}
export const entitlements = (workspace: WorkspaceRow) =>
  PLANS[effectivePlan(workspace)];
export function canGrow(
  workspace: WorkspaceRow,
  nextDocument: number,
  extraFiles = 0,
) {
  const current =
    workspace.document_bytes + workspace.file_bytes + workspace.reserved_bytes;
  const proposed =
    nextDocument + workspace.file_bytes + workspace.reserved_bytes + extraFiles;
  return (
    proposed <= entitlements(workspace).storageBytes || proposed <= current
  );
}
