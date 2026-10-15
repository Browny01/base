import { effectivePlan } from "./plans.ts";
import { HttpError, type Principal } from "./types.ts";
export function workspaceRole(principal: Principal) {
  const owner = principal.accountId === principal.workspace.owner_id;
  if (
    effectivePlan(principal.workspace) !== "plus" &&
    (!owner || principal.workspace.billing_workspace_id)
  )
    return "viewable";
  return owner ? "owner" : (principal.role ?? "viewable");
}
export function requireOwner(principal: Principal) {
  if (principal.accountId !== principal.workspace.owner_id)
    throw new HttpError(
      403,
      "Only the workspace owner can manage this setting",
    );
}
export function requireEditable(principal: Principal) {
  if (workspaceRole(principal) === "viewable")
    throw new HttpError(
      403,
      "This workspace is viewable. Your local changes are retained; ask its owner for editing access or to renew Plus.",
    );
}
