import { NextRequest, NextResponse } from "next/server";
import { bridgePassword } from "@/lib/env";
import { signSession } from "@/lib/session";
import { constantTimeEqual } from "@/lib/security";
import {
  clearLoginFailures,
  loginLockStatus,
  recordLoginFailure,
  requestIp,
} from "@/lib/login-rate-limit";

const COOKIE = "bridge_auth";
const DEVICE_COOKIE = "bridge_device";
const SESSION_SECONDS = 60 * 60 * 24 * 7;
const DEVICE_SECONDS = 60 * 60 * 24 * 365;
const MAX_BODY_BYTES = 4_096;

export const runtime = "nodejs";

function json(body: unknown, status: number, retryAfter = 0) {
  const response = NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
    },
  });
  return response;
}

function setDeviceCookie(response: NextResponse, device: string) {
  response.cookies.set(DEVICE_COOKIE, device, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: DEVICE_SECONDS,
    path: "/",
    sameSite: "strict",
  });
  return response;
}

export async function POST(req: NextRequest) {
  const ip = requestIp(req);
  const existingDevice = req.cookies.get(DEVICE_COOKIE)?.value;
  const device = existingDevice && /^[A-Za-z0-9-]{20,64}$/.test(existingDevice)
    ? existingDevice
    : crypto.randomUUID();

  let retryAfter: number;
  try {
    retryAfter = await loginLockStatus("site", ip, device);
  } catch (error) {
    console.error("[bridge/login configuration]", error);
    return setDeviceCookie(json({ error: "Login is not configured." }, 503), device);
  }
  if (retryAfter > 0) {
    return setDeviceCookie(json({ error: "Too many attempts. Try again later.", retryAfter }, 429, retryAfter), device);
  }

  const declaredLength = Number(req.headers.get("content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return setDeviceCookie(json({ error: "Invalid request." }, 413), device);
  }

  let password: unknown;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return setDeviceCookie(json({ error: "Invalid request." }, 413), device);
    password = (JSON.parse(raw) as { password?: unknown }).password;
  } catch {
    password = undefined;
  }

  let correct: string;
  try {
    correct = bridgePassword();
  } catch (error) {
    console.error("[bridge/login configuration]", error);
    return setDeviceCookie(json({ error: "Login is not configured." }, 503), device);
  }

  if (typeof password !== "string" || !constantTimeEqual(password, correct)) {
    const failure = await recordLoginFailure("site", ip, device);
    const status = failure.locked ? 429 : 401;
    return setDeviceCookie(json({
      error: failure.locked ? "Too many attempts. Try again later." : "Incorrect password",
      remainingAttempts: failure.remaining,
      ...(failure.locked ? { retryAfter: failure.retryAfter } : {}),
    }, status, failure.retryAfter), device);
  }

  await clearLoginFailures("site", ip, device);
  const res = setDeviceCookie(json({ ok: true }, 200), device);
  res.cookies.set(COOKIE, await signSession(7), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_SECONDS,
    path: "/",
    sameSite: "strict",
  });
  return res;
}
