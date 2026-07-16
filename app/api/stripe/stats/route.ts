import { NextResponse } from "next/server";

const AUD_CODE = "aud";

export async function GET() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return NextResponse.json({ configured: false });

  const headers = { Authorization: `Bearer ${key}` };

  try {
    const since = Math.floor((Date.now() - 30 * 86400000) / 1000);

    const [balRes, chargesRes, custRes] = await Promise.all([
      fetch("https://api.stripe.com/v1/balance", { headers }),
      fetch(`https://api.stripe.com/v1/charges?limit=100&created[gte]=${since}`, { headers }),
      fetch("https://api.stripe.com/v1/customers?limit=1", { headers }),
    ]);

    const [balance, chargesBody, custBody] = await Promise.all([
      balRes.json(), chargesRes.json(), custRes.json(),
    ]);

    const charges: {
      id: string; amount: number; currency: string; status: string;
      description: string | null; created: number; customer: string | null;
    }[] = chargesBody.data ?? [];

    const succeeded = charges.filter(c => c.status === "succeeded");
    const monthlyRevenue = succeeded.reduce((s, c) => s + c.amount, 0) / 100;
    const avgOrder = succeeded.length ? monthlyRevenue / succeeded.length : 0;

    // Daily revenue map for chart
    const dailyRevenue: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().split("T")[0];
      dailyRevenue[d] = 0;
    }
    for (const c of succeeded) {
      const d = new Date(c.created * 1000).toISOString().split("T")[0];
      if (d in dailyRevenue) dailyRevenue[d] += c.amount / 100;
    }

    const available = (balance.available ?? []).find(
      (b: { currency: string; amount: number }) => b.currency === AUD_CODE
    ) ?? balance.available?.[0] ?? { amount: 0, currency: "aud" };

    return NextResponse.json({
      configured: true,
      balance: available.amount / 100,
      currency: (available.currency ?? "aud").toUpperCase(),
      monthlyRevenue,
      transactionCount: succeeded.length,
      avgOrder,
      customerCount: custBody.total_count ?? 0,
      recentCharges: succeeded.slice(0, 8).map(c => ({
        id: c.id,
        amount: c.amount / 100,
        currency: c.currency.toUpperCase(),
        description: c.description ?? "Payment",
        date: new Date(c.created * 1000).toISOString().split("T")[0],
      })),
      dailyRevenue: Object.entries(dailyRevenue).map(([date, amount]) => ({
        date: date.slice(5), // MM-DD
        amount,
      })),
    });
  } catch (err) {
    console.error("[stripe/stats]", err);
    return NextResponse.json({ configured: true, error: String(err) });
  }
}
