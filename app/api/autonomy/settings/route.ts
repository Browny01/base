import { NextRequest, NextResponse } from "next/server";
import { normalizeAutonomySettings } from "@/lib/autonomy";
import { updateAutonomySettings } from "@/lib/autonomy-persistence";
import { DATA_KEY } from "@/lib/bridge-data";
import { mcpRedis } from "@/lib/mcp-data";
import type { BridgeData } from "@/lib/store";

export async function POST(request: NextRequest) {
  const redis = mcpRedis();
  if (!redis) return NextResponse.json({ ok: false, error: "Bridge data is not configured." }, { status: 503 });
  const patch = await request.json().catch(() => null);
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return NextResponse.json({ ok: false, error: "Invalid settings patch." }, { status: 400 });
  const currentData = await redis.get<BridgeData>(DATA_KEY);
  if (!currentData) return NextResponse.json({ ok: false, error: "Bridge data is not configured." }, { status: 503 });
  const current = normalizeAutonomySettings(currentData.autonomySettings);
  const settings = normalizeAutonomySettings({ ...current, ...patch, updatedAt: new Date().toISOString() }, current);
  const result = await updateAutonomySettings(redis, settings);
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}
