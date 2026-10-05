"use client";

import { useRouter } from "next/navigation";
import {
  HANDOFF_OPEN_NEW_PROJECT,
  HANDOFF_OPEN_NEW_TASK,
  LEGACY_HANDOFF_OPEN_NEW_PROJECT,
  LEGACY_HANDOFF_OPEN_NEW_TASK,
  requestHandoff,
  writeBaseKey,
} from "@/lib/base-storage";

// "New X" entry points, shared by the command palette and the keyboard
// shortcuts. Both routes signal the target page two ways: a localStorage flag
// (survives the navigation, needed by the native app's handoff too) and a DOM
// event (instant, for when we're already on the page).

export const EVENT_OPEN_NEW = "base_open_new_event";
export const DOM_OPEN_NEW_EVENT = "base:new-event";

export function useQuickActions() {
  const router = useRouter();

  return {
    newTask() {
      requestHandoff(HANDOFF_OPEN_NEW_TASK, [LEGACY_HANDOFF_OPEN_NEW_TASK]);
      router.push("/tasks");
    },
    newProject() {
      requestHandoff(HANDOFF_OPEN_NEW_PROJECT, [LEGACY_HANDOFF_OPEN_NEW_PROJECT]);
      router.push("/projects");
    },
    newEvent() {
      writeBaseKey(EVENT_OPEN_NEW, "1");
      window.dispatchEvent(new Event(DOM_OPEN_NEW_EVENT));
      router.push("/calendar");
    },
  };
}