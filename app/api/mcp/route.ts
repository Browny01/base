import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import type { BoardDrawing, BoardItem, BridgeData, DrawTool, WikiPage } from "@/lib/store";
import { readRawData, sanitize, noteToText, writeRawData } from "@/lib/mcp-data";
import { validateAccessToken } from "@/lib/mcp-oauth";

export const runtime = "nodejs";
export const maxDuration = 30;

const SERVER_INFO = { name: "bridge", title: "Bridge — Agent Control", version: "2.0.0" };
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version",
};

async function authorized(req: NextRequest): Promise<boolean> {
  const h = req.headers.get("authorization") || "";
  const bearer = h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
  const q = new URL(req.url).searchParams.get("token") || "";
  const staticToken = process.env.MCP_TOKEN;
  if (staticToken && (bearer === staticToken || q === staticToken)) return true;
  return !!bearer && await validateAccessToken(bearer);
}

type McpState = {
  raw: BridgeData;
  data: BridgeData;
  save: (next: BridgeData) => Promise<void>;
};
type Tool = {
  name: string;
  description: string;
  inputSchema: object;
  run: (args: Record<string, unknown>, state: McpState) => unknown | Promise<unknown>;
};

const obj = (properties: object = {}, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });
const freeObject = { type: "object", additionalProperties: true };
const now = () => new Date().toISOString();
const newId = () => randomUUID();
const asObject = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const error = (message: string) => ({ error: message });
const omit = (record: Record<string, unknown>, keys: string[]) => Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)));

// These are all ordinary Bridge collections. Vision and Notes get their own
// tools below because they need extra safeguards and useful drawing semantics.
const COLLECTIONS = [
  "tasks", "focusSessions", "incomeEntries", "subscriptions", "habits", "habitLogs",
  "projects", "projectNotes", "projectLinks", "wallets", "portfolioSnapshots", "milestones",
  "projectDocuments", "projectFiles", "exams", "schoolNotes", "playerSkills", "goals",
  "workouts", "lockInSessions", "socialStats", "businessKPIs", "chatThreads", "chatFolders",
  "chatSkills", "courses", "wikiFolders",
] as const;
type Collection = typeof COLLECTIONS[number];
const isCollection = (value: unknown): value is Collection => typeof value === "string" && (COLLECTIONS as readonly string[]).includes(value);
const SETTINGS = ["dailyRevenueTarget", "timetable", "bodyMetrics", "chatSettings", "newsPrefs"] as const;
type Setting = typeof SETTINGS[number];
const isSetting = (value: unknown): value is Setting => typeof value === "string" && (SETTINGS as readonly string[]).includes(value);
const DRAW_TOOLS: DrawTool[] = ["pen", "line", "arrow", "rect", "ellipse"];

function recordKey(record: Record<string, unknown>): string | null {
  for (const key of ["id", "platform", "date"]) if (typeof record[key] === "string" && record[key]) return `${key}:${record[key]}`;
  return null;
}
function findRecord(list: unknown[], key: string) {
  return list.findIndex((value) => {
    const record = asObject(value);
    return record ? recordKey(record) === key || record.id === key : false;
  });
}
function collectionData(state: McpState, collection: Collection): unknown[] {
  const value = state.data[collection];
  return Array.isArray(value) ? value : [];
}
async function save(state: McpState, next: BridgeData) {
  await state.save({ ...next, updatedAt: Date.now() });
}

function publicOverview(d: BridgeData) {
  const notes = d.wikiPages ?? [];
  return {
    tasks: { total: d.tasks?.length ?? 0, open: (d.tasks ?? []).filter((t) => !t.done).length },
    habits: d.habits?.length ?? 0,
    goals: d.goals?.length ?? 0,
    projects: d.projects?.length ?? 0,
    boards: d.boards?.length ?? 0,
    workouts: d.workouts?.length ?? 0,
    chats: d.chatThreads?.length ?? 0,
    notes: { readable: notes.length, locked_hidden: "protected" },
  };
}

function isEditableNote(raw: BridgeData, id: unknown): WikiPage | null {
  if (typeof id !== "string") return null;
  const note = (raw.wikiPages ?? []).find((page) => page.id === id);
  return note && !note.locked && !note.deletedAt ? note : null;
}
function isProtectedFolder(raw: BridgeData, id: string): boolean {
  return (raw.wikiPages ?? []).some((page) => page.folderId === id && (page.locked || page.deletedAt));
}

