"use client";

import { DEFAULT_AI_SETTINGS, normalizeAiSettings, type AiSettings } from "@/lib/ai-settings";
import { DEFAULT_PROFILE, type UserProfile } from "@/lib/profile";
import { DEFAULT_NEWS_PREFS, type NewsPrefs } from "@/lib/news-prefs";
import { DEFAULT_AUTONOMY_SETTINGS, type AutonomySettings, type AutonomyState, type AutonomyTaskClass } from "@/lib/autonomy";
import { DEFAULT_NAV_PREFS, type NavPrefs } from "@/lib/nav-config";

export type Priority = "P1" | "P2" | "P3";

// Categories are the area of life a task belongs to. Values are bare slugs:
// the old "@work" style read badly in a badge, a tab and a native select.
export type TaskTag =
  | "work" | "build" | "personal" | "home" | "errands"
  | "health" | "finance" | "admin" | "learning" | "other"
  | "night-auto";

export const TASK_TAGS: ReadonlyArray<{ value: TaskTag; label: string; emoji: string }> = [
  { value: "work",     label: "Work",     emoji: "\u{1F4BC}" },
  { value: "build",    label: "Build",    emoji: "\u{1F680}" },
  { value: "personal", label: "Personal", emoji: "\u{1F331}" },
  { value: "home",     label: "Home",     emoji: "\u{1F3E0}" },
  { value: "errands",  label: "Errands",  emoji: "\u{1F6D2}" },
  { value: "health",   label: "Health",   emoji: "\u{2764}\u{FE0F}" },
  { value: "finance",  label: "Finance",  emoji: "\u{1F4B0}" },
  { value: "admin",    label: "Admin",    emoji: "\u{1F4CB}" },
  { value: "learning", label: "Learning", emoji: "\u{1F4DA}" },
  { value: "other",    label: "Other",    emoji: "\u{1F4E6}" },
];

const TAG_SET = new Set<string>([...TASK_TAGS.map((t) => t.value), "night-auto"]);

// Legacy @-prefixed tags and the "@money" → "finance" rename.
const LEGACY_TAGS: Record<string, TaskTag> = {
  "@work": "work",
  "@personal": "personal",
  "@money": "finance",
  "@admin": "admin",
  "@night-auto": "night-auto",
};

// Coerces anything (old data, an agent, a native client) onto a known tag.
export function normalizeTaskTag(tag: unknown): TaskTag {
  const raw = typeof tag === "string" ? tag : "";
  const legacy = LEGACY_TAGS[raw];
  if (legacy) return legacy;
  const bare = raw.replace(/^@/, "");
  return TAG_SET.has(bare) ? (bare as TaskTag) : "other";
}

export function taskTagLabel(tag: string): string {
  const t = normalizeTaskTag(tag);
  return TASK_TAGS.find((x) => x.value === t)?.label ?? "Other";
}

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
  order?: number;            // manual arrangement position (lower = higher up)
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

// ── Shopping List (wish-list style) ──────────────────────────────────────────

export type ShoppingCategory =
  | "clothing" | "shoes" | "tech" | "gaming" | "home" | "furniture"
  | "books" | "fitness" | "accessories" | "other";

export interface ShoppingListItem {
  id: string;
  name: string;
  category: ShoppingCategory;
  price: number;         // estimated price in AUD (0 = not set)
  priority: 1 | 2 | 3;  // 1 = must have, 2 = want, 3 = nice to have
  checked: boolean;
  createdAt: string;
  icon?: string;         // custom emoji, or a data-URL / http(s) image URL — overrides the category emoji
  url?: string;          // optional link to the product page
  order?: number;        // manual sort position within the list (lower = higher up)
}

// ── Bookmarks (dashboard quick-links) ───────────────────────────────────────

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  icon?: string;     // custom emoji or image/data-URL — overrides the favicon
  favicon?: string;  // favicon fetched from the site and cached (data-URL or URL)
  createdAt: string;
  order?: number;     // manual sort position (lower = first)
}

export type ReadingCategory = "fiction" | "non-fiction" | "self-help" | "business" | "tech" | "biography" | "other";

export interface ReadingListItem {
  id: string;
  name: string;
  author: string;           // optional; "" when unknown
  category: ReadingCategory;
  checked: boolean;         // read
  createdAt: string;
  cover?: string;           // uploaded/URL cover image (data-URL or URL)
  order?: number;           // manual sort position (lower = first)
}

export type WatchKind = "movie" | "tv" | "youtube";

