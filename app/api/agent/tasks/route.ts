import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

type Priority = "P1" | "P2" | "P3";
type TaskTag = "@work" | "@personal" | "@money" | "@admin";
type RecurringFreq = "daily" | "weekly" | "monthly" | null;

interface Task {
  id: string;
  title: string;
  priority: Priority;
  tag: TaskTag;
  dueDate: string | null;
  recurring: RecurringFreq;
  done: boolean;
  createdAt: string;
  projectId?: string;
}

interface NexusData {
  tasks?: Task[];
  updatedAt?: number;
  [key: string]: unknown;
}

const KEY = "nexus:data";
const PRIORITIES = new Set(["P1", "P2", "P3"]);
const TAGS = new Set(["@work", "@personal", "@money", "@admin"]);
const RECURRING = new Set(["daily", "weekly", "monthly"]);

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function isAuthorized(req: NextRequest) {
  const token = process.env.NEXUS_AGENT_TOKEN || process.env.NEXUS_PASSWORD;
  return Boolean(token && req.headers.get("authorization") === `Bearer ${token}`);
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

async function readData(redis: Redis): Promise<NexusData> {
  let data = await redis.get<NexusData | string>(KEY);
  if (typeof data === "string") {
    try {
      data = JSON.parse(data) as NexusData;
    } catch {
      data = {};
    }
  }
  return data && typeof data === "object" && !Array.isArray(data) ? data : {};
}

async function writeData(redis: Redis, data: NexusData) {
  const next = { ...data, tasks: data.tasks ?? [], updatedAt: Date.now() };
  await redis.set(KEY, next);
  return next;
}

function parseTaskInput(input: Record<string, unknown>, existing?: Task): Task {
  const title = typeof input.title === "string" ? input.title.trim() : existing?.title;
  if (!title) throw new Error("Task title is required");

  const priority = typeof input.priority === "string" && PRIORITIES.has(input.priority)
    ? input.priority as Priority
    : existing?.priority ?? "P2";

  const tag = typeof input.tag === "string" && TAGS.has(input.tag)
    ? input.tag as TaskTag
    : existing?.tag ?? "@personal";

  const recurring = typeof input.recurring === "string" && RECURRING.has(input.recurring)
    ? input.recurring as Exclude<RecurringFreq, null>
    : input.recurring === null
      ? null
      : existing?.recurring ?? null;

  const dueDate = typeof input.dueDate === "string" && input.dueDate.trim()
    ? input.dueDate.trim()
    : input.dueDate === null
      ? null
      : existing?.dueDate ?? null;

  return {
    id: existing?.id ?? crypto.randomUUID(),
    title,
    priority,
    tag,
    dueDate,
    recurring,
    done: typeof input.done === "boolean" ? input.done : existing?.done ?? false,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    projectId: typeof input.projectId === "string" && input.projectId.trim()
      ? input.projectId.trim()
      : input.projectId === null
        ? undefined
        : existing?.projectId,
  };
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized();

  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "Data store is not configured" }, { status: 503 });

  const data = await readData(redis);
  const tasks = data.tasks ?? [];
  return NextResponse.json({
    tasks,
    open: tasks.filter((task) => !task.done),
    done: tasks.filter((task) => task.done),
    updatedAt: data.updatedAt ?? null,
  });
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized();

  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "Data store is not configured" }, { status: 503 });

  try {
    const body = await req.json() as Record<string, unknown>;
    const data = await readData(redis);
    const task = parseTaskInput(body);
    const next = await writeData(redis, { ...data, tasks: [...(data.tasks ?? []), task] });
    return NextResponse.json({ ok: true, task, updatedAt: next.updatedAt });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid task" }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized();

  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "Data store is not configured" }, { status: 503 });

  try {
    const body = await req.json() as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "Task id is required" }, { status: 400 });

    const data = await readData(redis);
    const tasks = data.tasks ?? [];
    const existing = tasks.find((task) => task.id === id);
    if (!existing) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const updated = parseTaskInput(body, existing);
    const next = await writeData(redis, {
      ...data,
      tasks: tasks.map((task) => task.id === id ? updated : task),
    });

    return NextResponse.json({ ok: true, task: updated, updatedAt: next.updatedAt });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid task" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized();

  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "Data store is not configured" }, { status: 503 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id : req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Task id is required" }, { status: 400 });

  const data = await readData(redis);
  const tasks = data.tasks ?? [];
  const nextTasks = tasks.filter((task) => task.id !== id);
  if (nextTasks.length === tasks.length) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const next = await writeData(redis, { ...data, tasks: nextTasks });
  return NextResponse.json({ ok: true, deletedId: id, updatedAt: next.updatedAt });
}
