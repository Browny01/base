"use client";
import { useState, useId, type Dispatch, type SetStateAction } from "react";
import { Camera, Loader2 } from "lucide-react";
import { ProfileAvatar } from "./profile-avatar";
import { detectTimeZone, timeZoneOptions, offsetMinutes, type UserProfile } from "@/lib/profile";
async function preparePhoto(file: File) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 10000000)
    throw new Error("Choose a JPG, PNG or WebP image under 10 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 256;
    const context = canvas.getContext("2d"); if (!context) throw new Error("Photo processing is unavailable.");
    const side = Math.min(image.width, image.height);
    context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, 256, 256);
    const value = canvas.toDataURL("image/jpeg", 0.82);
    if (value.length > 180000) throw new Error("Choose a smaller image.");
    return value;
  } finally { URL.revokeObjectURL(url); }
}
export function ProfileEditor({ value, onChange }: { value: UserProfile; onChange: Dispatch<SetStateAction<UserProfile>> }) {
  const id = useId(), [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <div className="base-profile-editor">
    <div className="base-profile-photo">
      <ProfileAvatar profile={value} className="base-profile-avatar-large" />
      <div><label className="base-button base-button-secondary" htmlFor={id}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} Add profile picture</label>
        <input id={id} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy} onChange={event => {
          const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (!file) return;
          setBusy(true); setError(""); void preparePhoto(file).then(avatarUrl => onChange(current => ({ ...current, avatarUrl }))).catch(e => setError(String(e.message))).finally(() => setBusy(false));
        }} />
        {value.avatarUrl && <button type="button" className="mt-2 block text-xs underline" onClick={() => onChange({ ...value, avatarUrl: undefined })}>Remove photo</button>}
        <p className="mt-2 text-xs text-[var(--muted)]">Your name and photo follow this workspace across devices.</p>
      </div>
    </div>
    <label>Your name<input required maxLength={80} autoComplete="name" value={value.name} onChange={e => onChange({ ...value, name: e.target.value })} placeholder="What should we call you?" /></label>
    <label>Timezone<select value={value.timezone || detectTimeZone()} onChange={e => onChange({ ...value, timezone: e.target.value, timezoneOffsetMinutes: offsetMinutes(e.target.value) })}>
      {timeZoneOptions(value.timezone).map(zone => <option key={zone.value} value={zone.value}>{zone.label}</option>)}
    </select></label>
    {error && <p role="alert" className="text-sm text-[var(--c-rose)]">{error}</p>}
  </div>;
}
