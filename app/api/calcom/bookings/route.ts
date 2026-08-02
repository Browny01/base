import { NextResponse } from "next/server";

// Cal.com API v1 was decommissioned — this uses API v2.
// Docs: https://cal.com/docs/api-reference/v2/bookings
const CAL_API_VERSION = "2026-05-01";
const MAX_RANGE_MS = 62 * 86_400_000;
const MAX_PAGES = 4;

interface V2Booking {
  id: number;
  uid?: string;
  title?: string;
  start?: string;      // v2 (version 2024-08-13)
  end?: string;
  startTime?: string;  // fallback for other shapes
  endTime?: string;
  status?: string;     // "accepted" | "pending" | "cancelled" | "rejected" | ...
  attendees?: { name?: string; email?: string }[];
}

const startOf = (b: V2Booking) => b.start ?? b.startTime ?? "";
const endOf = (b: V2Booking) => b.end ?? b.endTime ?? "";

function normalizeBooking(b: V2Booking) {
  return {
    id: b.id,
    uid: b.uid,
    title: b.title ?? "Booking",
    startTime: startOf(b),
    endTime: endOf(b),
    status: b.status ?? "accepted",
    attendee: b.attendees?.[0]?.name ?? "Guest",
  };
}

async function fetchBookings(key: string, afterStart: string, beforeEnd: string): Promise<V2Booking[]> {
  const all: V2Booking[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({ afterStart, beforeEnd, sortStart: "asc", limit: "50" });
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`https://api.cal.com/v2/bookings?${params}`, {
      headers: {
        Authorization: `Bearer ${key}`,
        "cal-api-version": CAL_API_VERSION,
        "Content-Type": "application/json",
      },
      next: { revalidate: 60 },
    });
    const body = await res.json();
    if (!res.ok || body?.status === "error") {
      throw new Error(body?.error?.message || `Cal.com HTTP ${res.status}`);
    }
    const bookings: V2Booking[] = Array.isArray(body?.data) ? body.data : Array.isArray(body?.bookings) ? body.bookings : [];
    all.push(...bookings);
    const pagination = body?.pagination;
    cursor = pagination?.hasMore && typeof pagination?.nextCursor === "string" ? pagination.nextCursor : null;
    if (!cursor) break;
  }

  return all;
}

export async function GET(request: Request) {
  const key = process.env.CALCOM_API_KEY;
  if (!key) return NextResponse.json({ configured: false });

  try {
    const now = new Date();
    const requestUrl = new URL(request.url);
    const requestedStart = requestUrl.searchParams.get("start");
    const requestedEnd = requestUrl.searchParams.get("end");

    if ((requestedStart && !requestedEnd) || (!requestedStart && requestedEnd)) {
      return NextResponse.json({ configured: true, error: "Both start and end are required." }, { status: 400 });
    }

    if (requestedStart && requestedEnd) {
      const startMs = Date.parse(requestedStart);
      const endMs = Date.parse(requestedEnd);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs || endMs - startMs > MAX_RANGE_MS) {
        return NextResponse.json({ configured: true, error: "Choose a valid calendar range of 62 days or fewer." }, { status: 400 });
      }
      const all = await fetchBookings(key, new Date(startMs).toISOString(), new Date(endMs).toISOString());
      const live = all.filter((b) => b.status !== "cancelled" && b.status !== "rejected");
      return NextResponse.json({ configured: true, bookings: live.sort((a, b) => startOf(a).localeCompare(startOf(b))).map(normalizeBooking) });
    }

    const today = now.toISOString().split("T")[0];
    const ym = today.slice(0, 7);                       // YYYY-MM
    const monthStart = `${ym}-01T00:00:00.000Z`;
    const weekEndStr = new Date(now.getTime() + 7 * 86400000).toISOString().split("T")[0];
    const horizon = new Date(now);
    horizon.setUTCFullYear(horizon.getUTCFullYear() + 1);

    const all = await fetchBookings(key, monthStart, horizon.toISOString());
    const live = all.filter((b) => b.status !== "cancelled" && b.status !== "rejected");

    const nowMs = now.getTime();
    const todayBookings = live.filter((b) => startOf(b).startsWith(today));
    const weekBookings = live.filter((b) => { const d = startOf(b).split("T")[0]; return d >= today && d <= weekEndStr; });
    const monthBookings = live.filter((b) => startOf(b).startsWith(ym));
    const upcoming = live
      .filter((b) => new Date(startOf(b)).getTime() >= nowMs)
      .sort((a, b) => startOf(a).localeCompare(startOf(b)));

    return NextResponse.json({
      configured: true,
      upcoming: upcoming.slice(0, 10).map(normalizeBooking),
      todayCount: todayBookings.length,
      weekCount: weekBookings.length,
      monthCount: monthBookings.length,
    });
  } catch (err) {
    console.error("[calcom/bookings]", err);
    return NextResponse.json({ configured: true, error: String(err) });
  }
}
