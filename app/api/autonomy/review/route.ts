import { NextRequest, NextResponse } from "next/server";
import { applyOwnerAutonomyDecision } from "@/lib/autonomy-persistence";
import { mcpRedis } from "@/lib/mcp-data";

const DECISIONS = new Set(["approve", "verify", "requeue", "reject"] as const);
type Decision = "approve" | "verify" | "requeue" | "reject";

export async function POST(req: NextRequest) {
  const redis = mcpRedis();
  if (!redis) return NextResponse.json({ ok: false, error: "Bridge data is not configured." }, { status: 503 });
  try {
    const body = await req.json() as { taskId?: unknown; decision?: unknown };
    if (typeof body.taskId !== "string" || typeof body.decision !== "string" || !DECISIONS.has(body.decision as Decision)) {
      return NextResponse.json({ ok: false, error: "A valid taskId and decision are required." }, { status: 400 });
    }
    const result = await applyOwnerAutonomyDecision(redis, body.taskId, body.decision as Decision, new Date().toISOString());
    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  } catch (error) {
    console.error("[bridge/autonomy review]", error);
    return NextResponse.json({ ok: false, error: "Unable to update the autonomy task." }, { status: 500 });
  }
}
