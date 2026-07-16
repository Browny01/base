import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

export interface TokenBalance {
  mint: string;
  symbol: string;
  name: string;
  balance: number;
  decimals: number;
  priceUsd: number | null;
  priceAud: number | null;
  valueAud: number | null;
  logoUri?: string;
}

// ─── Base58 helpers ────────────────────────────────────────────────────────
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function b58decode(s: string): Uint8Array {
  let n = 0n;
  for (const c of s) n = n * 58n + BigInt(B58.indexOf(c));
  const bytes: number[] = [];
  while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n; }
  while (bytes.length < 32) bytes.unshift(0);
  return new Uint8Array(bytes.slice(-32));
}

function b58encode(buf: Uint8Array): string {
  let n = 0n;
  for (const b of buf) n = n * 256n + BigInt(b);
  const chars: string[] = [];
  while (n > 0n) { chars.unshift(B58[Number(n % 58n)]); n /= 58n; }
  for (const b of buf) { if (b === 0) chars.unshift("1"); else break; }
  return chars.join("");
}

// ─── ed25519 on-curve check (for PDA derivation) ────────────────────────────
const ED_P = 2n ** 255n - 19n;
// d = -121665 * inverse(121666, p) mod p
const ED_D = 37095705934669439343138083508754565189542113879843219016388785533085940283555n;

function modPow(b: bigint, e: bigint, m: bigint): bigint {
  let r = 1n; b %= m;
  while (e > 0n) {
    if (e & 1n) r = r * b % m;
    e >>= 1n; b = b * b % m;
  }
  return r;
}

function isOnEd25519Curve(bytes: Uint8Array): boolean {
  let y = 0n;
  for (let i = 0; i < 32; i++) y |= BigInt(bytes[i]) << BigInt(8 * i);
  y &= (1n << 255n) - 1n;
  if (y >= ED_P) return false;
  const y2 = y * y % ED_P;
  const u = (y2 - 1n + ED_P) % ED_P;
  const v = (ED_D * y2 % ED_P + 1n) % ED_P;
  if (v === 0n) return u === 0n;
  const x2 = u * modPow(v, ED_P - 2n, ED_P) % ED_P;
  return modPow(x2, (ED_P - 1n) / 2n, ED_P) !== ED_P - 1n;
}

// ─── Metaplex metadata PDA derivation ───────────────────────────────────────
const METADATA_PROGRAM = b58decode("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

function findMetadataPda(mint: string): string {
  const mintBytes = b58decode(mint);
  const prefix = Buffer.from("metadata", "utf8");
  for (let bump = 255; bump >= 0; bump--) {
    const hash = new Uint8Array(
      createHash("sha256")
        .update(prefix)
        .update(METADATA_PROGRAM)
        .update(mintBytes)
        .update(Buffer.from([bump]))
        .update(METADATA_PROGRAM)
        .update(Buffer.from("ProgramDerivedAddress", "utf8"))
        .digest()
    );
    if (!isOnEd25519Curve(hash)) return b58encode(hash);
  }
  throw new Error(`No PDA for ${mint}`);
}

// Decode Metaplex Token Metadata v1 layout from raw account data
// Layout: 1 (key) + 32 (update_auth) + 32 (mint)
//         + [4+32] (name) + [4+10] (symbol) + [4+200] (uri)
function decodeMetaplexMeta(raw: Buffer): { name: string; symbol: string } | null {
  try {
    let off = 65; // skip key + update_authority + mint
    const nameLen = raw.readUInt32LE(off); off += 4;
    const name = raw.subarray(off, off + Math.min(nameLen, 32)).toString("utf8").replace(/\0/g, "").trim();
    off += 32; // padded to MAX_NAME_LENGTH
    const symLen = raw.readUInt32LE(off); off += 4;
    const symbol = raw.subarray(off, off + Math.min(symLen, 10)).toString("utf8").replace(/\0/g, "").trim();
    if (!name && !symbol) return null;
    return { name: name || symbol, symbol: symbol || name };
  } catch { return null; }
}

// ─── Solana RPC helpers ─────────────────────────────────────────────────────
const SOL_RPCS = [
  "https://api.mainnet-beta.solana.com",
  "https://solana-rpc.publicnode.com",
  "https://rpc.ankr.com/solana",
];
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022   = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

async function solRpc(body: object): Promise<unknown> {
  let last: unknown;
  for (const url of SOL_RPCS) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) return r.json();
      last = new Error(`HTTP ${r.status}`);
    } catch (e) { last = e; }
  }
  throw last;
}

