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
  const sizeClass = size === "lg" ? "w-16 h-16 rounded-xl" : "w-12 h-12 rounded-xl";
  const iconClass = size === "lg" ? "w-7 h-7" : "w-5 h-5";

  return (
    <div
      className={cn("relative shrink-0 overflow-hidden flex items-center justify-center", sizeClass, className)}
      style={src ? undefined : { background: `${hex}22` }}
    >
      {src ? (
        <img src={src} alt={`${name} logo`} className="w-full h-full object-cover" />
      ) : (
        <FolderKanban className={iconClass} style={{ color: hex }} />
      )}
    </div>
  );
}
