export const SYNC_PROTOCOL_VERSION = 2;
export const ROOT_COLLECTION = "$root";

// Collections whose entries have stable `id` fields and can therefore sync
// independently. Keeping this list shared prevents the web and API from slowly
// drifting into different ideas of what is syncable.
export const RECORD_COLLECTIONS = [
  "tasks",
  "focusSessions",
  "incomeEntries",
  "subscriptions",
  "habits",
  "habitLogs",
  "projects",
  "projectNotes",
  "projectLinks",
  "wallets",
  "milestones",
  "projectDocuments",
  "projectFiles",
  "exams",
  "schoolNotes",
  "playerSkills",
  "goals",
  "workouts",
  "businessKPIs",
  "boards",
  "boardItems",
  "boardDrawings",
  "wikiPages",
  "wikiFolders",
  "chatThreads",
  "chatFolders",
  "chatSkills",
  "courses",
] as const;

// Small singleton values and arrays without stable IDs are versioned as root
// fields. Large binary data must live in Blob storage and is represented here
// only by metadata/URLs.
export const ROOT_FIELDS = [
  "dailyRevenueTarget",
  "portfolioSnapshots",
  "timetable",
  "bodyMetrics",
  "socialStats",
  "chatSettings",
  "newsPrefs",
  "hiddenPages",
  "dashboardPreferences",
] as const;

export const CONFLICT_SENSITIVE_COLLECTIONS = new Set<string>([
  "wikiPages",
  "chatThreads",
]);

export type RecordCollection = (typeof RECORD_COLLECTIONS)[number];
export type RootField = (typeof ROOT_FIELDS)[number];
export type SyncAction = "upsert" | "patch" | "delete" | "set";

export interface SyncOperation {
  id: string;
  deviceId: string;
  collection: RecordCollection | typeof ROOT_COLLECTION;
  action: SyncAction;
  recordId: string;
  value?: unknown;
  baseRevision: number;
  clientUpdatedAt: number;
}

export interface SyncChange {
  revision: number;
  operation: SyncOperation;
  merged?: boolean;
}

export interface SyncConflict {
  id: string;
  operation: SyncOperation;
  serverRevision: number;
  serverValue?: unknown;
  createdAt: number;
}

export interface SyncEnvelope {
  ok?: boolean;
  configured?: boolean;
  protocol?: number;
  full?: boolean;
  data?: Record<string, unknown> | null;
  changes?: SyncChange[];
  revision?: number;
  recordRevisions?: Record<string, number>;
  applied?: string[];
  conflicts?: SyncConflict[];
  updatedAt?: number;
  error?: string;
}

export const recordRevisionKey = (collection: string, recordId: string) =>
  `${collection}:${recordId}`;
