import { NextRequest, NextResponse } from "next/server";

const SOL_ENDPOINTS = [
  "https://api.mainnet-beta.solana.com",
  "https://solana-rpc.publicnode.com",
  "https://rpc.ankr.com/solana",
];

const ETH_ENDPOINTS = [
  "https://cloudflare-eth.com",
  "https://eth.llamarpc.com",
  "https://rpc.ankr.com/eth",
  "https://ethereum-rpc.publicnode.com",
];

async function tryEndpoints(
  endpoints: string[],
  body: object
): Promise<Response> {
  let lastErr: unknown;
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) return res;
      lastErr = new Error(`HTTP ${res.status} from ${url}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const network = searchParams.get("network");
  const address = searchParams.get("address");

  if (!network || !address) {
    return NextResponse.json({ error: "Missing network or address" }, { status: 400 });
  }

  try {
    let balance = 0;

    switch (network) {
      case "bitcoin": {
        const res = await fetch(`https://blockstream.info/api/address/${address}`);
        if (!res.ok) throw new Error(`Blockstream HTTP ${res.status}`);
        const d = await res.json();
        balance =
          (d.chain_stats.funded_txo_sum - d.chain_stats.spent_txo_sum) / 1e8;
        break;
      }

      case "solana": {
        const body = { jsonrpc: "2.0", id: 1, method: "getBalance", params: [address] };
        const res = await tryEndpoints(SOL_ENDPOINTS, body);
        const d = await res.json();
        if (d.error) throw new Error(d.error.message ?? "Solana RPC error");
        balance = d.result.value / 1e9;
        break;
      }

      case "ethereum": {
        const body = { jsonrpc: "2.0", method: "eth_getBalance", params: [address, "latest"], id: 1 };
        const res = await tryEndpoints(ETH_ENDPOINTS, body);
        const d = await res.json();
        if (d.error) throw new Error(d.error.message ?? "ETH RPC error");
        balance = parseInt(d.result as string, 16) / 1e18;
        break;
      }

      case "hyperevm": {
        const res = await fetch("https://rpc.hyperliquid.xyz/evm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "eth_getBalance",
            params: [address, "latest"],
            id: 1,
          }),
        });
        if (!res.ok) throw new Error(`HyperEVM HTTP ${res.status}`);
        const d = await res.json();
        if (d.error) throw new Error(d.error.message ?? "HyperEVM RPC error");
        balance = parseInt(d.result as string, 16) / 1e18;
        break;
      }

      default:
        return NextResponse.json({ error: "Unknown network" }, { status: 400 });
    }

    return NextResponse.json({ balance });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
