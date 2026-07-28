export interface ToggleablePage {
  href: string;
  label: string;
  group: "Command" | "Personal" | "Build" | "Systems" | "Intel";
  description: string;
}

export const TOGGLEABLE_PAGES: ToggleablePage[] = [
  { href: "/chat", label: "Chat", group: "Command", description: "AI conversations and research" },
  { href: "/player", label: "Personal", group: "Personal", description: "Personal scores, skills, and goals" },
  { href: "/gym", label: "Gym", group: "Personal", description: "Training, workouts, and body metrics" },
  { href: "/business", label: "Business", group: "Build", description: "Business performance and operations" },
  { href: "/projects", label: "Projects", group: "Build", description: "Projects, roadmaps, and milestones" },
  { href: "/vision", label: "Vision", group: "Build", description: "Infinite visual planning boards" },
  { href: "/notes", label: "Notes", group: "Build", description: "Notes, documents, and connected pages" },
  { href: "/tasks", label: "Tasks", group: "Systems", description: "Task planning and execution" },
  { href: "/focus", label: "Focus", group: "Systems", description: "Focus timer and sessions" },
  { href: "/habits", label: "Habits", group: "Systems", description: "Habits, routines, and streaks" },
  { href: "/finance", label: "Finance", group: "Intel", description: "Wallets, assets, and finances" },
  { href: "/learn", label: "Learn", group: "Intel", description: "AI-generated learning courses" },
  { href: "/news", label: "News", group: "Intel", description: "Markets, news, and creator feeds" },
];

export function pageIsVisible(hiddenPages: string[] | undefined, href: string): boolean {
  return href === "/" || href === "/settings" || !hiddenPages?.includes(href);
}
