"use client";

import { DEFAULT_CHAT_SETTINGS, type ChatSettings } from "@/lib/chat-models";
import { DEFAULT_NEWS_PREFS, type NewsPrefs } from "@/lib/news-prefs";
import { DEFAULT_AUTONOMY_SETTINGS, type AutonomySettings, type AutonomyState, type AutonomyTaskClass } from "@/lib/autonomy";

export type Priority = "P1" | "P2" | "P3";
export type TaskTag = "@work" | "@personal" | "@money" | "@admin" | "@night-auto" | `@${string}`;
export type RecurringFreq = "daily" | "weekly" | "monthly" | null;
export type HabitType = "button" | "input";

export interface SubTask { id: string; title: string; done: boolean }

export interface Task {
  id: string;
  title: string;
  priority: Priority;
  tag: TaskTag;
  dueDate: string | null;
  recurring: RecurringFreq;
  done: boolean;
  createdAt: string;
  completedAt?: string | null;
  projectId?: string;
  subtasks?: SubTask[];
  nightPolicy?: "autonomous-v1" | string;
  executionState?: AutonomyState;
  autonomyBrief?: string;
  executionNote?: string;
  executionStartedAt?: string;
  lastExecutionStartedAt?: string;
  executionLeaseUntil?: string;
  leaseUntil?: string;
  lastLeaseExpiredAt?: string;
  requeuedAt?: string;
  approvedAt?: string;
  nightExecutedAt?: string;
  executionAgent?: string;
  executionId?: string;
  executionFinishedAt?: string;
  workerModel?: string;
  resultNoteId?: string;
  resultSummary?: string;
  verifiedAt?: string;
  verificationStatus?: "pending" | "awaiting_review" | "passed" | "failed" | "verified" | "rejected" | "needs_correction";
  executionEvidence?: unknown[];
  correctionAttempts?: number;
  implementationApproved?: boolean;
  taskClass?: AutonomyTaskClass;
  parentTaskId?: string;
  dependencyIds?: string[];
  blockedReason?: string;
  workspace?: string;
}

export type CalendarRepeat = "none" | "daily" | "weekly" | "monthly";
export type CalendarCategory = "work" | "personal" | "money" | "health" | "other";

export interface CalendarEvent {
  id: string;
  title: string;
  startDate: string;       // YYYY-MM-DD, interpreted in the device's local timezone
  endDate: string;         // inclusive YYYY-MM-DD
  allDay: boolean;
  startTime?: string;      // HH:MM for timed events
  endTime?: string;        // HH:MM for timed events
  category: CalendarCategory;
  color: ProjectColor;
  location?: string;
  notes?: string;
  repeat: CalendarRepeat;
  createdAt: string;
  updatedAt: string;
}

export interface FocusSession {
  id: string;
  durationMins: number;
  tag: TaskTag;
  notes: string;
  date: string;
}

export type IncomeType = "income" | "spent";

export interface IncomeEntry {
  id: string;
  source: string;
  amount: number;
  date: string;
  type: IncomeType;
  client?: string;
}

export type SubscriptionFrequency = "weekly" | "monthly" | "quarterly" | "yearly";

export interface PaymentSubscription {
  id: string;
  name: string;
  amount: number;
  dueDate: string;
  frequency: SubscriptionFrequency;
  category: string;
  notes?: string;
  active: boolean;
  createdAt: string;
}

export interface Habit {
  id: string;
  name: string;
  emoji: string;
  type: HabitType;
  unit?: string;       // optional label for input habits, e.g. "glasses", "km"
  reminderTime: string | null;
}

export interface HabitLog {
  id: string;
  habitId: string;
  date: string;
  completed: boolean;
  value?: string;      // for input habits
}

export type ProjectStatus = "active" | "on-hold" | "done";
export type ProjectCategory = "major" | "side";
export type ProjectColor =
  | "indigo" | "cyan" | "emerald" | "yellow" | "red" | "purple" | "orange" | "pink";

export interface Project {
  id: string;
  name: string;
  description: string;
  color: ProjectColor;
  status: ProjectStatus;
  category: ProjectCategory;
  archived?: boolean;
  logoUrl?: string | null;
  createdAt: string;
}

export type MilestoneStatus = "planned" | "in-progress" | "done";

export interface Milestone {
  id: string;
  projectId: string;
  title: string;
  status: MilestoneStatus;
  dueDate?: string;
  createdAt: string;
}

export interface ProjectNote {
  id: string;
  projectId: string;
  content: string;
  updatedAt: string;
}

export interface ProjectDocument {
  id: string;
  projectId: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectFile {
  id: string;
  projectId: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string;
  createdAt: string;
}

export interface ProjectLink {
  id: string;
  projectId: string;
  url: string;
  label: string;
}

export type WalletNetwork = "bitcoin" | "solana" | "ethereum" | "hyperevm";

export interface Wallet {
  id: string;
  network: WalletNetwork;
  address: string;
  label: string;
}

export interface PortfolioSnapshot {
  date: string;
  totalAud: number;
}

// ── School ────────────────────────────────────────────────────────────────────

export interface Exam {
  id: string;
  subject: string;
  date: string;      // YYYY-MM-DD
  time?: string;     // HH:MM (optional)
  notes?: string;
  color?: ProjectColor;
}

export type SchoolDay = "Mon" | "Tue" | "Wed" | "Thu" | "Fri";
export type PeriodKey = "P1" | "P2" | "P3" | "P4" | "P5" | "P6";

export type Timetable = Partial<Record<SchoolDay, Partial<Record<PeriodKey, string>>>>;

export interface SchoolNote {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
}

// ── Business ──────────────────────────────────────────────────────────────────

export type SocialPlatform = "x" | "instagram" | "tiktok" | "linkedin" | "youtube";

export interface SocialStat {
  platform: SocialPlatform;
  followers: number;
  following?: number;
  posts?: number;
  avgViews?: number;
  monthlyGrowth?: number;
  engagementRate?: number;
  lastUpdated: string;
}

export interface BusinessKPI {
  id: string;
  label: string;
  value: string;
  prefix?: string;
  suffix?: string;
  change?: number;
  color: string;
  icon: string;
  category: string;
  lastUpdated: string;
}

// ── Hermes briefings ─────────────────────────────────────────────────────

export type BriefType = "morning_coo" | "weekly_business_review" | "content_opportunity";

export interface Brief {
  id: string;
  type: BriefType;
  title: string;
  contentMarkdown: string;
  generatedAt: string;
  periodStart?: string;
  periodEnd?: string;
  workspace?: string;
  sourceRunId?: string;
  status: "published";
  createdAt: string;
  updatedAt: string;
}

// ── Player OS ─────────────────────────────────────────────────────────────────

export type DomainKey = "mental" | "physical" | "sports" | "appearance" | "culture" | "wealth" | "lifestyle";
export type SkillType = "skill" | "trait" | "habit" | "metric" | "knowledge";
export type ReviewFreq = "weekly" | "monthly" | "quarterly";

export interface SkillLog { date: string; score: number; }

export interface PlayerSkill {
  id: string;
  name: string;
  domain: DomainKey;
  subdomain: string;
  type: SkillType;
  currentScore: number;   // 1–10
  targetScore: number;    // 1–10
  weight: number;         // 1–10 importance within domain
  testMethod?: string;
  primaryMetric?: string;
  reviewFrequency?: ReviewFreq;
  lastReviewed?: string;  // YYYY-MM-DD
  bottleneck?: string;
  nextAction?: string;
  notes?: string;
  history?: SkillLog[];
}

// ── AI Chat ──────────────────────────────────────────────────────────────────────

export type ChatRole = "user" | "assistant";

export type ChatAttachmentKind = "image" | "pdf" | "text";
export interface ChatAttachment {
  id: string;
  name: string;
  mime: string;
  kind: ChatAttachmentKind;
  size: number;
  url?: string;    // hosted Blob URL (images / pdfs)
  text?: string;   // inline text content (markdown / code / plain text)
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  attachments?: ChatAttachment[];
  sources?: string[];       // cited URLs (web-search results)
}

export interface ChatFolder {
  id: string;
  name: string;
  createdAt: string;
}

export interface ChatSkill {
  id: string;
  name: string;
  instructions: string;     // appended to the system prompt when enabled
  enabled: boolean;
}

export interface ChatThread {
  id: string;
  title: string;
  model: string;            // e.g. "gemini-2.5-flash"
  messages: ChatMessage[];
  pinned?: boolean;
  folderId?: string | null; // groups chats under a sidebar folder
  projectId?: string | null; // links a chat to a Base project
  deletedAt?: string | null; // soft-deleted to Trash (purged after 14 days)
  locked?: boolean;         // requires a passcode to open
  lockPass?: string;        // the passcode (client-side soft lock)
  createdAt: string;
  updatedAt: string;
}

// ── Learning / Research (AI-generated interactive courses) ──────────────────────

export interface QuizQuestion {
  id: string;
  q: string;
  options: string[];
  answer: number;        // index into options
  explanation?: string;
  chosen?: number;       // the learner's selected answer (progress)
}

export interface CourseLesson {
  id: string;
  title: string;
  content: string;       // markdown lesson body
  keyPoints?: string[];
  quiz?: QuizQuestion[];
  interactiveIdea?: string;   // AI's suggestion for an interactive widget/game
  interactive?: string;       // generated self-contained HTML (rendered in a sandboxed iframe)
  interactiveTitle?: string;
  done: boolean;
}

export interface CourseModule {
  id: string;
  title: string;
  summary?: string;
  lessons: CourseLesson[];
}

export type CourseLevel = "beginner" | "intermediate" | "advanced";
export type CourseStatus = "generating" | "ready" | "error";

export interface Course {
  id: string;
  topic: string;
  specifics?: string;
  level: CourseLevel;
  overview: string;      // markdown intro
  modules: CourseModule[];
  sources?: string[];
  model: string;
  status: CourseStatus;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Goals (daily / weekly / monthly / yearly) ──────────────────────────────────

export type GoalPeriod = "daily" | "weekly" | "monthly" | "yearly";

export interface Goal {
  id: string;
  period: GoalPeriod;
  text: string;
  done: boolean;
  createdAt: string;
}

// ── Gym / Workouts ──────────────────────────────────────────────────────────────

export interface WorkoutSet {
  id: string;
  reps: number;
  weight: number;   // kg (0 = bodyweight)
  done: boolean;
}

export interface WorkoutExercise {
  id: string;
  name: string;
  sets: WorkoutSet[];
}

export interface Workout {
  id: string;
  date: string;       // YYYY-MM-DD
  name: string;       // e.g. "Push Day"
  exercises: WorkoutExercise[];
  durationMins?: number;
  notes?: string;
  createdAt: string;
}

// ── Vision Board ──────────────────────────────────────────────────────────────

export type BoardItemType = "photo" | "note" | "music";
export type NoteColor = "yellow" | "pink" | "blue" | "green" | "purple" | "gray";

export interface BoardItem {
  id: string;
  boardId: string;      // which VisionBoard this belongs to
  type: BoardItemType;
  x: number;            // px position on the canvas
  y: number;
  width: number;        // px size
  height: number;
  z: number;            // stacking order
  rotation: number;     // degrees, for a hand-pinned feel
  // photo (also used as the cover image for music)
  src?: string;         // data URL (downscaled JPEG) / hosted URL
  caption?: string;
  // note
  text?: string;
  color?: NoteColor;
  // music
  audioSrc?: string;    // hosted mp3 URL
  title?: string;       // song title
  artist?: string;      // song artist
  createdAt: string;
}

export interface VisionBoard {
  id: string;
  name: string;
  createdAt: string;
}

export type DrawTool = "pen" | "line" | "arrow" | "rect" | "ellipse";

export interface BoardDrawing {
  id: string;
  boardId: string;
  tool: DrawTool;
  color: string;
  width: number;                          // stroke width
  points?: { x: number; y: number }[];    // pen freehand path
  x1?: number; y1?: number;               // line / arrow / rect / ellipse bounds
  x2?: number; y2?: number;
  createdAt: string;
}

// ── Wiki / Notes (Notion + Obsidian style) ─────────────────────────────────────

export type WikiBlockType =
  | "text" | "h1" | "h2" | "h3"
  | "bulleted" | "numbered" | "todo"
  | "quote" | "code" | "divider" | "image"
  | "table" | "board" | "chart"
  | "callout" | "toggle" | "pagelink"
  // extended blocks
  | "bookmark" | "embed" | "video" | "audio" | "file" | "gallery"
  | "columns" | "tabs" | "accordion" | "toc" | "labeleddivider" | "synced"
  | "progress" | "checklist" | "counter" | "countdown" | "rating"
  | "pageindex" | "properties" | "math" | "diagram" | "sketch" | "sticky" | "button";

export type ChartKind = "bar" | "line" | "donut";

export interface WikiTableData { rows: string[][]; }          // rows[0] = header row
export interface WikiBoardCard { id: string; text: string; }
export interface WikiBoardColumn { id: string; title: string; cards: WikiBoardCard[]; }
export interface WikiChartData { kind: ChartKind; data: { label: string; value: number }[]; }

export interface WikiPanel { id: string; title: string; body: string; }       // tabs / accordion
export interface WikiCheckItem { id: string; text: string; done: boolean; }    // checklist
export interface WikiProp { id: string; key: string; value: string; }          // properties

export interface WikiBlock {
  id: string;
  type: WikiBlockType;
  text: string;
  checked?: boolean;          // for todo blocks
  src?: string;               // for image blocks (Blob URL or data URL)
  caption?: string;           // for image blocks
  table?: WikiTableData;      // for table blocks
  board?: WikiBoardColumn[];  // for board (kanban) blocks
  chart?: WikiChartData;      // for chart blocks
  emoji?: string;             // for callout blocks (leading icon)
  body?: string;              // for toggle blocks (collapsible content)
  collapsed?: boolean;        // for toggle blocks
  pageId?: string;            // for pagelink / synced / button-to-page blocks
  // pinned/floating image (free-positioned over the page, Vision-style)
  floating?: boolean;
  x?: number;                 // px offset within the editor canvas
  y?: number;
  w?: number;                 // px width when floating
  // extended blocks
  url?: string;               // bookmark / embed / video / audio / file / button link
  fileName?: string;          // file attachment label
  fileSize?: string;          // file attachment size label
  images?: string[];          // gallery
  cols?: string[];            // columns (HTML per column)
  panels?: WikiPanel[];       // tabs / accordion
  checks?: WikiCheckItem[];   // checklist
  props?: WikiProp[];         // properties
  value?: number;             // progress / counter / rating
  date?: string;              // countdown target (YYYY-MM-DD)
  lang?: string;              // code language label
  color?: string;             // sticky note colour
}

// A folder groups top-level notes pages in the sidebar.
export interface WikiFolder {
  id: string;
  name: string;
  createdAt: string;
}

export interface WikiPage {
  id: string;
  parentId: string | null;   // null = top-level page; otherwise a subpage
  folderId?: string | null;  // groups top-level pages under a sidebar folder
  title: string;
  description?: string;      // optional subheading under the title
  icon: string;              // emoji
  blocks: WikiBlock[];
  fullWidth?: boolean;       // wide layout vs centered column
  locked?: boolean;          // requires a password to view the content
  deletedAt?: string | null; // soft-deleted to Trash at this time (purged after 14 days)
  createdAt: string;
  updatedAt: string;
}

export interface WeightEntry { date: string; kg: number; bodyFat?: number }   // bodyFat in %
export interface SleepEntry { date: string; score: number; hours?: number; bedtime?: string; wake?: string }  // score 0-100
export interface ProgressPhoto { id: string; date: string; url: string; note?: string }
export interface BodyMetrics {
  heightCm?: number;
  birthDate?: string;        // YYYY-MM-DD — chronological reference for biological age
  targetWeightKg?: number;   // optional goal
  weightLog: WeightEntry[];
  sleepLog: SleepEntry[];
  photos?: ProgressPhoto[];
}

export interface BridgeData {
  dataRevision?: number;
  tasks: Task[];
  calendarEvents: CalendarEvent[];
  focusSessions: FocusSession[];
  incomeEntries: IncomeEntry[];
  subscriptions: PaymentSubscription[];
  habits: Habit[];
  habitLogs: HabitLog[];
  dailyRevenueTarget: number;
  projects: Project[];
  projectNotes: ProjectNote[];
  projectLinks: ProjectLink[];
  wallets: Wallet[];
  portfolioSnapshots: PortfolioSnapshot[];
  milestones: Milestone[];
  projectDocuments: ProjectDocument[];
  projectFiles: ProjectFile[];
  exams: Exam[];
  timetable: Timetable;
  schoolNotes: SchoolNote[];
  playerSkills: PlayerSkill[];
  goals: Goal[];
  bodyMetrics: BodyMetrics;
  workouts: Workout[];
  socialStats: SocialStat[];
  businessKPIs: BusinessKPI[];
  briefs: Brief[];
  boards: VisionBoard[];
  boardItems: BoardItem[];
  boardDrawings: BoardDrawing[];
  wikiPages: WikiPage[];
  wikiFolders: WikiFolder[];
  chatThreads: ChatThread[];
  chatFolders: ChatFolder[];
  chatSkills: ChatSkill[];
  chatSettings: ChatSettings;
  courses: Course[];
  newsPrefs: NewsPrefs;
  autonomySettings: AutonomySettings;
  updatedAt?: number;
}

export const DEFAULT: BridgeData = {
  tasks: [],
  calendarEvents: [],
  focusSessions: [],
  incomeEntries: [],
  subscriptions: [],
  habits: [],
  habitLogs: [],
  dailyRevenueTarget: 100,
  projects: [],
  projectNotes: [],
  projectLinks: [],
  wallets: [],
  portfolioSnapshots: [],
  milestones: [],
  projectDocuments: [],
  projectFiles: [],
  playerSkills: [],
  goals: [],
  bodyMetrics: { weightLog: [], sleepLog: [] },
  workouts: [],
  socialStats: [
    { platform: "x",         followers: 0, posts: 0, lastUpdated: "" },
    { platform: "instagram", followers: 0, posts: 0, lastUpdated: "" },
    { platform: "tiktok",    followers: 0, avgViews: 0, lastUpdated: "" },
    { platform: "linkedin",  followers: 0, posts: 0, lastUpdated: "" },
    { platform: "youtube",   followers: 0, avgViews: 0, lastUpdated: "" },
  ],
  businessKPIs: [
    { id: "clients",  label: "Active Clients",     value: "0",   color: "indigo",  icon: "👥", category: "clients",  lastUpdated: "" },
    { id: "leads",    label: "Monthly Leads",      value: "0",   color: "cyan",    icon: "🎯", category: "pipeline", lastUpdated: "" },
    { id: "pipeline", label: "Pipeline Value",     value: "0",   color: "emerald", icon: "💼", prefix: "$", category: "pipeline", lastUpdated: "" },
    { id: "emails",   label: "Email Subscribers",  value: "0",   color: "violet",  icon: "✉️", category: "marketing", lastUpdated: "" },
    { id: "winrate",  label: "Close Rate",         value: "0",   color: "yellow",  icon: "📈", suffix: "%", category: "pipeline", lastUpdated: "" },
    { id: "content",  label: "Posts This Month",   value: "0",   color: "pink",    icon: "📝", category: "content",  lastUpdated: "" },
    { id: "expenses", label: "Monthly Expenses",   value: "0",   color: "red",     icon: "💸", prefix: "$", category: "finance",  lastUpdated: "" },
    { id: "mrr",      label: "MRR",                value: "0",   color: "emerald", icon: "🔄", prefix: "$", category: "finance",  lastUpdated: "" },
  ],
  briefs: [],
  exams: [],
  timetable: {},
  schoolNotes: [],
  boards: [],
  boardItems: [],
  boardDrawings: [],
  wikiPages: [],
  wikiFolders: [],
  chatThreads: [],
  chatFolders: [],
  chatSkills: [],
  chatSettings: DEFAULT_CHAT_SETTINGS,
  courses: [],
  newsPrefs: DEFAULT_NEWS_PREFS,
  autonomySettings: DEFAULT_AUTONOMY_SETTINGS,
};

function migrateIncomeTypes(data: BridgeData): BridgeData {
  return {
    ...data,
    incomeEntries: data.incomeEntries.map((e) => {
      const t = e.type as string;
      if (t === "earned" || t === "invoiced") return { ...e, type: "income" as IncomeType };
      if (t === "paid") return { ...e, type: "spent" as IncomeType };
      return e;
    }),
  };
}

function migrateHabits(data: BridgeData): BridgeData {
  return {
    ...data,
    habits: data.habits.map((raw) => {
      const h = raw as unknown as Record<string, unknown>;
      return {
        id: raw.id,
        name: raw.name,
        emoji: (h.emoji as string) || "⭐",
        type: ((h.type as HabitType) || "button") as HabitType,
        unit: h.unit as string | undefined,
        reminderTime: raw.reminderTime,
      };
    }),
  };
}

function migrateProjects(data: BridgeData): BridgeData {
  return {
    ...data,
    projects: data.projects.map((raw) => {
      const p = raw as unknown as Record<string, unknown>;
      return { ...raw, category: (p.category as ProjectCategory) || "major" };
    }),
  };
}

// Ensure at least one board exists and every item/drawing is assigned to one.
function migrateBoards(data: BridgeData): BridgeData {
  let boards = data.boards ?? [];
  if (boards.length === 0) {
    boards = [{ id: "board-default", name: "My Board", createdAt: new Date().toISOString() }];
  }
  const firstId = boards[0].id;
  return {
    ...data,
    boards,
    boardItems: (data.boardItems ?? []).map((it) => (it.boardId ? it : { ...it, boardId: firstId })),
    boardDrawings: (data.boardDrawings ?? []).map((d) => (d.boardId ? d : { ...d, boardId: firstId })),
  };
}

// Permanently drop notes pages that have been in the Trash for over 14 days.
const TRASH_TTL_MS = 14 * 24 * 60 * 60 * 1000;
function purgeOldTrash(data: BridgeData): BridgeData {
  const now = Date.now();
  const expired = (t?: string | null) => !!t && now - new Date(t).getTime() > TRASH_TTL_MS;
  let out = data;

  const pages = data.wikiPages ?? [];
  if (pages.some((p) => p.deletedAt)) {
    const kept = pages.filter((p) => !expired(p.deletedAt));
    if (kept.length !== pages.length) out = { ...out, wikiPages: kept };
  }

  const chats = data.chatThreads ?? [];
  if (chats.some((c) => c.deletedAt)) {
    const kept = chats.filter((c) => !expired(c.deletedAt));
    if (kept.length !== chats.length) out = { ...out, chatThreads: kept };
  }

  return out;
}

function load(): BridgeData {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = localStorage.getItem("bridge_data") ?? localStorage.getItem("nexus_data");
    if (raw && !localStorage.getItem("bridge_data")) {
      localStorage.setItem("bridge_data", raw);
    }
    const parsed = raw ? { ...DEFAULT, ...JSON.parse(raw) } : DEFAULT;
    return purgeOldTrash(migrateBoards(migrateProjects(migrateHabits(migrateIncomeTypes(parsed)))));
  } catch {
    return DEFAULT;
  }
}

function save(data: BridgeData) {
  if (typeof window === "undefined") return;
  localStorage.setItem("bridge_data", JSON.stringify(data));
}

export function getData(): BridgeData {
  return load();
}

export function updateData(updater: (d: BridgeData) => BridgeData) {
  const next = updater(load());
  save(next);
  window.dispatchEvent(new Event("bridge_update"));
  return next;
}

export function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
