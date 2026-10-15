import { useEffect, useState } from "react";
import { Plus, Users, ArrowRight, Copy, Folder } from "lucide-react";
import { request } from "./native";
import { openCloudWorkspace } from "./store";
import { useConfirm } from "@/lib/confirm-context";
type WorkspaceItem = {
  id: string;
  name: string;
  owner_id: string;
  role?: string;
};
type Member = {
  account_id: string;
  email: string;
  display_name: string;
  role: string;
};
export function CloudWorkspaces({
  scope,
  currentId,
  owner,
  plus,
  blocked,
}: {
  scope: string;
  currentId: string;
  owner: boolean;
  plus: boolean;
  blocked: boolean;
}) {
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]),
    [members, setMembers] = useState<Member[]>([]);
  const [name, setName] = useState(""),
    [code, setCode] = useState(""),
    [invite, setInvite] = useState(""),
    [role, setRole] = useState("editable");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false);
  const confirm = useConfirm();
  async function api(path: string, input?: object) {
    const response = await request(
      scope,
      path,
      input
        ? {
            method: "POST",
            body: JSON.stringify(input),
            headers: { "Content-Type": "application/json" },
          }
        : {},
    );
    const value = await response.json();
    if (!response.ok || response.headers.has("X-Base-Cached"))
      throw new Error(
        value.error ||
          "Workspace service unavailable. Try again when connected.",
      );
    return value;
  }
  async function refresh() {
    const [list, people] = await Promise.all([
      api("/api/workspaces"),
      owner ? api("/api/workspace/members") : Promise.resolve({ members: [] }),
    ]);
    setWorkspaces(list.workspaces);
    setMembers(people.members);
  }
  useEffect(() => {
    let disposed = false;
    void Promise.all([
      api("/api/workspaces"),
      owner ? api("/api/workspace/members") : Promise.resolve({ members: [] }),
    ])
      .then(([list, people]) => {
        if (!disposed) {
          setWorkspaces(list.workspaces);
          setMembers(people.members);
        }
      })
      .catch((e) => {
        if (!disposed) setError(String(e.message));
      });
    return () => {
      disposed = true;
    };
    // The component is keyed by scope; no background polling or cross-workspace state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, owner]);
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const disabled = busy || blocked;
  return (
    <section
      className="base-workspace-panel base-cloud-workspaces"
      aria-label="Cloud workspaces"
    >
      <div className="base-workspace-heading">
        <div>
          <h3>Your workspaces</h3>
          <p>
            Separate spaces, one account. Your saved data stays in its
            workspace.
          </p>
        </div>
        <Folder className="h-5 w-5 text-[var(--muted)]" />
      </div>
      <div className="grid gap-2 mt-4">
        {workspaces.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 border border-[var(--border)] rounded-xl p-3"
          >
            <Folder className="h-4 w-4 shrink-0 text-[var(--muted)]" />
            <div className="min-w-0 flex-1">
              <strong className="block text-sm truncate">{item.name}</strong>
              <span className="text-xs text-[var(--muted)]">
                {item.role === "editable"
                  ? "Editable"
                  : item.role === "viewable"
                    ? "Viewable"
                    : "Owned by you"}
              </span>
            </div>
            {item.id === currentId ? (
              <span className="base-workspace-status">Current</span>
            ) : (
              <button
                className="base-icon-button"
                aria-label={"Open " + item.name}
                disabled={disabled}
                onClick={() =>
                  void action(async () => {
                    if (
                      await confirm({
                        message:
                          "Open " +
                          item.name +
                          "? Your current records and pending edits stay saved separately. Nothing is merged or removed.",
                        confirmLabel: "Open workspace",
                        danger: false,
                      })
                    )
                      await openCloudWorkspace(item.id);
                  })
                }
              >
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      <form
        className="flex flex-wrap gap-2 mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          void action(async () => {
            await api("/api/workspaces/create", { name });
            setName("");
            await refresh();
          });
        }}
      >
        <label className="sr-only" htmlFor="cloud-workspace-name">
          New workspace name
        </label>
        <input
          id="cloud-workspace-name"
          className="min-w-0 flex-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          required
          placeholder="New workspace name"
          disabled={disabled}
        />
        <button
          className="base-button base-button-secondary"
          disabled={disabled}
        >
          <Plus className="h-4 w-4" />
          Create workspace
        </button>
      </form>
      <p className="mt-2 text-xs text-[var(--muted)]">
        Additional workspaces and sharing require Plus. Your 10 GB covers every
        workspace you own.
      </p>
      <form
        className="flex flex-wrap gap-2 mt-5"
        onSubmit={(e) => {
          e.preventDefault();
          void action(async () => {
            if (
              !(await confirm({
                message:
                  "Join this shared workspace? It will appear as a separate workspace. Your existing records stay here.",
                confirmLabel: "Join workspace",
                danger: false,
              }))
            )
              return;
            await api("/api/workspaces/accept", { code });
            setCode("");
            await refresh();
          });
        }}
      >
        <label className="sr-only" htmlFor="cloud-invite-code">
          Invitation code
        </label>
        <input
          id="cloud-invite-code"
          className="min-w-0 flex-1"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          autoComplete="off"
          placeholder="Paste an invitation code"
          disabled={disabled}
        />
        <button
          className="base-button base-button-secondary"
          disabled={disabled}
        >
          <Users className="h-4 w-4" />
          Join workspace
        </button>
      </form>
      {owner && (
        <div className="mt-6 pt-5 border-t border-[var(--border)]">
          <h4 className="text-sm font-medium">Share this workspace</h4>
          <p className="text-xs text-[var(--muted)] mt-1">
            Editors can change content. Viewers can read and export. Only you
            manage access.
          </p>
          {plus ? (
            <>
              <div className="flex flex-wrap gap-2 mt-3">
                <select
                  aria-label="Invitation permission"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  disabled={disabled}
                >
                  <option value="editable">Editable</option>
                  <option value="viewable">Viewable</option>
                </select>
                <button
                  className="base-button base-button-secondary"
                  disabled={disabled}
                  onClick={() =>
                    void action(async () => {
                      const value = await api("/api/workspace/invite", {
                        role,
                      });
                      setInvite(value.code);
                      setCopied(false);
                    })
                  }
                >
                  Create invitation
                </button>
              </div>
              {invite && (
                <div className="mt-3">
                  <label className="text-xs text-[var(--muted)] grid gap-2">
                    Share this single-use code privately. It expires in 7 days.
                    <input
                      readOnly
                      value={invite}
                      aria-label="Invitation to share"
                      onFocus={(e) => e.currentTarget.select()}
                    />
                  </label>
                  <button
                    className="base-button base-button-secondary mt-2"
                    disabled={disabled}
                    onClick={() =>
                      void action(async () => {
                        await navigator.clipboard.writeText(invite);
                        setCopied(true);
                      })
                    }
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {copied ? "Copied" : "Copy invitation"}
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-[var(--muted)] mt-3">
              Upgrade to Plus to invite people.
            </p>
          )}
          {!!members.length && (
            <div className="grid gap-2 mt-4">
              {members.map((member) => (
                <div
                  className="flex flex-wrap gap-2 items-center border border-[var(--border)] rounded-lg p-3"
                  key={member.account_id}
                >
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {member.display_name || member.email || member.account_id}
                  </span>
                  <select
                    aria-label={
                      "Permission for " +
                      (member.email || member.display_name || member.account_id)
                    }
                    disabled={disabled || !plus}
                    value={member.role}
                    onChange={(e) => {
                      const role = e.target.value;
                      void action(async () => {
                        await api("/api/workspace/members", {
                          accountId: member.account_id,
                          role,
                        });
                        await refresh();
                      });
                    }}
                  >
                    <option value="editable">Editable</option>
                    <option value="viewable">Viewable</option>
                  </select>
                  <button
                    className="base-button base-button-secondary"
                    disabled={disabled}
                    onClick={() =>
                      void action(async () => {
                        if (
                          !(await confirm({
                            message:
                              "Remove access for this member? Their cached copy is retained, but future access and synchronization will stop.",
                            confirmLabel: "Remove member",
                            danger: true,
                          }))
                        )
                          return;
                        await api("/api/workspace/members", {
                          accountId: member.account_id,
                          role: "remove",
                        });
                        await refresh();
                      })
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            className="base-button base-button-secondary mt-3"
            disabled={disabled}
            onClick={() =>
              void action(async () => {
                await api("/api/workspace/invite", { revoke: true });
                setInvite("");
              })
            }
          >
            Revoke unused invitations
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-[var(--c-rose)] mt-3">
          {error}
        </p>
      )}
    </section>
  );
}
