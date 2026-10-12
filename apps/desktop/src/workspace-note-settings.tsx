import { useState } from "react";
import { LockKeyhole, Loader2 } from "lucide-react";
import { createWorkspaceNotePassword } from "@/packages/core/src/workspace-password";
import { verifyNotePassword } from "@/lib/note-lock";
import { useBase } from "@/lib/hooks";
import { useToast } from "@/lib/toast-context";
import { currentWorkspace, persistEdit } from "./store";
export function WorkspaceNoteSettings() {
  const { data } = useBase(), { toast } = useToast();
  const [oldPassword, setOldPassword] = useState(""), [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const shared = data.profile.notePassword;
  const needsCurrent = !!shared || data.wikiPages.some(p => p.locked);
  const conflicted = currentWorkspace()?.conflicts.some(c => c.operation.path[0] === "profile" && c.operation.path[1] === "notePassword");
  return <section className="base-note-settings"><h3 className="flex items-center gap-2"><LockKeyhole className="h-4 w-4" /> Note privacy</h3>
    <p className="my-2 text-xs text-[var(--muted)]">One unlock password for this workspace, shared across its devices. It works offline after synchronization. Note contents keep their existing storage format.</p>
    {!shared && needsCurrent && <p className="my-2 text-xs">Enter the existing note password on a device that can already unlock these notes to migrate it safely.</p>}
    <form className="grid gap-3" onSubmit={event => {
      event.preventDefault(); setBusy(true); setError("");
      const scope = currentWorkspace()?.scope, expected = JSON.stringify(shared);
      void (async () => {
        if (password !== confirmation) throw new Error("The passwords do not match.");
        if (needsCurrent && !await verifyNotePassword(oldPassword)) throw new Error("The current note password is incorrect.");
        const verifier = await createWorkspaceNotePassword(password);
        await persistEdit(d => {
          if (currentWorkspace()?.scope !== scope || JSON.stringify(d.profile.notePassword) !== expected) throw new Error("The workspace password changed. Try again with the current password.");
          return { ...d, profile: { ...d.profile, notePassword: verifier } };
        });
        setPassword(""); setOldPassword(""); setConfirmation(""); toast("Workspace note password saved. Other devices receive it on their next sync.");
      })().catch(e => setError(e.message)).finally(() => setBusy(false));
    }}>
      {needsCurrent && <label>Current note password<input required type="password" autoComplete="current-password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} /></label>}
      <div className="base-note-password-fields"><label>{shared ? "New password" : "Workspace password"}<input type="password" required minLength={10} maxLength={4096} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
        <label>Confirm password<input type="password" required autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label></div>
      <button disabled={busy || conflicted} className="base-button base-button-secondary justify-self-start">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{shared ? "Change workspace password" : "Set workspace note password"}</button>
    </form>
    {conflicted && <p role="alert" className="mt-3 text-sm text-[var(--c-rose)]">A password change needs conflict review below before another change can be saved.</p>}
    {error && <p role="alert" className="mt-3 text-sm text-[var(--c-rose)]">{error}</p>}
  </section>;
}
