"use client";

import { useState, useEffect } from "react";
import { useBridge } from "@/lib/hooks";
import { uid } from "@/lib/utils";
import { prepareProjectLogo } from "@/lib/project-logo";
import type { ProjectColor, ProjectStatus, ProjectCategory } from "@/lib/store";
import { Plus, FolderKanban, ChevronRight, Star, Layers, Upload, X } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ProjectLogo } from "@/components/project-logo";

const COLORS: ProjectColor[] = [
  "indigo", "cyan", "emerald", "yellow", "red", "purple", "orange", "pink",
];

const COLOR_HEX: Record<ProjectColor, string> = {
  indigo:  "#6366f1",
  cyan:    "#06b6d4",
  emerald: "#10b981",
  yellow:  "#eab308",
  red:     "#ef4444",
  purple:  "#a855f7",
  orange:  "#f97316",
  pink:    "#ec4899",
};

const STATUS_LABEL: Record<ProjectStatus, string> = {
  active: "Active", "on-hold": "On Hold", done: "Done",
};

const STATUS_COLOR: Record<ProjectStatus, string> = {
  active: "bg-[var(--chip)] text-[var(--text)]",
  "on-hold": "bg-[var(--chip)] text-[var(--text)]",
  done: "bg-[var(--chip)] text-[var(--muted)]",
};

function ProjectCard({ proj, taskCount, doneCount, linkCount, hasNote }: {
  proj: { id: string; name: string; description: string; color: ProjectColor; status: ProjectStatus; category: ProjectCategory; logoUrl?: string | null };
  taskCount: number; doneCount: number; linkCount: number; hasNote: boolean;
}) {
  const hex = COLOR_HEX[proj.color];
  return (
    <Link
      href={`/projects/${proj.id}`}
      className="group block bg-[var(--surface)] border rounded-xl p-5 hover:scale-[1.01] transition-all"
      style={{ borderColor: `${hex}59` }}
    >
      <div className="flex items-start justify-between mb-3">
        <ProjectLogo src={proj.logoUrl} color={proj.color} name={proj.name} />
        <div className="flex items-center gap-2">
          <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", STATUS_COLOR[proj.status])}>
            {STATUS_LABEL[proj.status]}
          </span>
          <ChevronRight className="w-4 h-4 text-[var(--faint)] group-hover:text-[var(--muted)] transition-colors" />
        </div>
      </div>
      <h3 className="font-semibold text-[var(--text)] mb-1 truncate">{proj.name}</h3>
      {proj.description && (
        <p className="text-xs text-[var(--muted)] mb-3 line-clamp-2">{proj.description}</p>
      )}
      <div className="flex items-center gap-3 text-xs text-[var(--faint)]">
        {(taskCount + doneCount) > 0 && <span>{taskCount} tasks</span>}
        {linkCount > 0 && <span>{linkCount} links</span>}
        {hasNote && <span>Notes</span>}
      </div>
    </Link>
  );
}

function SectionHeader({ icon, label, count }: { icon: React.ReactNode; label: string; count: number }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <div className="flex items-center gap-2 text-[var(--muted)]">
        {icon}
        <span className="text-sm font-semibold tracking-tight text-[var(--text)]">{label}</span>
      </div>
      <span className="text-xs text-[var(--faint)] bg-[var(--chip)] border border-[var(--border)] px-2 py-0.5 rounded-full">
        {count}
      </span>
      <div className="flex-1 h-px bg-[var(--chip)]" />
    </div>
  );
}