const TOOLS: Tool[] = [
  {
    name: "get_overview",
    description: "A quick, privacy-safe summary of the Bridge workspace. Start here.",
    inputSchema: obj(),
    run: (_args, state) => publicOverview(state.data),
  },
  {
    name: "get_app_data",
    description: "Read all editable Bridge data in one response. Locked and trashed Notes pages are never included.",
    inputSchema: obj(),
    run: (_args, state) => state.data,
  },
  {
    name: "get_collection",
    description: "Read one editable Bridge collection, such as tasks, projects, habits, chats, finance entries, or wikiFolders.",
    inputSchema: obj({ collection: { type: "string", enum: COLLECTIONS } }, ["collection"]),
    run: (args, state) => isCollection(args.collection) ? collectionData(state, args.collection) : error("Unknown collection."),
  },
  {
    name: "create_record",
    description: "Create an item in any standard Bridge collection. Bridge assigns an id and createdAt when omitted. Use the dedicated Vision and Notes tools for those areas.",
    inputSchema: obj({ collection: { type: "string", enum: COLLECTIONS }, record: freeObject }, ["collection", "record"]),
    run: async (args, state) => {
      if (!isCollection(args.collection)) return error("Unknown collection.");
      const record = asObject(args.record);
      if (!record) return error("record must be an object.");
      const nextRecord: Record<string, unknown> = { ...record, id: typeof record.id === "string" && record.id ? record.id : newId() };
      if ("createdAt" in nextRecord === false) nextRecord.createdAt = now();
      const list = Array.isArray(state.raw[args.collection]) ? state.raw[args.collection] : [];
      if (findRecord(list as unknown[], String(nextRecord.id)) >= 0) return error("An item with that id already exists.");
      const next = { ...state.raw, [args.collection]: [...list, nextRecord] } as BridgeData;
      await save(state, next);
      return { ok: true, collection: args.collection, record: nextRecord };
    },
  },
  {
    name: "update_record",
    description: "Update any standard Bridge item by id (or platform/date for records without ids). The patch is a shallow merge, so send only fields that should change.",
    inputSchema: obj({ collection: { type: "string", enum: COLLECTIONS }, id: { type: "string" }, patch: freeObject }, ["collection", "id", "patch"]),
    run: async (args, state) => {
      if (!isCollection(args.collection) || typeof args.id !== "string") return error("Unknown collection or missing id.");
      const patch = asObject(args.patch);
      if (!patch) return error("patch must be an object.");
      const list = Array.isArray(state.raw[args.collection]) ? state.raw[args.collection] as unknown[] : [];
      const index = findRecord(list, args.id);
      const current = index >= 0 ? asObject(list[index]) : null;
      if (!current) return error("Record not found.");
      if (args.collection === "wikiFolders" && isProtectedFolder(state.raw, args.id)) return error("This folder contains a locked or trashed note and cannot be changed by an agent.");
      const safePatch = omit(patch, ["id", "createdAt"]);
      const updated = { ...current, ...safePatch };
      const nextList = [...list]; nextList[index] = updated;
      await save(state, { ...state.raw, [args.collection]: nextList } as BridgeData);
      return { ok: true, collection: args.collection, record: updated };
    },
  },
  {
    name: "delete_record",
    description: "Permanently delete one item from a standard Bridge collection by id (or platform/date for records without ids). Use this only when deletion is intended.",
    inputSchema: obj({ collection: { type: "string", enum: COLLECTIONS }, id: { type: "string" } }, ["collection", "id"]),
    run: async (args, state) => {
      if (!isCollection(args.collection) || typeof args.id !== "string") return error("Unknown collection or missing id.");
      const list = Array.isArray(state.raw[args.collection]) ? state.raw[args.collection] as unknown[] : [];
      const index = findRecord(list, args.id);
      if (index < 0) return error("Record not found.");
      if (args.collection === "wikiFolders" && isProtectedFolder(state.raw, args.id)) return error("This folder contains a locked or trashed note and cannot be changed by an agent.");
      await save(state, { ...state.raw, [args.collection]: list.filter((_item, i) => i !== index) } as BridgeData);
      return { ok: true, deleted: args.id, collection: args.collection };
    },
  },
  {
    name: "update_settings",
    description: "Update a singleton Bridge setting: dailyRevenueTarget, timetable, bodyMetrics, chatSettings, or newsPrefs. Pass replace=true for a complete replacement; otherwise object values are merged.",
    inputSchema: obj({ setting: { type: "string", enum: SETTINGS }, value: {}, replace: { type: "boolean" } }, ["setting", "value"]),
    run: async (args, state) => {
      if (!isSetting(args.setting)) return error("Unknown setting.");
      const current = state.raw[args.setting];
      const nextValue = !args.replace && asObject(current) && asObject(args.value)
        ? { ...asObject(current), ...asObject(args.value) }
        : args.value;
      await save(state, { ...state.raw, [args.setting]: nextValue } as BridgeData);
      return { ok: true, setting: args.setting, value: nextValue };
    },
  },
  {
    name: "complete_task",
    description: "Mark a task complete or incomplete without needing to edit its other fields.",
    inputSchema: obj({ id: { type: "string" }, done: { type: "boolean" } }, ["id", "done"]),
    run: async (args, state) => {
      if (typeof args.id !== "string" || typeof args.done !== "boolean") return error("id and done are required.");
      const index = (state.raw.tasks ?? []).findIndex((task) => task.id === args.id);
      if (index < 0) return error("Task not found.");
      const tasks = [...state.raw.tasks];
      tasks[index] = { ...tasks[index], done: args.done, completedAt: args.done ? now() : null };
      await save(state, { ...state.raw, tasks });
      return { ok: true, task: tasks[index] };
    },
  },
  {
    name: "log_habit",
    description: "Record or update a habit completion for a date. This creates the log if it does not already exist.",
    inputSchema: obj({ habitId: { type: "string" }, date: { type: "string" }, completed: { type: "boolean" }, value: { type: "string" } }, ["habitId", "date", "completed"]),
    run: async (args, state) => {
      if (typeof args.habitId !== "string" || typeof args.date !== "string" || typeof args.completed !== "boolean") return error("habitId, date and completed are required.");
      if (!(state.raw.habits ?? []).some((habit) => habit.id === args.habitId)) return error("Habit not found.");
      const logs = [...(state.raw.habitLogs ?? [])];
      const index = logs.findIndex((log) => log.habitId === args.habitId && log.date === args.date);
      const log = { id: index >= 0 ? logs[index].id : newId(), habitId: args.habitId, date: args.date, completed: args.completed, ...(typeof args.value === "string" ? { value: args.value } : {}) };
      if (index >= 0) logs[index] = log; else logs.push(log);
      await save(state, { ...state.raw, habitLogs: logs });
      return { ok: true, log };
    },
  },
  {
    name: "list_notes",
    description: "List unlocked, live Notes pages and folders. Locked pages are never returned.",
    inputSchema: obj(),
    run: (_args, state) => {
      const folders = new Map((state.data.wikiFolders ?? []).map((folder) => [folder.id, folder.name]));
      return { folders: state.data.wikiFolders ?? [], pages: (state.data.wikiPages ?? []).map((page) => ({ id: page.id, title: page.title || "Untitled", icon: page.icon, folder: page.folderId ? folders.get(page.folderId) ?? null : null, parentId: page.parentId, updatedAt: page.updatedAt })) };
    },
  },
  {
    name: "get_note",
    description: "Read one unlocked Notes page. Locked pages are private and will be refused.",
    inputSchema: obj({ id: { type: "string" } }, ["id"]),
    run: (args, state) => {
      const page = isEditableNote(state.raw, args.id);
      return page ? { id: page.id, title: page.title, icon: page.icon, description: page.description, content: noteToText(page), blocks: page.blocks } : error("Note not found or locked.");
    },
  },
  {
    name: "create_note",
    description: "Create an unlocked Notes page. Agents can create and edit normal Notes pages but cannot create, read, edit, or delete locked pages.",
    inputSchema: obj({ page: freeObject }, ["page"]),
    run: async (args, state) => {
      const page = asObject(args.page);
      if (!page) return error("page must be an object.");
      const stamp = now();
      const record: WikiPage = { id: typeof page.id === "string" && page.id ? page.id : newId(), title: typeof page.title === "string" ? page.title : "Untitled", description: typeof page.description === "string" ? page.description : "", icon: typeof page.icon === "string" ? page.icon : "📄", blocks: Array.isArray(page.blocks) ? page.blocks as WikiPage["blocks"] : [], folderId: typeof page.folderId === "string" ? page.folderId : null, parentId: typeof page.parentId === "string" ? page.parentId : null, fullWidth: page.fullWidth === true, locked: false, deletedAt: null, createdAt: stamp, updatedAt: stamp };
      if ((state.raw.wikiPages ?? []).some((existing) => existing.id === record.id)) return error("A note with that id already exists.");
      await save(state, { ...state.raw, wikiPages: [...(state.raw.wikiPages ?? []), record] });
      return { ok: true, page: record };
    },
  },
  {
    name: "update_note",
    description: "Update an unlocked Notes page. The locked, deletedAt, id, and createdAt fields are protected from agents.",
    inputSchema: obj({ id: { type: "string" }, patch: freeObject }, ["id", "patch"]),
    run: async (args, state) => {
      const patch = asObject(args.patch);
      const page = isEditableNote(state.raw, args.id);
      if (!page || !patch || typeof args.id !== "string") return error("Note not found or locked.");
      const safePatch = omit(patch, ["id", "createdAt", "locked", "deletedAt"]);
      const updated = { ...page, ...safePatch, updatedAt: now() } as WikiPage;
      await save(state, { ...state.raw, wikiPages: (state.raw.wikiPages ?? []).map((existing) => existing.id === args.id ? updated : existing) });
      return { ok: true, page: updated };
    },
  },
  {
    name: "delete_note",
    description: "Move an unlocked Notes page to the Notes trash. Locked pages cannot be deleted by agents.",
    inputSchema: obj({ id: { type: "string" } }, ["id"]),
    run: async (args, state) => {
      const page = isEditableNote(state.raw, args.id);
      if (!page || typeof args.id !== "string") return error("Note not found or locked.");
      const deletedAt = now();
      await save(state, { ...state.raw, wikiPages: (state.raw.wikiPages ?? []).map((existing) => existing.id === args.id ? { ...existing, deletedAt, updatedAt: deletedAt } : existing) });
      return { ok: true, id: args.id, deletedAt };
    },
  },
  {
    name: "get_vision",
    description: "Read Vision boards, their items, and their drawings. Use draw_on_vision to add freehand or shape drawings.",
    inputSchema: obj({ boardId: { type: "string" } }),
    run: (args, state) => {
      const boardId = typeof args.boardId === "string" ? args.boardId : null;
      return { boards: boardId ? (state.data.boards ?? []).filter((board) => board.id === boardId) : state.data.boards ?? [], items: boardId ? (state.data.boardItems ?? []).filter((item) => item.boardId === boardId) : state.data.boardItems ?? [], drawings: boardId ? (state.data.boardDrawings ?? []).filter((drawing) => drawing.boardId === boardId) : state.data.boardDrawings ?? [] };
    },
  },
  {
    name: "create_vision_board",
    description: "Create a new Vision board.",
    inputSchema: obj({ name: { type: "string" } }, ["name"]),
    run: async (args, state) => {
      const name = typeof args.name === "string" ? args.name.trim() : "";
      if (!name) return error("A board name is required.");
      const board = { id: newId(), name, createdAt: now() };
      await save(state, { ...state.raw, boards: [...(state.raw.boards ?? []), board] });
      return { ok: true, board };
    },
  },
  {
    name: "update_vision_board",
    description: "Rename a Vision board.",
    inputSchema: obj({ id: { type: "string" }, name: { type: "string" } }, ["id", "name"]),
    run: async (args, state) => {
      const name = typeof args.name === "string" ? args.name.trim() : "";
      if (typeof args.id !== "string" || !name) return error("id and name are required.");
      if (!(state.raw.boards ?? []).some((board) => board.id === args.id)) return error("Vision board not found.");
      await save(state, { ...state.raw, boards: (state.raw.boards ?? []).map((board) => board.id === args.id ? { ...board, name } : board) });
      return { ok: true, id: args.id, name };
    },
  },
  {
    name: "delete_vision_board",
    description: "Delete a Vision board and all of its items and drawings. Bridge always keeps at least one board.",
    inputSchema: obj({ id: { type: "string" } }, ["id"]),
    run: async (args, state) => {
      if (typeof args.id !== "string") return error("id is required.");
      const boards = state.raw.boards ?? [];
      if (boards.length <= 1) return error("Bridge keeps at least one Vision board.");
      if (!boards.some((board) => board.id === args.id)) return error("Vision board not found.");
      await save(state, { ...state.raw, boards: boards.filter((board) => board.id !== args.id), boardItems: (state.raw.boardItems ?? []).filter((item) => item.boardId !== args.id), boardDrawings: (state.raw.boardDrawings ?? []).filter((drawing) => drawing.boardId !== args.id) });
      return { ok: true, deleted: args.id };
    },
  },
  {
    name: "create_vision_item",
    description: "Add a sticky note, photo, or music card to a Vision board. For photos provide item.src as a public image URL; positioning uses canvas pixels.",
    inputSchema: obj({ boardId: { type: "string" }, item: freeObject }, ["boardId", "item"]),
    run: async (args, state) => {
      const item = asObject(args.item);
      if (typeof args.boardId !== "string" || !item) return error("boardId and item are required.");
      if (!(state.raw.boards ?? []).some((board) => board.id === args.boardId)) return error("Vision board not found.");
      if (item.type !== "note" && item.type !== "photo" && item.type !== "music") return error("item.type must be note, photo, or music.");
      const z = Math.max(0, ...(state.raw.boardItems ?? []).filter((existing) => existing.boardId === args.boardId).map((existing) => existing.z || 0)) + 1;
      const record: BoardItem = { id: typeof item.id === "string" && item.id ? item.id : newId(), boardId: args.boardId, type: item.type, x: typeof item.x === "number" ? item.x : 200, y: typeof item.y === "number" ? item.y : 160, width: typeof item.width === "number" ? item.width : item.type === "music" ? 230 : 220, height: typeof item.height === "number" ? item.height : item.type === "music" ? 116 : 180, z: typeof item.z === "number" ? item.z : z, rotation: typeof item.rotation === "number" ? item.rotation : 0, src: typeof item.src === "string" ? item.src : undefined, caption: typeof item.caption === "string" ? item.caption : undefined, text: typeof item.text === "string" ? item.text : undefined, color: typeof item.color === "string" ? item.color as BoardItem["color"] : "yellow", audioSrc: typeof item.audioSrc === "string" ? item.audioSrc : undefined, title: typeof item.title === "string" ? item.title : undefined, artist: typeof item.artist === "string" ? item.artist : undefined, createdAt: now() };
      await save(state, { ...state.raw, boardItems: [...(state.raw.boardItems ?? []), record] });
      return { ok: true, item: record };
    },
  },
  {
    name: "update_vision_item",
    description: "Move, resize, restyle, or change any Vision item by id. The item id and createdAt are protected.",
    inputSchema: obj({ id: { type: "string" }, patch: freeObject }, ["id", "patch"]),
    run: async (args, state) => {
      const patch = asObject(args.patch);
      if (typeof args.id !== "string" || !patch) return error("id and patch are required.");
      const current = (state.raw.boardItems ?? []).find((item) => item.id === args.id);
      if (!current) return error("Vision item not found.");
      const safePatch = omit(patch, ["id", "createdAt"]);
      const item = { ...current, ...safePatch } as BoardItem;
      await save(state, { ...state.raw, boardItems: (state.raw.boardItems ?? []).map((existing) => existing.id === args.id ? item : existing) });
      return { ok: true, item };
    },
  },
  {
    name: "delete_vision_item",
    description: "Delete one Vision item by id.",
    inputSchema: obj({ id: { type: "string" } }, ["id"]),
    run: async (args, state) => {
      if (typeof args.id !== "string" || !(state.raw.boardItems ?? []).some((item) => item.id === args.id)) return error("Vision item not found.");
      await save(state, { ...state.raw, boardItems: (state.raw.boardItems ?? []).filter((item) => item.id !== args.id) });
      return { ok: true, deleted: args.id };
    },
  },
  {
    name: "draw_on_vision",
    description: "Draw on a Vision board. Use tool=pen with an array of points [{x,y}, ...], or line/arrow/rect/ellipse with x1,y1,x2,y2. Coordinates are canvas pixels.",
    inputSchema: obj({ boardId: { type: "string" }, drawing: freeObject }, ["boardId", "drawing"]),
    run: async (args, state) => {
      const drawing = asObject(args.drawing);
      if (typeof args.boardId !== "string" || !drawing) return error("boardId and drawing are required.");
      if (!(state.raw.boards ?? []).some((board) => board.id === args.boardId)) return error("Vision board not found.");
      if (!DRAW_TOOLS.includes(drawing.tool as DrawTool)) return error("drawing.tool must be pen, line, arrow, rect, or ellipse.");
      const isPoint = (point: unknown): point is { x: number; y: number } => !!point && typeof point === "object" && typeof (point as { x?: unknown }).x === "number" && typeof (point as { y?: unknown }).y === "number";
      if (drawing.tool === "pen" && (!Array.isArray(drawing.points) || drawing.points.length < 2 || !drawing.points.every(isPoint))) return error("A pen drawing needs at least two {x,y} points.");
      if (drawing.tool !== "pen" && ![drawing.x1, drawing.y1, drawing.x2, drawing.y2].every((value) => typeof value === "number")) return error("Shape drawings need numeric x1, y1, x2, and y2.");
      const record: BoardDrawing = { id: typeof drawing.id === "string" && drawing.id ? drawing.id : newId(), boardId: args.boardId, tool: drawing.tool as DrawTool, color: typeof drawing.color === "string" ? drawing.color : "#0a0a0a", width: typeof drawing.width === "number" ? drawing.width : 4, points: drawing.tool === "pen" ? drawing.points as { x: number; y: number }[] : undefined, x1: typeof drawing.x1 === "number" ? drawing.x1 : undefined, y1: typeof drawing.y1 === "number" ? drawing.y1 : undefined, x2: typeof drawing.x2 === "number" ? drawing.x2 : undefined, y2: typeof drawing.y2 === "number" ? drawing.y2 : undefined, createdAt: now() };
      await save(state, { ...state.raw, boardDrawings: [...(state.raw.boardDrawings ?? []), record] });
      return { ok: true, drawing: record };
    },
  },
  {
    name: "update_vision_drawing",
    description: "Edit a Vision drawing's geometry, colour, stroke width, or points.",
    inputSchema: obj({ id: { type: "string" }, patch: freeObject }, ["id", "patch"]),
    run: async (args, state) => {
      const patch = asObject(args.patch);
      if (typeof args.id !== "string" || !patch) return error("id and patch are required.");
      const current = (state.raw.boardDrawings ?? []).find((drawing) => drawing.id === args.id);
      if (!current) return error("Vision drawing not found.");
      const safePatch = omit(patch, ["id", "createdAt"]);
      const drawing = { ...current, ...safePatch } as BoardDrawing;
      await save(state, { ...state.raw, boardDrawings: (state.raw.boardDrawings ?? []).map((existing) => existing.id === args.id ? drawing : existing) });
      return { ok: true, drawing };
    },
  },
  {
    name: "delete_vision_drawing",
    description: "Delete one Vision drawing by id.",
    inputSchema: obj({ id: { type: "string" } }, ["id"]),
    run: async (args, state) => {
      if (typeof args.id !== "string" || !(state.raw.boardDrawings ?? []).some((drawing) => drawing.id === args.id)) return error("Vision drawing not found.");
      await save(state, { ...state.raw, boardDrawings: (state.raw.boardDrawings ?? []).filter((drawing) => drawing.id !== args.id) });
      return { ok: true, deleted: args.id };
    },
  },
  {
    name: "search",
    description: "Search unlocked Notes, tasks, projects, goals, habits, and Vision board names. Locked Notes are excluded.",
    inputSchema: obj({ query: { type: "string" } }, ["query"]),
    run: (args, state) => {
      const query = typeof args.query === "string" ? args.query.trim().toLowerCase() : "";
      if (!query) return { matches: [] };
      const includes = (value: unknown) => String(value ?? "").toLowerCase().includes(query);
      const notes = (state.data.wikiPages ?? []).filter((page) => includes(page.title) || includes(noteToText(page))).map((page) => ({ type: "note", id: page.id, title: page.title || "Untitled" }));
      const tasks = (state.data.tasks ?? []).filter((task) => includes(task.title)).map((task) => ({ type: "task", id: task.id, title: task.title, done: task.done }));
      const projects = (state.data.projects ?? []).filter((project) => includes(project.name) || includes(project.description)).map((project) => ({ type: "project", id: project.id, name: project.name }));
      const goals = (state.data.goals ?? []).filter((goal) => includes(goal.text)).map((goal) => ({ type: "goal", id: goal.id, text: goal.text, period: goal.period }));
      const habits = (state.data.habits ?? []).filter((habit) => includes(habit.name)).map((habit) => ({ type: "habit", id: habit.id, name: habit.name }));
      const boards = (state.data.boards ?? []).filter((board) => includes(board.name)).map((board) => ({ type: "vision_board", id: board.id, name: board.name }));
      return { matches: [...notes, ...tasks, ...projects, ...goals, ...habits, ...boards] };
    },
  },
];

