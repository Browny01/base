"use client";

// A fresh install lands in the setup wizard instead of an empty dashboard: no
// name, no timezone, no password yet. Runs once per profile — `onboardedAt` in
// the store is the switch, so it never nags an install that's already set up.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useBase } from "@/lib/hooks";
import { needsOnboarding } from "@/lib/profile";

export function FirstRunRedirect() {
  const { data, loaded } = useBase();
  const router = useRouter();

  useEffect(() => {
    // Wait for the store to hydrate: the server copy is the one that knows
    // whether this install already has a history worth keeping.
    if (!loaded) return;
    if (needsOnboarding(data.profile)) router.replace("/onboarding");
  }, [loaded, data.profile, router]);

  return null;
}