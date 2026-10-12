import { useState } from "react";
import { ProfileEditor } from "@/components/profile-editor";
import { useBase } from "@/lib/hooks";
import { useToast } from "@/lib/toast-context";
import { persistEdit } from "./store";
export function WorkspaceProfileSettings() {
  const { data } = useBase(), { toast } = useToast();
  const [profile, setProfile] = useState(data.profile), [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <section className="base-settings-card"><h2>Your profile</h2><p className="mb-5 mt-1 text-sm text-[var(--muted)]">Make this workspace feel like yours.</p>
    <form onSubmit={e => { e.preventDefault(); setBusy(true); setError("");
      void persistEdit(d => ({ ...d, profile: { ...d.profile, name: profile.name.trim(), avatarUrl: profile.avatarUrl, timezone: profile.timezone, timezoneOffsetMinutes: profile.timezoneOffsetMinutes } }))
        .then(() => toast("Profile saved to this workspace.")).catch(e => setError(e.message)).finally(() => setBusy(false));
    }}><ProfileEditor value={profile} onChange={setProfile} /><button disabled={busy || !profile.name.trim()} className="base-button base-button-primary mt-4">Save profile</button></form>
    {error && <p role="alert" className="mt-3 text-sm text-[var(--c-rose)]">{error}</p>}
  </section>;
}
