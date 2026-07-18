import { FolderKanban } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProjectColor } from "@/lib/store";

const COLOR_HEX: Record<ProjectColor, string> = {
  indigo: "#6366f1",
  cyan: "#06b6d4",
  emerald: "#10b981",
  yellow: "#eab308",
  red: "#ef4444",
  purple: "#a855f7",
  orange: "#f97316",
  pink: "#ec4899",
};

export function ProjectLogo({
  src,
  color,
  name,
  size = "md",
  className,
}: {
  src?: string | null;
  color: ProjectColor;
  name: string;
  size?: "md" | "lg";
  className?: string;
}) {
  const hex = COLOR_HEX[color];
  const sizeClass = size === "lg" ? "w-14 h-14 rounded-xl" : "w-8 h-8 rounded-lg";
  const iconClass = size === "lg" ? "w-6 h-6" : "w-4 h-4";

  return (
    <div
      className={cn("relative shrink-0 overflow-hidden flex items-center justify-center", sizeClass, className)}
      style={{ background: `${hex}22` }}
    >
      {src ? (
        <img src={src} alt={`${name} logo`} className="w-full h-full object-cover" />
      ) : (
        <FolderKanban className={iconClass} style={{ color: hex }} />
      )}
    </div>
  );
}