// Batch-fetch Metaplex metadata accounts and decode them
async function fetchMetaplexBatch(
  mints: string[]
): Promise<Map<string, { name: string; symbol: string }>> {
  if (mints.length === 0) return new Map();
  const pdas = mints.map((m) => ({ mint: m, pda: (() => { try { return findMetadataPda(m); } catch { return null; } })() }));
  const validPdas = pdas.filter((p): p is typeof p & { pda: string } => p.pda !== null);
  if (validPdas.length === 0) return new Map();

  try {
    const resp = await solRpc({
      jsonrpc: "2.0",
      id: 1,
      method: "getMultipleAccounts",
      params: [validPdas.map((p) => p.pda), { encoding: "base64" }],
    }) as { result: { value: Array<{ data: [string, string] } | null> } };

    const accounts = resp?.result?.value ?? [];
    const result = new Map<string, { name: string; symbol: string }>();

    for (let i = 0; i < validPdas.length; i++) {
      const acct = accounts[i];
      if (!acct?.data?.[0]) continue;
      const raw = Buffer.from(acct.data[0], "base64");
      const meta = decodeMetaplexMeta(raw);
      if (meta) result.set(validPdas[i].mint, meta);
    }
    return result;
  } catch { return new Map(); }
}

// ─── Jupiter token list (strict, ~3k verified tokens, for logos) ─────────────
interface JupMeta { symbol: string; name: string; logoURI?: string }

async function getJupiterStrictMap(): Promise<Map<string, JupMeta>> {
  try {
    const res = await fetch("https://token.jup.ag/strict", { next: { revalidate: 3600 } });
    if (!res.ok) return new Map();
    const list: Array<{ address: string; symbol: string; name: string; logoURI?: string }> = await res.json();
    return new Map(list.map((t) => [t.address, { symbol: t.symbol, name: t.name, logoURI: t.logoURI }]));
  } catch { return new Map(); }
}

// ─── DexScreener: prices + names + images for any DEX-traded token ───────────
interface DexInfo { symbol: string; name: string; price: number; imageUrl?: string }

async function getDexScreenerData(mints: string[]): Promise<Map<string, DexInfo>> {
  const result = new Map<string, DexInfo>();
  if (mints.length === 0) return result;

  // DexScreener allows up to 30 addresses per call
  const batches: string[][] = [];
  for (let i = 0; i < mints.length; i += 30) batches.push(mints.slice(i, i + 30));

  await Promise.all(
    batches.map(async (batch) => {
      try {
        const res = await fetch(
          `https://api.dexscreener.com/latest/dex/tokens/${batch.join(",")}`,
          { next: { revalidate: 30 } }
        );
        if (!res.ok) return;
        const data = await res.json();
        for (const pair of (data.pairs ?? []) as Array<{
          chainId: string;
          baseToken: { address: string; name: string; symbol: string };
          priceUsd?: string;
          info?: { imageUrl?: string };
        }>) {
          if (pair.chainId !== "solana") continue;
          const addr = pair.baseToken.address;
          if (result.has(addr)) continue; // keep first (highest liquidity) pair
          const price = pair.priceUsd ? parseFloat(pair.priceUsd) : 0;
          if (!isNaN(price) && price > 0) {
            result.set(addr, {
              symbol: pair.baseToken.symbol,
              name: pair.baseToken.name,
              price,
              imageUrl: pair.info?.imageUrl,
            });
          }
        }
      } catch {}
    })
  );
  return result;
}

// ─── Jupiter Price API v2 ────────────────────────────────────────────────────
async function getJupiterPrices(mints: string[]): Promise<Map<string, number>> {
  if (mints.length === 0) return new Map();
  const result = new Map<string, number>();
  try {
    const urls = [
      `https://api.jup.ag/price/v2?ids=${mints.slice(0, 100).join(",")}`,
      `https://lite-api.jup.ag/price/v2?ids=${mints.slice(0, 100).join(",")}`,
    ];
    for (const url of urls) {
      const res = await fetch(url, { next: { revalidate: 30 } });
      if (!res.ok) continue;
      const d = await res.json();
      for (const [mint, info] of Object.entries(d?.data ?? {})) {
        const p = (info as { price?: string }).price;
        if (p) result.set(mint, parseFloat(p));
      }
      if (result.size > 0) break;
    }
  } catch {}
  return result;
}

// ─── FX rate ────────────────────────────────────────────────────────────────
async function getUsdToAud(): Promise<number> {
  try {
    const res = await fetch(
      "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
      { next: { revalidate: 3600 } }
    );
    if (res.ok) { const d = await res.json(); if (typeof d?.usd?.aud === "number") return d.usd.aud; }
  } catch {}
  return 1.55;
}

