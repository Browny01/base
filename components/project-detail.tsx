"use client";

import { useState, useEffect } from "react";
import { useBridge } from "@/lib/hooks";
import { useToast } from "@/lib/toast-context";
import { prepareProjectLogo } from "@/lib/project-logo";
import { prepareProjectFile } from "@/lib/project-file";
import { uid, getToday } from "@/lib/utils";
import type { Task, Priority, TaskTag, ProjectStatus, ProjectColor, MilestoneStatus, ProjectFile } from "@/lib/store";
import {
  ArrowLeft, Plus, Trash2, Link2, FileText, CheckSquare,
  ExternalLink, Pencil, Check, X, Map, Circle, CircleDot, CheckCircle2,
  RotateCcw, Upload, Download, File as FileIcon,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { ProjectLogo } from "@/components/project-logo";

const COLOR_TEXT: Record<ProjectColor, string> = {
  indigo: "text-[var(--text)]", cyan: "text-[var(--text)]", emerald: "text-[var(--text)]",
  yellow: "text-[var(--text)]", red: "text-[var(--text)]",   purple: "text-[var(--text)]",
  orange: "text-[var(--text)]", pink: "text-[var(--text)]",
};
const COLOR_BG: Record<ProjectColor, string> = {
  indigo: "bg-[var(--chip)]", cyan: "bg-[var(--chip)]", emerald: "bg-[var(--chip)]",
  yellow: "bg-[var(--chip)]", red: "bg-[var(--chip)]",   purple: "bg-[var(--chip)]",
  orange: "bg-[var(--chip)]", pink: "bg-[var(--chip)]",
};
const COLOR_BORDER: Record<ProjectColor, string> = {
  indigo: "border-[var(--border-2)]", cyan: "border-[var(--border-2)]", emerald: "border-[var(--border-2)]",
  yellow: "border-[var(--border-2)]", red: "border-[var(--border-2)]",   purple: "border-[var(--border-2)]",
  orange: "border-[var(--border-2)]", pink: "border-[var(--border-2)]",
};

const PRIORITIES: Priority[] = ["P1", "P2", "P3"];
const TAGS: TaskTag[] = ["@work", "@personal", "@money", "@admin"];
const STATUSES: ProjectStatus[] = ["active", "on-hold", "done"];

const MILESTONE_STATUS: { value: MilestoneStatus; label: string; icon: React.ReactNode; color: string }[] = [
  { value: "planned",     label: "Planned",     icon: <Circle className="w-4 h-4" />,      color: "text-[var(--muted)]" },
  { value: "in-progress", label: "In Progress", icon: <CircleDot className="w-4 h-4" />,   color: "text-[var(--text)]" },
  { value: "done",        label: "Done",        icon: <CheckCircle2 className="w-4 h-4" />, color: "text-[var(--text)]" },
];

type Tab = "tasks" | "roadmap" | "files" | "links";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
}