export function ProjectsPage() {
  const { data, mutate } = useBridge();
  const [showForm, setShowForm] = useState(false);
  // ⌘K → "New project" opens the form on arrival
  useEffect(() => { try { if (localStorage.getItem("bridge_open_new_project")) { localStorage.removeItem("bridge_open_new_project"); setShowForm(true); } } catch {} }, []);
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">("all");
  const [form, setForm] = useState<{
    name: string; description: string; color: ProjectColor;
    status: ProjectStatus; category: ProjectCategory; logoUrl: string | null;
  }>({ name: "", description: "", color: "indigo", status: "active", category: "major", logoUrl: null });

  function addProject() {
    if (!form.name.trim()) return;
    mutate((d) => ({
      ...d,
      projects: [...d.projects, {
        id: uid(),
        name: form.name.trim(),
        description: form.description.trim(),
        color: form.color,
        status: form.status,
        category: form.category,
        logoUrl: form.logoUrl,
        createdAt: new Date().toISOString(),
      }],
    }));
    setForm({ name: "", description: "", color: "indigo", status: "active", category: "major", logoUrl: null });
    setShowForm(false);
  }

  async function setLogo(file: File | undefined) {
    if (!file) return;
    try {
      const logoUrl = await prepareProjectLogo(file);
      setForm((f) => ({ ...f, logoUrl }));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not upload this logo.");
    }
  }

  const filtered = statusFilter === "all"
    ? data.projects
    : data.projects.filter((p) => p.status === statusFilter);

  const major = filtered.filter((p) => p.category === "major");
  const side  = filtered.filter((p) => p.category === "side");

  function projectStats(id: string) {
    return {
      taskCount: data.tasks.filter((t) => t.projectId === id && !t.done).length,
      doneCount: data.tasks.filter((t) => t.projectId === id && t.done).length,
      linkCount: data.projectLinks.filter((l) => l.projectId === id).length,
      hasNote: data.projectNotes.some((n) => n.projectId === id && n.content.trim()),
    };
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--text)] tracking-tight">Projects</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>

      {/* New Project Form */}
      {showForm && (
        <div className="bg-[var(--surface)] border border-[var(--border-2)] rounded-xl p-5 mb-6 space-y-4">
          <h2 className="text-sm font-semibold text-[var(--text)]">New Project</h2>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="md:col-span-2 flex items-center gap-3">
              <ProjectLogo src={form.logoUrl} color={form.color} name={form.name || "Project"} size="lg" />
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-2 px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-xs font-medium text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--border-2)] transition-colors cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  Upload Logo
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      void setLogo(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
                {form.logoUrl && (
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, logoUrl: null }))}
                    className="inline-flex items-center justify-center w-8 h-8 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-[var(--muted)] hover:text-[var(--text)] transition-colors"
                    title="Remove logo"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-[var(--muted)] uppercase tracking-widest font-semibold mb-1 block">Name</label>
              <input
                autoFocus
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)]"
                placeholder="Project name..."
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && addProject()}
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-[var(--muted)] uppercase tracking-widest font-semibold mb-1 block">Description</label>
              <input
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)]"
                placeholder="What is this project about?"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            {/* Category */}
            <div>
              <label className="text-xs text-[var(--muted)] uppercase tracking-widest font-semibold mb-2 block">Category</label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: "major", label: "Major", icon: Star, desc: "Core project" },
                  { value: "side",  label: "Side",  icon: Layers, desc: "Side project" },
                ] as const).map(({ value, label, icon: Icon, desc }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, category: value }))}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-all text-left",
                      form.category === value
                        ? "bg-[var(--chip)] border-[var(--border-2)] text-[var(--text)]"
                        : "bg-[var(--surface-2)] border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--border)]"
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <div>
                      <p className="font-medium leading-tight">{label}</p>
                      <p className="text-[10px] opacity-60">{desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Status */}
            <div>
              <label className="text-xs text-[var(--muted)] uppercase tracking-widest font-semibold mb-2 block">Status</label>
              <div className="flex gap-1.5">
                {(["active", "on-hold", "done"] as ProjectStatus[]).map((s) => (
                  <button key={s} onClick={() => setForm((f) => ({ ...f, status: s }))}
                    className={cn(
                      "flex-1 py-2 text-xs rounded-lg transition-colors font-medium",
                      form.status === s ? STATUS_COLOR[s] : "bg-[var(--surface-2)] text-[var(--muted)] hover:bg-[var(--chip)]"
                    )}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>

            {/* Color */}
            <div className="md:col-span-2">
              <label className="text-xs text-[var(--muted)] uppercase tracking-widest font-semibold mb-2 block">Color</label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map((c) => (
                  <button key={c} onClick={() => setForm((f) => ({ ...f, color: c }))}
                    className={cn(
                      "w-6 h-6 rounded-full transition-all",
                      form.color === c ? "ring-2 ring-[var(--text)] ring-offset-2 ring-offset-[var(--bg)]" : "opacity-50 hover:opacity-100"
                    )}
                    style={{ background: COLOR_HEX[c] }}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="px-4 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)] transition-colors">Cancel</button>
            <button onClick={addProject} className="px-5 py-1.5 bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] text-xs font-semibold rounded-lg transition-colors">
              Create Project
            </button>
          </div>
        </div>
      )}

      {/* Status filter */}
      <div className="flex gap-1 mb-8 bg-[var(--surface)] p-1 rounded-lg w-fit border border-[var(--border)]">
        {(["all", "active", "on-hold", "done"] as const).map((f) => (
          <button key={f} onClick={() => setStatusFilter(f)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize",
              statusFilter === f ? "bg-[var(--text)] text-[var(--bg)]" : "text-[var(--muted)] hover:text-[var(--text)]"
            )}
          >
            {f === "all" ? "All" : STATUS_LABEL[f as ProjectStatus]}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {major.length === 0 && side.length === 0 && (
        <div className="text-center py-20 text-[var(--faint)]">
          <FolderKanban className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">No projects yet. Create one to get started!</p>
        </div>
      )}

      {/* ── Major Projects ── */}
      {major.length > 0 && (
        <section className="mb-10">
          <SectionHeader icon={<Star className="w-4 h-4" />} label="Major Projects" count={major.length} />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {major.map((proj) => (
              <ProjectCard key={proj.id} proj={proj} {...projectStats(proj.id)} />
            ))}
          </div>
        </section>
      )}

      {/* ── Side Projects ── */}
      {side.length > 0 && (
        <section>
          <SectionHeader icon={<Layers className="w-4 h-4" />} label="Side Projects" count={side.length} />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {side.map((proj) => (
              <ProjectCard key={proj.id} proj={proj} {...projectStats(proj.id)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
