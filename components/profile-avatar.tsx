"use client";
import { BaseImage } from "@/lib/image";
import { initialOf, type UserProfile } from "@/lib/profile";
export function ProfileAvatar({ profile, className = "" }: { profile?: Partial<UserProfile>; className?: string }) {
  const src = profile?.avatarUrl;
  return <span className={`base-profile-avatar ${className}`}>
    {src && /^data:image\/(jpeg|png|webp);base64,/.test(src) && src.length <= 180000
      ? <BaseImage src={src} alt="" width={256} height={256} /> : initialOf(profile)}
  </span>;
}