export function ProjectDetail({ id }: { id: string }) {
  const { data, mutate } = useBridge();
  const { toast } = useToast();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("tasks");

  const project = data.projects.find((p) => p.id === id);

  // ── Project editing ──────────────────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editLogoUrl, setEditLogoUrl] = useState<string | null>(null);

  // ── Tasks ────────────────────────────────────────────────────────────────────
  const [taskTitle, setTaskTitle] = useState("");
  const [taskPriority, setTaskPriority] = useState<Priority>("P2");
  const [taskTag, setTaskTag] = useState<TaskTag>("@work");
  const [taskDue, setTaskDue] = useState("");
  const [showTaskForm, setShowTaskForm] = useState(false);

  // ── Documents ────────────────────────────────────────────────────────────────
  const projectDocs = (data.projectDocuments ?? [])
    .filter((d) => d.projectId === id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const projectFiles = (data.projectFiles ?? [])
    .filter((file) => file.projectId === id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [docContent, setDocContent] = useState("");
  const [docTitleEdit, setDocTitleEdit] = useState("");
  const [renamingDocId, setRenamingDocId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");

  const selectedDoc = projectDocs.find((d) => d.id === selectedDocId) ?? null;

  // Reset when switching projects
  useEffect(() => {
    setSelectedDocId(null);
    setDocContent("");
    setDocTitleEdit("");
  }, [id]);

  // Load content when selected doc changes (but not on content updates to avoid textarea reset)
  useEffect(() => {
    if (selectedDoc) {
      setDocContent(selectedDoc.content);
      setDocTitleEdit(selectedDoc.title);
    } else {
      setDocContent("");
      setDocTitleEdit("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDocId]);

  // Auto-select first doc whenever selection is empty and docs exist
  useEffect(() => {
    if (!selectedDocId && projectDocs.length > 0) {
      setSelectedDocId(projectDocs[0].id);
    }
  }, [projectDocs.length, selectedDocId]);

  // Migrate existing single-note to a document (runs once per project when docs tab first opened)
  useEffect(() => {
    if (tab !== "files") return;
    if (projectDocs.length > 0) return;
    const oldNote = data.projectNotes.find((n) => n.projectId === id && n.content.trim());
    if (!oldNote) return;
    const newDoc = {
      id: uid(), projectId: id, title: "Notes",
      content: oldNote.content, createdAt: oldNote.updatedAt, updatedAt: oldNote.updatedAt,
    };
    mutate((d) => ({ ...d, projectDocuments: [...(d.projectDocuments ?? []), newDoc] }));
    setSelectedDocId(newDoc.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, id]);

  // Auto-save doc content (debounced)
  useEffect(() => {
    if (!selectedDocId) return;
    const timer = setTimeout(() => {
      mutate((d) => ({
        ...d,
        projectDocuments: (d.projectDocuments ?? []).map((doc) =>
          doc.id === selectedDocId
            ? { ...doc, content: docContent, updatedAt: new Date().toISOString() }
            : doc
        ),
      }));
    }, 600);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docContent, selectedDocId]);

  // ── Links ────────────────────────────────────────────────────────────────────
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");

  // ── Roadmap ──────────────────────────────────────────────────────────────────
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneDue, setMilestoneDue] = useState("");
  const [showMilestoneForm, setShowMilestoneForm] = useState(false);

  if (!project) {
    return (
      <div className="p-6 text-center text-[var(--muted)]">
        <p>Project not found.</p>
        <Link href="/projects" className="text-[var(--text)] hover:text-[var(--text)] text-sm mt-2 block">← Back to Projects</Link>
      </div>
    );
  }

  const projectTasks = data.tasks.filter((t) => t.projectId === id);
  const openTasks = projectTasks.filter((t) => !t.done);
  const doneTasks = projectTasks.filter((t) => t.done);
  const projectLinks = data.projectLinks.filter((l) => l.projectId === id);
  const milestones = (data.milestones ?? [])
    .filter((m) => m.projectId === id)
    .sort((a, b) => (a.dueDate ?? "zzz").localeCompare(b.dueDate ?? "zzz") || a.createdAt.localeCompare(b.createdAt));
  const milestoneDone = milestones.filter((m) => m.status === "done").length;
  const milestoneProgress = milestones.length ? Math.round((milestoneDone / milestones.length) * 100) : 0;
  const today = getToday();

  // ── Handlers ─────────────────────────────────────────────────────────────────
  function startEdit() {
    setEditName(project!.name);
    setEditDesc(project!.description);
    setEditLogoUrl(project!.logoUrl ?? null);
    setEditing(true);
  }
  function saveEdit() {
    mutate((d) => ({ ...d, projects: d.projects.map((p) => p.id === id ? { ...p, name: editName.trim() || p.name, description: editDesc, logoUrl: editLogoUrl } : p) }));
    setEditing(false);
  }
  async function setProjectLogo(file: File | undefined) {
    if (!file) return;
    try {
      setEditLogoUrl(await prepareProjectLogo(file));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not upload this logo.");
    }
  }
  function setStatus(status: ProjectStatus) {
    mutate((d) => ({ ...d, projects: d.projects.map((p) => p.id === id ? { ...p, status } : p) }));
  }
  function deleteProject() {
    if (!confirm("Delete this project? Tasks will remain but be unlinked.")) return;
    // snapshot everything so Undo can restore the full project
    const snap = {
      project: data.projects.find((p) => p.id === id),
      notes: data.projectNotes.filter((n) => n.projectId === id),
      docs: (data.projectDocuments ?? []).filter((doc) => doc.projectId === id),
      files: (data.projectFiles ?? []).filter((file) => file.projectId === id),
      links: data.projectLinks.filter((l) => l.projectId === id),
      milestones: (data.milestones ?? []).filter((m) => m.projectId === id),
      taskIds: data.tasks.filter((t) => t.projectId === id).map((t) => t.id),
    };
    mutate((d) => ({
      ...d,
      projects: d.projects.filter((p) => p.id !== id),
      tasks: d.tasks.map((t) => t.projectId === id ? { ...t, projectId: undefined } : t),
      projectNotes: d.projectNotes.filter((n) => n.projectId !== id),
      projectDocuments: (d.projectDocuments ?? []).filter((doc) => doc.projectId !== id),
      projectFiles: (d.projectFiles ?? []).filter((file) => file.projectId !== id),
      projectLinks: d.projectLinks.filter((l) => l.projectId !== id),
      milestones: (d.milestones ?? []).filter((m) => m.projectId !== id),
    }));
    router.push("/projects");
    if (snap.project) toast("Project deleted", { action: { label: "Undo", onClick: () => mutate((d) => ({
      ...d,
      projects: [...d.projects, snap.project!],
      projectNotes: [...d.projectNotes, ...snap.notes],
      projectDocuments: [...(d.projectDocuments ?? []), ...snap.docs],
      projectFiles: [...(d.projectFiles ?? []), ...snap.files],
      projectLinks: [...d.projectLinks, ...snap.links],
      milestones: [...(d.milestones ?? []), ...snap.milestones],
      tasks: d.tasks.map((t) => snap.taskIds.includes(t.id) ? { ...t, projectId: id } : t),
    })) } });
  }
  function addTask() {
    if (!taskTitle.trim()) return;
    mutate((d) => ({
      ...d,
      tasks: [...d.tasks, { id: uid(), title: taskTitle.trim(), priority: taskPriority, tag: taskTag, dueDate: taskDue || null, recurring: null, done: false, createdAt: new Date().toISOString(), projectId: id }],
    }));
    setTaskTitle(""); setShowTaskForm(false);
  }
  function toggleTask(taskId: string) {
    mutate((d) => ({
      ...d,
      tasks: d.tasks.map((t) => {
        if (t.id !== taskId) return t;
        const done = !t.done;
        return { ...t, done, completedAt: done ? new Date().toISOString() : null };
      }),
    }));
  }
  function deleteTask(taskId: string) {
    mutate((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== taskId) }));
  }
  function editTask(taskId: string, updates: Partial<Task>) {
    mutate((d) => ({ ...d, tasks: d.tasks.map((t) => t.id === taskId ? { ...t, ...updates } : t) }));
  }
  function addLink() {
    if (!linkUrl.trim()) return;
    const url = linkUrl.startsWith("http") ? linkUrl.trim() : `https://${linkUrl.trim()}`;
    mutate((d) => ({ ...d, projectLinks: [...d.projectLinks, { id: uid(), projectId: id, url, label: linkLabel.trim() || url }] }));
    setLinkUrl(""); setLinkLabel("");
  }
  function deleteLink(linkId: string) {
    mutate((d) => ({ ...d, projectLinks: d.projectLinks.filter((l) => l.id !== linkId) }));
  }
  function addMilestone() {
    if (!milestoneTitle.trim()) return;
    mutate((d) => ({
      ...d,
      milestones: [...(d.milestones ?? []), { id: uid(), projectId: id, title: milestoneTitle.trim(), status: "planned" as MilestoneStatus, dueDate: milestoneDue || undefined, createdAt: new Date().toISOString() }],
    }));
    setMilestoneTitle(""); setMilestoneDue(""); setShowMilestoneForm(false);
  }
  function cycleMilestoneStatus(milestoneId: string) {
    const order: MilestoneStatus[] = ["planned", "in-progress", "done"];
    mutate((d) => ({
      ...d,
      milestones: (d.milestones ?? []).map((m) => m.id !== milestoneId ? m : { ...m, status: order[(order.indexOf(m.status) + 1) % order.length] }),
    }));
  }
  function deleteMilestone(milestoneId: string) {
    mutate((d) => ({ ...d, milestones: (d.milestones ?? []).filter((m) => m.id !== milestoneId) }));
  }

  // ── File/document handlers ───────────────────────────────────────────────────
  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    try {
      const prepared = await Promise.all(Array.from(files).map(prepareProjectFile));
      const now = new Date().toISOString();
      mutate((d) => ({
        ...d,
        projectFiles: [
          ...(d.projectFiles ?? []),
          ...prepared.map((file) => ({ id: uid(), projectId: id, createdAt: now, ...file })),
        ],
      }));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not upload one of those files.");
    }
  }
  function deleteFile(fileId: string) {
    mutate((d) => ({ ...d, projectFiles: (d.projectFiles ?? []).filter((file) => file.id !== fileId) }));
  }
  function createDoc() {
    const newDoc = {
      id: uid(), projectId: id, title: "Untitled",
      content: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    mutate((d) => ({ ...d, projectDocuments: [...(d.projectDocuments ?? []), newDoc] }));
    setSelectedDocId(newDoc.id);
    setDocContent("");
    setDocTitleEdit("Untitled");
  }
  function deleteDoc(docId: string) {
    mutate((d) => ({ ...d, projectDocuments: (d.projectDocuments ?? []).filter((doc) => doc.id !== docId) }));
    if (selectedDocId === docId) {
      const remaining = projectDocs.filter((d) => d.id !== docId);
      setSelectedDocId(remaining.length > 0 ? remaining[0].id : null);
    }
  }
  function startRename(docId: string, currentTitle: string) {
    setRenamingDocId(docId);
    setRenameVal(currentTitle);
  }
  function saveRename(docId: string) {
    const title = renameVal.trim() || "Untitled";
    mutate((d) => ({
      ...d,
      projectDocuments: (d.projectDocuments ?? []).map((doc) =>
        doc.id === docId ? { ...doc, title, updatedAt: new Date().toISOString() } : doc
      ),
    }));
    setRenamingDocId(null);
    if (selectedDocId === docId) setDocTitleEdit(title);
  }
  function saveDocTitle() {
    if (!selectedDocId) return;
    const title = docTitleEdit.trim() || "Untitled";
    mutate((d) => ({
      ...d,
      projectDocuments: (d.projectDocuments ?? []).map((doc) =>
        doc.id === selectedDocId ? { ...doc, title, updatedAt: new Date().toISOString() } : doc
      ),
    }));
  }

  return (
    <div className="p-4 sm:p-6">
      <Link href="/projects" className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--text)] mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Projects
      </Link>

      {/* Project header */}
      <div className={cn("rounded-xl p-5 mb-6 border", COLOR_BG[project.color], COLOR_BORDER[project.color])}>
        {editing ? (
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <ProjectLogo src={editLogoUrl} color={project.color} name={editName || project.name} size="lg" />
              <div className="flex-1 space-y-2">
                <input autoFocus className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-lg font-bold text-[var(--text)] focus:outline-none" value={editName} onChange={(e) => setEditName(e.target.value)} />
                <input className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none" placeholder="Description..." value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-2 px-3 py-1.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-xs font-medium text-[var(--muted)] hover:text-[var(--text)] transition-colors cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                Upload Logo
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    void setProjectLogo(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              {editLogoUrl && (
                <button onClick={() => setEditLogoUrl(null)} className="flex items-center gap-1 px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)] transition-colors">
                  <X className="w-3.5 h-3.5" /> Remove
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={saveEdit} className="flex items-center gap-1 text-xs text-[var(--text)] hover:text-[var(--text)]"><Check className="w-3.5 h-3.5" /> Save</button>
              <button onClick={() => setEditing(false)} className="flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--text)]"><X className="w-3.5 h-3.5" /> Cancel</button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <ProjectLogo src={project.logoUrl} color={project.color} name={project.name} size="lg" />
              <div className="min-w-0">
                <h1 className={cn("text-2xl font-bold tracking-tight mb-1 truncate", COLOR_TEXT[project.color])}>{project.name}</h1>
                {project.description && <p className="text-sm text-[var(--muted)]">{project.description}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <select className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text)] focus:outline-none" value={project.status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
                {STATUSES.map((s) => <option key={s} value={s}>{s === "on-hold" ? "On Hold" : s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
              <button onClick={startEdit} className="text-[var(--muted)] hover:text-[var(--text)] transition-colors p-1"><Pencil className="w-4 h-4" /></button>
              <button onClick={deleteProject} className="text-[var(--muted)] hover:text-[var(--text)] transition-colors p-1"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        )}
        <div className="flex gap-4 mt-4 text-xs text-[var(--faint)]">
          <span>{openTasks.length} open tasks</span>
          <span>{doneTasks.length} done</span>
          <span>{milestones.length} milestones</span>
          <span>{projectLinks.length} links</span>
          <span>{projectFiles.length + projectDocs.length} files</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-[var(--surface)] p-1 rounded-lg w-fit border border-[var(--border)]">
        {([
          { key: "tasks",   icon: CheckSquare, label: "Tasks" },
          { key: "roadmap", icon: Map,         label: "Roadmap" },
          { key: "files",   icon: FileText,    label: "Files" },
          { key: "links",   icon: Link2,       label: "Links" },
        ] as const).map(({ key, icon: Icon, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn("flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors", tab === key ? "bg-[var(--text)] text-[var(--bg)]" : "text-[var(--muted)] hover:text-[var(--text)]")}
          >
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {/* ── Tasks Tab ────────────────────────────────────────────────────────── */}
      {tab === "tasks" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowTaskForm(!showTaskForm)} className="flex items-center gap-2 px-4 py-2 bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] text-sm font-medium rounded-lg transition-colors">
              <Plus className="w-4 h-4" /> Add Task
            </button>
          </div>
          {showTaskForm && (
            <div className="bg-[var(--surface)] border border-[var(--border-2)] rounded-xl p-4 space-y-3">
              <input autoFocus className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)]" placeholder="Task title..." value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTask()} />
              <div className="flex gap-2 flex-wrap items-center">
                <div className="flex gap-1">
                  {PRIORITIES.map((p) => (
                    <button key={p} onClick={() => setTaskPriority(p)} className={cn("px-2 py-0.5 text-xs font-bold rounded transition-colors", taskPriority === p ? p === "P1" ? "bg-[var(--text)] text-[var(--bg)]" : p === "P2" ? "bg-[var(--text)] text-[var(--bg)]" : "bg-[var(--border)] text-[var(--text)]" : "bg-[var(--surface-2)] text-[var(--muted)] hover:bg-[var(--chip)]")}>{p}</button>
                  ))}
                </div>
                <select className="bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text)] focus:outline-none" value={taskTag} onChange={(e) => setTaskTag(e.target.value as TaskTag)}>
                  {TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <input type="date" className="bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text)] focus:outline-none" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} />
                <button onClick={addTask} className="ml-auto px-3 py-1 bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] text-xs rounded-lg transition-colors">Add</button>
              </div>
            </div>
          )}
          {openTasks.length === 0 && !showTaskForm ? (
            <p className="text-sm text-[var(--faint)] text-center py-8">No open tasks.</p>
          ) : (
            <div className="space-y-2">
              {openTasks.sort((a, b) => ({ P1: 0, P2: 1, P3: 2 }[a.priority] - { P1: 0, P2: 1, P3: 2 }[b.priority])).map((task) => (
                <TaskRow key={task.id} task={task} today={today} onToggle={toggleTask} onDelete={deleteTask} onEdit={editTask} />
              ))}
            </div>
          )}
          {doneTasks.length > 0 && (
            <div className="mt-6">
              <p className="text-xs text-[var(--faint)] uppercase tracking-wider mb-3">Done ({doneTasks.length})</p>
              <div className="space-y-2">{doneTasks.map((task) => <TaskRow key={task.id} task={task} today={today} onToggle={toggleTask} onDelete={deleteTask} onEdit={editTask} />)}</div>
            </div>
          )}
        </div>
      )}

      {/* ── Roadmap Tab ──────────────────────────────────────────────────────── */}
      {tab === "roadmap" && (
        <div>
          {milestones.length > 0 && (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-[var(--text)]">Roadmap Progress</span>
                <span className="text-sm font-bold text-[var(--text)] tabular-nums">{milestoneProgress}%</span>
              </div>
              <div className="w-full bg-[var(--chip)] rounded-full h-2">
                <div className="h-2 rounded-full bg-[var(--text)] transition-all" style={{ width: `${milestoneProgress}%` }} />
              </div>
              <p className="text-xs text-[var(--faint)] mt-2">{milestoneDone} of {milestones.length} milestones complete</p>
            </div>
          )}

          <div className="flex justify-end mb-6">
            <button onClick={() => setShowMilestoneForm(v => !v)} className="flex items-center gap-2 px-4 py-2 bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] text-sm font-medium rounded-lg transition-colors">
              <Plus className="w-4 h-4" /> Add Milestone
            </button>
          </div>

          {showMilestoneForm && (
            <div className="bg-[var(--surface)] border border-[var(--border-2)] rounded-xl p-4 space-y-3 mb-6">
              <input autoFocus className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)]" placeholder="Milestone title..." value={milestoneTitle} onChange={(e) => setMilestoneTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addMilestone()} />
              <div className="flex gap-3 items-center">
                <label className="text-xs text-[var(--muted)] shrink-0">Target date</label>
                <input type="date" className="bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text)] focus:outline-none" value={milestoneDue} onChange={(e) => setMilestoneDue(e.target.value)} />
                <button onClick={addMilestone} className="ml-auto px-4 py-1 bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] text-xs rounded-lg transition-colors">Add</button>
              </div>
            </div>
          )}

          {milestones.length === 0 ? (
            <div className="text-center py-14 text-[var(--faint)]">
              <Map className="w-8 h-8 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No milestones yet — map out your project roadmap!</p>
              <p className="text-xs mt-1 text-[var(--faint)]">Click the status icon to cycle: Planned → In Progress → Done</p>
            </div>
          ) : (
            /* Horizontal scrolling roadmap */
            <div className="overflow-x-auto -mx-6 px-6 pb-4">
              <div className="flex items-start min-w-max relative">
                {/* Horizontal connector line through all icon centers */}
                {milestones.length > 1 && (
                  <div
                    className="absolute bg-[var(--chip)] h-px pointer-events-none"
                    style={{ top: "20px", left: "80px", width: `calc(100% - 160px)` }}
                  />
                )}
                {milestones.map((m) => {
                  const msInfo = MILESTONE_STATUS.find((s) => s.value === m.status)!;
                  const overdue = m.dueDate && m.dueDate < today && m.status !== "done";
                  return (
                    <div key={m.id} className="flex flex-col items-center w-40 shrink-0 group px-2">
                      {/* Status icon — sits on the connector line */}
                      <button
                        onClick={() => cycleMilestoneStatus(m.id)}
                        title="Click to cycle status"
                        className={cn(
                          "z-10 bg-[var(--text)] border border-[var(--border)] rounded-full p-1.5 mb-4 transition-all hover:scale-110",
                          msInfo.color
                        )}
                      >
                        {msInfo.icon}
                      </button>
                      {/* Card */}
                      <div className={cn(
                        "w-full bg-[var(--surface)] border rounded-xl px-3 py-3 transition-colors",
                        m.status === "done" ? "border-[var(--border-2)]" : m.status === "in-progress" ? "border-[var(--border-2)]" : "border-[var(--border)]"
                      )}>
                        <div className="flex items-start justify-between gap-1 mb-1.5">
                          <p className={cn("text-sm font-medium leading-snug", m.status === "done" ? "text-[var(--faint)] line-through" : "text-[var(--text)]")}>{m.title}</p>
                          <button onClick={() => deleteMilestone(m.id)} className="opacity-0 group-hover:opacity-100 text-[var(--faint)] hover:text-[var(--text)] transition-all shrink-0 mt-0.5">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        <p className={cn("text-xs font-medium", msInfo.color)}>{msInfo.label}</p>
                        {m.dueDate && (
                          <p className={cn("text-xs mt-1", overdue ? "text-[var(--text)] font-medium" : "text-[var(--faint)]")}>
                            {overdue ? "⚠ " : ""}{m.dueDate}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Files Tab ────────────────────────────────────────────────────────── */}
      {tab === "files" && (
        <div className="space-y-6">
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-semibold text-[var(--text)]">Uploaded Files</h2>
                <p className="text-xs text-[var(--faint)] mt-0.5">Images, PDFs, docs, spreadsheets, zips and more.</p>
              </div>
              <label className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] text-sm font-medium rounded-lg transition-colors cursor-pointer">
                <Upload className="w-4 h-4" />
                Upload Files
                <input
                  type="file"
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    void uploadFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>

            {projectFiles.length === 0 ? (
              <div className="border border-dashed border-[var(--border)] rounded-xl py-10 px-4 text-center">
                <FileIcon className="w-8 h-8 mx-auto mb-3 text-[var(--faint)]" />
                <p className="text-sm text-[var(--faint)]">No uploaded files yet.</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {projectFiles.map((file) => (
                  <ProjectFileCard key={file.id} file={file} onDelete={deleteFile} />
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold text-[var(--text)]">Documents</h2>
                <p className="text-xs text-[var(--faint)] mt-0.5">Keep writing project notes here. They auto-save as before.</p>
              </div>
            </div>

            <div className="flex min-h-[520px]">
          {/* Sidebar */}
          <div className="w-52 shrink-0 border-r border-[var(--border)] pr-3 flex flex-col gap-1">
            <button
              onClick={createDoc}
              className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)] rounded-lg transition-colors w-full mb-1"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>New Document</span>
            </button>

            {projectDocs.map((doc) => (
              <div
                key={doc.id}
                className={cn(
                  "group flex items-center gap-1 pl-3 pr-1.5 py-2 rounded-lg cursor-pointer transition-colors",
                  selectedDocId === doc.id
                    ? "bg-[var(--chip)] text-[var(--text)]"
                    : "text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--chip)]"
                )}
                onClick={() => setSelectedDocId(doc.id)}
              >
                {renamingDocId === doc.id ? (
                  <input
                    autoFocus
                    value={renameVal}
                    onChange={(e) => setRenameVal(e.target.value)}
                    onBlur={() => saveRename(doc.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveRename(doc.id);
                      if (e.key === "Escape") setRenamingDocId(null);
                    }}
                    className="flex-1 min-w-0 bg-[var(--chip)] text-xs text-[var(--text)] outline-none rounded px-1.5 py-0.5 border border-[var(--border-2)]"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <FileText className="w-3.5 h-3.5 shrink-0 opacity-50" />
                    <span className="flex-1 text-sm truncate min-w-0">{doc.title || "Untitled"}</span>
                    <div className="opacity-0 group-hover:opacity-100 flex shrink-0 gap-0.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); startRename(doc.id, doc.title); }}
                        className="p-1 text-[var(--faint)] hover:text-[var(--text)] transition-colors rounded"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteDoc(doc.id); }}
                        className="p-1 text-[var(--faint)] hover:text-[var(--text)] transition-colors rounded"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}

            {projectDocs.length === 0 && (
              <p className="text-xs text-[var(--faint)] px-3 py-6 text-center">No documents yet</p>
            )}
          </div>

          {/* Editor */}
          <div className="flex-1 pl-6 flex flex-col min-w-0">
            {selectedDoc ? (
              <>
                <input
                  className="w-full text-xl font-semibold text-[var(--text)] bg-transparent border-b border-transparent hover:border-[var(--border)] focus:border-[var(--border-2)] focus:outline-none pb-3 mb-4 transition-colors"
                  value={docTitleEdit}
                  onChange={(e) => setDocTitleEdit(e.target.value)}
                  onBlur={saveDocTitle}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  placeholder="Untitled"
                />
                <textarea
                  className="flex-1 w-full min-h-[420px] bg-transparent text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none resize-none leading-relaxed"
                  placeholder="Start writing…"
                  value={docContent}
                  onChange={(e) => setDocContent(e.target.value)}
                />
                <p className="text-xs text-[var(--faint)] mt-3 shrink-0">Auto-saves as you type</p>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <FileText className="w-10 h-10 mx-auto mb-3 text-[var(--faint)]" />
                  <p className="text-sm text-[var(--faint)] mb-4">No documents yet</p>
                  <button
                    onClick={createDoc}
                    className="flex items-center gap-2 px-4 py-2 bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] text-sm font-medium rounded-lg transition-colors mx-auto"
                  >
                    <Plus className="w-4 h-4" /> Create Document
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
          </section>
        </div>
      )}

      {/* ── Links Tab ────────────────────────────────────────────────────────── */}
      {tab === "links" && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input className="flex-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)]" placeholder="https://..." value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addLink()} />
            <input className="w-40 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)]" placeholder="Label (optional)" value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addLink()} />
            <button onClick={addLink} className="px-4 py-2 bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] text-sm font-medium rounded-lg transition-colors"><Plus className="w-4 h-4" /></button>
          </div>
          {projectLinks.length === 0 ? (
            <p className="text-sm text-[var(--faint)] text-center py-8">No links yet.</p>
          ) : (
            <div className="space-y-2">
              {projectLinks.map((link) => (
                <div key={link.id} className="flex items-center gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3 group hover:border-[var(--border)] transition-colors">
                  <Link2 className="w-4 h-4 text-[var(--faint)] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--text)] truncate">{link.label}</p>
                    <p className="text-xs text-[var(--faint)] truncate">{link.url}</p>
                  </div>
                  <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-[var(--faint)] hover:text-[var(--text)] transition-colors"><ExternalLink className="w-4 h-4" /></a>
                  <button onClick={() => deleteLink(link.id)} className="opacity-0 group-hover:opacity-100 text-[var(--faint)] hover:text-[var(--text)] transition-all"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const PROJ_PRIORITIES: Priority[] = ["P1", "P2", "P3"];
const PROJ_TAGS: TaskTag[] = ["@work", "@personal", "@money", "@admin"];

function TaskRow({ task, today, onToggle, onDelete, onEdit }: {
  task: Task; today: string;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, updates: Partial<Task>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ title: task.title, priority: task.priority, tag: task.tag, dueDate: task.dueDate ?? "" });

  function saveEdit() {
    onEdit(task.id, { title: editForm.title.trim() || task.title, priority: editForm.priority, tag: editForm.tag, dueDate: editForm.dueDate || null });
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border-2)] rounded-lg p-3 space-y-2">
        <input autoFocus className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--border-2)]" value={editForm.title} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && saveEdit()} />
        <div className="flex gap-2 flex-wrap items-center">
          <div className="flex gap-1">
            {PROJ_PRIORITIES.map((p) => (
              <button key={p} onClick={() => setEditForm((f) => ({ ...f, priority: p }))} className={cn("px-2 py-0.5 text-xs font-bold rounded transition-colors", editForm.priority === p ? p === "P1" ? "bg-[var(--text)] text-[var(--bg)]" : p === "P2" ? "bg-[var(--text)] text-[var(--bg)]" : "bg-[var(--border)] text-[var(--text)]" : "bg-[var(--surface-2)] text-[var(--muted)]")}>{p}</button>
            ))}
          </div>
          <select className="bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text)] focus:outline-none" value={editForm.tag} onChange={(e) => setEditForm((f) => ({ ...f, tag: e.target.value as TaskTag }))}>
            {PROJ_TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input type="date" className="bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text)] focus:outline-none" value={editForm.dueDate} onChange={(e) => setEditForm((f) => ({ ...f, dueDate: e.target.value }))} />
          <div className="ml-auto flex gap-1">
            <button onClick={() => setEditing(false)} className="px-2 py-1 text-xs text-[var(--muted)] hover:text-[var(--text)] transition-colors flex items-center gap-1"><X className="w-3 h-3" /> Cancel</button>
            <button onClick={saveEdit} className="px-3 py-1 text-xs bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] rounded-lg transition-colors flex items-center gap-1"><Check className="w-3 h-3" /> Save</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3 group hover:border-[var(--border)] transition-colors">
      <button onClick={() => onToggle(task.id)} className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors", task.done ? "bg-[var(--text)] border-[var(--border-2)]" : "border-[var(--border)] hover:border-[var(--border-2)]")}>
        {task.done && <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-[var(--text)]" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </button>
      <span className={cn("flex-1 text-sm", task.done ? "text-[var(--faint)] line-through" : "text-[var(--text)]")}>{task.title}</span>
      <div className="flex items-center gap-2 text-xs">
        {task.recurring && <RotateCcw className="w-3 h-3 text-[var(--text)]" />}
        <span className="text-[var(--faint)]">{task.tag}</span>
        <span className={cn("font-bold px-1.5 py-0.5 rounded", task.priority === "P1" ? "bg-[var(--chip)] text-[var(--text)]" : task.priority === "P2" ? "bg-[var(--chip)] text-[var(--text)]" : "bg-[var(--chip)] text-[var(--faint)]")}>{task.priority}</span>
        {task.dueDate && <span className={cn("text-xs", task.dueDate < today && !task.done ? "text-[var(--text)]" : "text-[var(--faint)]")}>{task.dueDate}</span>}
        <button onClick={() => setEditing(true)} className="opacity-0 group-hover:opacity-100 text-[var(--faint)] hover:text-[var(--text)] transition-all"><Pencil className="w-3.5 h-3.5" /></button>
        <button onClick={() => onDelete(task.id)} className="opacity-0 group-hover:opacity-100 text-[var(--faint)] hover:text-[var(--text)] transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  );
}

function ProjectFileCard({ file, onDelete }: { file: ProjectFile; onDelete: (id: string) => void }) {
  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf";

  return (
    <div className="group bg-[var(--surface-2)] border border-[var(--border)] rounded-xl overflow-hidden hover:border-[var(--border-2)] transition-colors">
      <a href={file.dataUrl} target="_blank" rel="noopener noreferrer" className="block aspect-[4/3] bg-[var(--chip)]">
        {isImage ? (
          <img src={file.dataUrl} alt={file.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {isPdf ? <FileText className="w-10 h-10 text-[var(--faint)]" /> : <FileIcon className="w-10 h-10 text-[var(--faint)]" />}
          </div>
        )}
      </a>
      <div className="p-3">
        <p className="text-sm font-medium text-[var(--text)] truncate" title={file.name}>{file.name}</p>
        <p className="text-xs text-[var(--faint)] mt-0.5">{isPdf ? "PDF" : file.type || "File"} · {formatFileSize(file.size)}</p>
        <div className="flex items-center gap-2 mt-3">
          <a
            href={file.dataUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)] transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open
          </a>
          <a
            href={file.dataUrl}
            download={file.name}
            className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)] transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Download
          </a>
          <button
            onClick={() => onDelete(file.id)}
            className="ml-auto text-[var(--faint)] hover:text-[var(--text)] transition-colors"
            title="Delete file"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