// ─── Main Solana token fetcher ───────────────────────────────────────────────
async function fetchSolanaTokens(address: string, usdToAud: number): Promise<TokenBalance[]> {
  type RawAcct = { account: { data: { parsed: { info: { mint: string; tokenAmount: { uiAmount: number | null; decimals: number } } } } } };

  const makeBody = (prog: string) => ({
    jsonrpc: "2.0", id: 1,
    method: "getTokenAccountsByOwner",
    params: [address, { programId: prog }, { encoding: "jsonParsed" }],
  });

  const [r1, r2] = await Promise.allSettled([solRpc(makeBody(TOKEN_PROGRAM)), solRpc(makeBody(TOKEN_2022))]);
  const raw: RawAcct[] = [];
  for (const r of [r1, r2]) {
    if (r.status === "fulfilled") {
      raw.push(...((r.value as { result: { value: RawAcct[] } }).result?.value ?? []));
    }
  }

  const nonEmpty = raw.filter((a) => (a.account.data.parsed.info.tokenAmount.uiAmount ?? 0) > 0);
  if (nonEmpty.length === 0) return [];

  const mints = [...new Set(nonEmpty.map((a) => a.account.data.parsed.info.mint))];

  // Run all lookups in parallel
  const [jupMap, metaplexMap, jupPrices, dexMap] = await Promise.all([
    getJupiterStrictMap(),
    fetchMetaplexBatch(mints),
    getJupiterPrices(mints),
    getDexScreenerData(mints),
  ]);

  return nonEmpty
    .filter((a) => (a.account.data.parsed.info.tokenAmount.uiAmount ?? 0) > 0)
    .map((a) => {
      const info = a.account.data.parsed.info;
      const mint = info.mint;
      const balance = info.tokenAmount.uiAmount ?? 0;
      const decimals = info.tokenAmount.decimals;

      // Resolve metadata: Jupiter strict → Metaplex on-chain → DexScreener → truncated address
      const jup = jupMap.get(mint);
      const meta = metaplexMap.get(mint);
      const dex = dexMap.get(mint);

      const symbol  = jup?.symbol  ?? meta?.symbol  ?? dex?.symbol  ?? mint.slice(0, 4) + "…" + mint.slice(-4);
      const name    = jup?.name    ?? meta?.name    ?? dex?.name    ?? "Unknown Token";
      const logoUri = jup?.logoURI ?? dex?.imageUrl;

      // Resolve price: Jupiter → DexScreener
      const priceUsd  = jupPrices.get(mint) ?? dex?.price ?? null;
      const priceAud  = priceUsd !== null ? priceUsd * usdToAud : null;
      const valueAud  = priceAud !== null ? balance * priceAud  : null;

      return { mint, symbol, name, balance, decimals, priceUsd, priceAud, valueAud, logoUri };
    });
}

// ─── Ethereum ERC-20 tokens via Ethplorer ────────────────────────────────────
async function fetchEthereumTokens(address: string, usdToAud: number): Promise<TokenBalance[]> {
  const res = await fetch(
    `https://api.ethplorer.io/getAddressInfo/${address}?apiKey=freekey`,
    { next: { revalidate: 120 } }
  );
  if (!res.ok) throw new Error(`Ethplorer HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data.tokens)) return [];

  return data.tokens
    .filter((t: { balance: number }) => t.balance > 0)
    .map((t: {
      tokenInfo: { address: string; symbol: string; name: string; decimals: string | number; price?: { rate?: number }; image?: string };
      balance: number;
    }) => {
      const decimals  = parseInt(String(t.tokenInfo.decimals ?? "18"));
      const balance   = t.balance / Math.pow(10, decimals);
      const priceUsd  = t.tokenInfo.price?.rate ? Number(t.tokenInfo.price.rate) : null;
      const priceAud  = priceUsd !== null ? priceUsd * usdToAud : null;
      const valueAud  = priceAud !== null ? balance * priceAud  : null;
      return {
        mint:     t.tokenInfo.address,
        symbol:   t.tokenInfo.symbol ?? "???",
        name:     t.tokenInfo.name   ?? "Unknown",
        balance, decimals, priceUsd, priceAud, valueAud,
        logoUri:  t.tokenInfo.image ? `https://ethplorer.io${t.tokenInfo.image}` : undefined,
      };
    });
}

// ─── Route handler ───────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const network = searchParams.get("network");
  const address = searchParams.get("address");

  if (!network || !address) {
    return NextResponse.json({ error: "Missing network or address" }, { status: 400 });
  }
  if (network !== "solana" && network !== "ethereum") {
    return NextResponse.json({ tokens: [] });
  }

  const usdToAud = await getUsdToAud();

  try {
    let tokens: TokenBalance[];
    if (network === "solana") {
      tokens = await fetchSolanaTokens(address, usdToAud);
    } else {
      tokens = await fetchEthereumTokens(address, usdToAud);
    }

    tokens.sort((a, b) => {
      if (a.valueAud !== null && b.valueAud !== null) return b.valueAud - a.valueAud;
      if (a.valueAud !== null) return -1;
      if (b.valueAud !== null) return 1;
      return b.balance - a.balance;
    });

    return NextResponse.json({ tokens, usdToAud });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error", tokens: [] },
      { status: 500 }
    );
  }
}