let cache: { at: number; state: McpState } | null = null;
async function loadState(): Promise<McpState | null> {
  if (cache && Date.now() - cache.at < 1500) return cache.state;
  const raw = await readRawData();
  if (!raw) return null;
  const makeState = (nextRaw: BridgeData): McpState => ({
    raw: nextRaw,
    data: sanitize(nextRaw),
    save: async (next) => {
      if (!(await writeRawData(next))) throw new Error("Bridge data store is not configured.");
      cache = { at: Date.now(), state: makeState(next) };
    },
  });
  const state = makeState(raw);
  cache = { at: Date.now(), state };
  return state;
}

type RpcReq = { jsonrpc: "2.0"; id?: string | number; method: string; params?: Record<string, unknown> };
const ok = (id: unknown, result: unknown) => ({ jsonrpc: "2.0", id, result });
const err = (id: unknown, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

async function handle(message: RpcReq): Promise<object | null> {
  const { id, method, params } = message;
  if (id === undefined || id === null) return null;
  switch (method) {
    case "initialize":
      return ok(id, { protocolVersion: (params?.protocolVersion as string) || "2025-06-18", capabilities: { tools: {}, resources: {} }, serverInfo: SERVER_INFO, instructions: "Bridge agents can read and edit the workspace, including Vision boards and drawings. Locked Notes pages are private: they are never listed, read, edited, or deleted." });
    case "ping": return ok(id, {});
    case "tools/list": return ok(id, { tools: TOOLS.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema })) });
    case "tools/call": {
      const tool = TOOLS.find((candidate) => candidate.name === params?.name);
      if (!tool) return err(id, -32602, `Unknown tool: ${String(params?.name)}`);
      const state = await loadState();
      if (!state) return ok(id, { content: [{ type: "text", text: "Bridge data store isn't configured (no Redis)." }], isError: true });
      try {
        const result = await tool.run((params?.arguments as Record<string, unknown>) || {}, state);
        return ok(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], isError: !!(asObject(result)?.error) });
      } catch (cause) {
        return ok(id, { content: [{ type: "text", text: `Tool error: ${String(cause)}` }], isError: true });
      }
    }
    case "resources/list": return ok(id, { resources: [] });
    default: return err(id, -32601, `Method not found: ${method}`);
  }
}