export interface WatchListItem {
  id: string;
  kind: WatchKind;
  title: string;
  year?: string;            // release year for movies/shows
  channel?: string;         // channel name for YouTube videos
  poster?: string;          // TMDB poster or YouTube thumbnail
  tmdbId?: number;          // TMDB id for movies/shows
  checked: boolean;         // watched
  createdAt: string;
  order?: number;           // manual sort position (lower = first)
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
  image?: string;             // bookmark thumbnail (og:image)
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

export interface BaseData {
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
  profile: UserProfile;
  aiSettings: AiSettings;
  courses: Course[];
  newsPrefs: NewsPrefs;
  autonomySettings: AutonomySettings;
  shoppingList: ShoppingListItem[];
  bookmarks: Bookmark[];
  readingList: ReadingListItem[];
  watchList: WatchListItem[];
  navPrefs: NavPrefs;
  updatedAt?: number;
}

export const DEFAULT: BaseData = {
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
  profile: DEFAULT_PROFILE,
  aiSettings: DEFAULT_AI_SETTINGS,
  courses: [],
  newsPrefs: DEFAULT_NEWS_PREFS,
  autonomySettings: DEFAULT_AUTONOMY_SETTINGS,
  shoppingList: [],
  bookmarks: [],
  readingList: [],
  watchList: [],
  navPrefs: DEFAULT_NAV_PREFS,
};

// Each migration below is allocation-free when the stored data is already
// current: it returns the SAME object it was given instead of rebuilding the
// whole record. updateData() runs them on every mutation, and a plain
// `return { ...data, habits: data.habits.map(...) }` re-allocated every habit,
// project, income entry, board item and board drawing on every keystroke.

function migrateIncomeTypes(data: BaseData): BaseData {
  for (const e of data.incomeEntries) {
    const t = e.type as string;
    if (t === "earned" || t === "invoiced" || t === "paid") {
      return {
        ...data,
        incomeEntries: data.incomeEntries.map((x) => {
          const xt = x.type as string;
          if (xt === "earned" || xt === "invoiced") return { ...x, type: "income" as IncomeType };
          if (xt === "paid") return { ...x, type: "spent" as IncomeType };
          return x;
        }),
      };
    }
  }
  return data;
}

function migrateHabits(data: BaseData): BaseData {
  for (const raw of data.habits) {
    const h = raw as unknown as Record<string, unknown>;
    if (!h.emoji || !h.type) {
      return {
        ...data,
        habits: data.habits.map((r) => {
          const rh = r as unknown as Record<string, unknown>;
          return {
            id: r.id,
            name: r.name,
            emoji: (rh.emoji as string) || "⭐",
            type: ((rh.type as HabitType) || "button") as HabitType,
            unit: rh.unit as string | undefined,
            reminderTime: r.reminderTime,
          };
        }),
      };
    }
  }
  return data;
}

function migrateProjects(data: BaseData): BaseData {
  for (const raw of data.projects) {
    if (!(raw as unknown as Record<string, unknown>).category) {
      return {
        ...data,
        projects: data.projects.map((r) => ({
          ...r,
          category: ((r as unknown as Record<string, unknown>).category as ProjectCategory) || "major",
        })),
      };
    }
  }
  return data;
}

// Ensure at least one board exists and every item/drawing is assigned to one.
function migrateBoards(data: BaseData): BaseData {
  let out = data;
  let boards = out.boards ?? [];
  if (boards.length === 0) {
    boards = [{ id: "board-default", name: "My Board", createdAt: new Date().toISOString() }];
    out = { ...out, boards };
  }
  const firstId = boards[0].id;
  const items = out.boardItems ?? [];
  if (items.some((it) => !it.boardId)) {
    out = { ...out, boardItems: items.map((it) => (it.boardId ? it : { ...it, boardId: firstId })) };
  }
  const drawings = out.boardDrawings ?? [];
  if (drawings.some((d) => !d.boardId)) {
    out = { ...out, boardDrawings: drawings.map((d) => (d.boardId ? d : { ...d, boardId: firstId })) };
  }
  return out;
}

// Permanently drop notes pages that have been in the Trash for over 14 days.
const TRASH_TTL_MS = 14 * 24 * 60 * 60 * 1000;
function purgeOldTrash(data: BaseData): BaseData {
  const now = Date.now();
  const expired = (t?: string | null) => !!t && now - new Date(t).getTime() > TRASH_TTL_MS;
  let out = data;

  const pages = data.wikiPages ?? [];
  if (pages.some((p) => p.deletedAt)) {
    const kept = pages.filter((p) => !expired(p.deletedAt));
    if (kept.length !== pages.length) out = { ...out, wikiPages: kept };
  }

  return out;
}

const DATA_KEY = "base_data";
// Installs upgraded from the Nexus and Bridge eras keep their data: the first
// read copies the old blob forward, exactly as the server-side keys do.
const PREVIOUS_KEYS = ["bridge_data", "nexus_data"];

// In-memory mirror of localStorage.
//
// getData() used to re-read and JSON.parse the entire record — then run four
// migration passes over it — on every single call. hooks.ts calls getData()
// once per base_update listener, and six useBase() consumers are mounted
// app-wide (Sidebar, CommandBar, Dock, BottomNav, KeyboardShortcuts + the
// page), so every keystroke-burst in Notes parsed the whole dataset six times.
// The mirror is dropped whenever another tab writes to storage, so cross-tab
// sync still works.
let cache: BaseData | null = null;
let watchingStorage = false;

function watchExternalWrites() {
  if (watchingStorage || typeof window === "undefined") return;
  watchingStorage = true;
  window.addEventListener("storage", (e) => {
    // key === null means localStorage.clear() fired.
    if (e.key === null || e.key === DATA_KEY || PREVIOUS_KEYS.includes(e.key)) cache = null;
  });
}

// Drops the "@" prefix and folds legacy tags onto the current taxonomy so
// existing tasks keep their category instead of collapsing into "Other".
function migrateTaskTags(data: BaseData): BaseData {
  if (!Array.isArray(data.tasks)) return data;
  let changed = false;
  const tasks = data.tasks.map((t) => {
    const tag = normalizeTaskTag(t.tag);
    if (tag === t.tag) return t;
    changed = true;
    return { ...t, tag };
  });
  return changed ? { ...data, tasks } : data;
}

// The AI Chat feature is gone (the news briefing is the only AI left), so the
// stored chat threads/folders/skills are dropped here rather than left to rot
// in every install's blob. The old `chatSettings` model becomes the briefing's
// starting pick, so an existing user doesn't have to choose one again.
function migrateAwayChat(data: BaseData): BaseData {
  const legacy = data as unknown as Record<string, unknown>;
  const hasLegacyChat = ["chatThreads", "chatFolders", "chatSkills", "chatSettings"].some((key) => key in legacy);
  const missingProfile = !data.profile;
  const missingAi = !data.aiSettings;
  if (!hasLegacyChat && !missingProfile && !missingAi) return data;

  const out = { ...legacy };
  if (hasLegacyChat) {
    const previous = (legacy.chatSettings ?? {}) as { model?: string };
    out.aiSettings = normalizeAiSettings({ briefingEnabled: true, model: previous.model });
    for (const key of ["chatThreads", "chatFolders", "chatSkills", "chatSettings"]) delete out[key];
  }
  out.profile = { ...DEFAULT_PROFILE, ...((legacy.profile ?? {}) as Partial<UserProfile>) };
  return out as unknown as BaseData;
}

// An install that already has data predates onboarding, so it counts as set up —
// otherwise every existing copy would be nagged into the wizard on first visit.
// A genuinely new install has an empty shell and still gets the wizard.
function migrateExistingInstall(data: BaseData): BaseData {
  if (data.profile?.onboardedAt) return data;
  const used =
    (data.tasks?.length ?? 0) > 0 ||
    (data.projects?.length ?? 0) > 0 ||
    (data.wikiPages?.length ?? 0) > 0 ||
    (data.incomeEntries?.length ?? 0) > 0 ||
    (data.habits?.length ?? 0) > 0 ||
    (data.shoppingList?.length ?? 0) > 0 ||
    (data.calendarEvents?.length ?? 0) > 0;
  if (!used) return data;
  return { ...data, profile: { ...DEFAULT_PROFILE, ...data.profile, onboardedAt: new Date(0).toISOString() } };
}

// Normalises any record — from localStorage OR from the server — to the current
// shape. Callers that inject data from outside localStorage must use this
// explicitly: load() only re-parses on a cache miss, so previously-pulled
// server data would otherwise sit unmigrated in the cache until a reload.
export function migrateAll(data: BaseData): BaseData {
  return migrateExistingInstall(migrateAwayChat(purgeOldTrash(migrateTaskTags(migrateBoards(migrateProjects(migrateHabits(migrateIncomeTypes(data))))))));
}

function loadFromStorage(): BaseData {
  if (typeof window === "undefined") return DEFAULT;
  try {
    let raw = localStorage.getItem(DATA_KEY);
    if (!raw) {
      for (const key of PREVIOUS_KEYS) {
        const previous = localStorage.getItem(key);
        if (previous) {
          localStorage.setItem(DATA_KEY, previous);
          raw = previous;
          break;
        }
      }
    }
    const parsed = raw ? { ...DEFAULT, ...JSON.parse(raw) } : DEFAULT;
    return migrateAll(parsed);
  } catch {
    return DEFAULT;
  }
}

function load(): BaseData {
  if (cache) return cache;
  watchExternalWrites();
  cache = loadFromStorage();
  return cache;
}

function save(data: BaseData) {
  cache = data;
  if (typeof window === "undefined") return;
  localStorage.setItem(DATA_KEY, JSON.stringify(data));
}

export function getData(): BaseData {
  return load();
}

export function updateData(updater: (d: BaseData) => BaseData) {
  const next = updater(load());
  save(next);
  window.dispatchEvent(new Event("base_update"));
  return next;
}

export function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
