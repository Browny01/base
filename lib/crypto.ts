"use client";

import type { WalletNetwork } from "./store";

export interface WalletBalance {
  walletId: string;
  balance: number | null;
  usdValue: number | null;
  error: string | null;
  loading: boolean;
}

export interface CryptoPrices {
  bitcoin: number | null;
  ethereum: number | null;
  solana: number | null;
  hyperliquid: number | null;
}

export async function fetchCryptoPrices(): Promise<CryptoPrices> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,hyperliquid&vs_currencies=usd",
      { cache: "no-store" }
    );
    if (!res.ok) return { bitcoin: null, ethereum: null, solana: null, hyperliquid: null };
    const data = await res.json();
    return {
      bitcoin: data.bitcoin?.usd ?? null,
      ethereum: data.ethereum?.usd ?? null,
      solana: data.solana?.usd ?? null,
      hyperliquid: data.hyperliquid?.usd ?? null,
    };
  } catch {
    return { bitcoin: null, ethereum: null, solana: null, hyperliquid: null };
  }
}

// All balance fetching goes through our server-side proxy to avoid CORS
export async function fetchWalletBalance(
  network: WalletNetwork,
  address: string
): Promise<number> {
  const res = await fetch(
    `/api/wallet/balance?network=${encodeURIComponent(network)}&address=${encodeURIComponent(address)}`
  );
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data.balance as number;
}

export const NETWORK_INFO: Record<
  WalletNetwork,
  {
    label: string;
    symbol: string;
    coingeckoId: keyof CryptoPrices;
    color: string;
    bgColor: string;
    placeholder: string;
    imageUrl: string;
  }
> = {
  bitcoin: {
    label: "Bitcoin",
    symbol: "BTC",
    coingeckoId: "bitcoin",
    color: "text-orange-400",
    bgColor: "bg-orange-500/20",
    placeholder: "bc1q... or 1... or 3...",
    imageUrl: "https://assets.coingecko.com/coins/images/1/small/bitcoin.png",
  },
  solana: {
    label: "Solana",
    symbol: "SOL",
    coingeckoId: "solana",
    color: "text-purple-400",
    bgColor: "bg-purple-500/20",
    placeholder: "Base58 address (44 chars)",
    imageUrl: "https://assets.coingecko.com/coins/images/4128/small/solana.png",
  },
  ethereum: {
    label: "Ethereum",
    symbol: "ETH",
    coingeckoId: "ethereum",
    color: "text-blue-400",
    bgColor: "bg-blue-500/20",
    placeholder: "0x...",
    imageUrl: "https://assets.coingecko.com/coins/images/279/small/ethereum.png",
  },
  hyperevm: {
    label: "HyperEVM",
    symbol: "HYPE",
    coingeckoId: "hyperliquid",
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/20",
    placeholder: "0x...",
    imageUrl: "https://assets.coingecko.com/coins/images/36928/small/hyperliquid.png",
  },
};