function jsonResponse(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } }); }

export async function POST(req: NextRequest) {
  if (!(await authorized(req))) {
    const origin = new URL(req.url).origin;
    return new Response(JSON.stringify(err(null, -32001, "Unauthorized.")), { status: 401, headers: { "Content-Type": "application/json", "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`, ...CORS } });
  }
  let body: unknown;
  try { body = await req.json(); } catch { return jsonResponse(err(null, -32700, "Parse error"), 400); }
  const batch = Array.isArray(body);
  const responses: object[] = [];
  for (const message of (batch ? body : [body]) as RpcReq[]) {
    const response = await handle(message);
    if (response) responses.push(response);
  }
  if (!responses.length) return new Response(null, { status: 202, headers: CORS });
  return jsonResponse(batch ? responses : responses[0]);
}

export function GET(req: NextRequest) {
  if ((req.headers.get("accept") || "").includes("text/event-stream")) return new Response("SSE stream not supported (stateless server).", { status: 405, headers: CORS });
  const configured = process.env.MCP_TOKEN ? "configured" : "NOT configured (set MCP_TOKEN)";
  return jsonResponse({ name: SERVER_INFO.name, transport: "streamable-http (POST JSON-RPC)", auth: `Bearer token (${configured})`, tools: TOOLS.map((tool) => tool.name), note: "Agents can edit Bridge data. Locked Notes are always excluded and protected." });
}

export function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }
