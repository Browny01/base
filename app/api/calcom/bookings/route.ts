import { NextResponse } from "next/server";
import { requireBridgeSession } from "@/lib/session";

// Cal.com API v1 was decommissioned — this uses API v2.
// Docs: https://cal.com/docs/api-reference/v2/bookings
const CAL_API_VERSION = "2024-08-13";

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

export async function GET(request: Request) {
  const unauthorized = await requireBridgeSession(request); if (unauthorized) return unauthorized;
  const key = process.env.CALCOM_API_KEY;
  if (!key) return NextResponse.json({ configured: false });

  try {
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const ym = today.slice(0, 7);                       // YYYY-MM
    const monthStart = `${ym}-01T00:00:00.000Z`;
    const weekEndStr = new Date(now.getTime() + 7 * 86400000).toISOString().split("T")[0];

    // One call from month-start onward covers this-month history + everything upcoming.
    const res = await fetch(
      `https://api.cal.com/v2/bookings?afterStart=${encodeURIComponent(monthStart)}&sortStart=asc&take=100`,
      {
        headers: {
          Authorization: `Bearer ${key}`,
          "cal-api-version": CAL_API_VERSION,
          "Content-Type": "application/json",
        },
        next: { revalidate: 60 },
      },
    );

    const body = await res.json();
    if (!res.ok || body?.status === "error") {
      return NextResponse.json({ configured: true, error: body?.error?.message || `Cal.com HTTP ${res.status}` });
    }

    const all: V2Booking[] = Array.isArray(body?.data) ? body.data : Array.isArray(body?.bookings) ? body.bookings : [];
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
      upcoming: upcoming.slice(0, 10).map((b) => ({
        id: b.id,
        title: b.title ?? "Booking",
        startTime: startOf(b),
        endTime: endOf(b),
        status: b.status ?? "accepted",
        attendee: b.attendees?.[0]?.name ?? "Guest",
      })),
      todayCount: todayBookings.length,
      weekCount: weekBookings.length,
      monthCount: monthBookings.length,
    });
  } catch (err) {
    console.error("[calcom/bookings]", err);
    return NextResponse.json({ configured: true, error: String(err) });
  }
}
