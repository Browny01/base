"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useBridge } from "@/lib/hooks";
import { uid, formatAUD, getToday } from "@/lib/utils";
import type { WalletNetwork } from "@/lib/store";
import { fetchWalletBalance, fetchCryptoPrices, NETWORK_INFO } from "@/lib/crypto";
import type { TokenBalance } from "@/app/api/wallet/tokens/route";
import {
  Plus, Trash2, RefreshCw, Wallet, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NETWORKS: WalletNetwork[] = ["bitcoin", "solana", "ethereum", "hyperevm"];

interface WalletState {
  balance: number | null;
  audValue: number | null;
  tokens: TokenBalance[];
  tokensLoading: boolean;
  error: string | null;
  loading: boolean;
}

interface Props {
  onTotalUpdate?: (totalAud: number) => void;
}

// Chain icon with image + text fallback
function ChainIcon({ network }: { network: WalletNetwork }) {
  const info = NETWORK_INFO[network];
  const [failed, setFailed] = useState(false);

  return (
    <div
      className={cn(
        "w-9 h-9 rounded-full flex items-center justify-center shrink-0 overflow-hidden",
        failed ? info.bgColor : "bg-transparent"
      )}
    >
      {!failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={info.imageUrl}
          alt={info.symbol}
          className="w-9 h-9 rounded-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className={cn("text-sm font-bold", info.color)}>
          {info.symbol.slice(0, 1)}
        </span>
      )}
    </div>
  );
}

// Token icon with fallback initials
function TokenIcon({ logoUri, symbol }: { logoUri?: string; symbol: string }) {
  const [failed, setFailed] = useState(!logoUri);

  if (!failed && logoUri) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUri}
        alt={symbol}
        className="w-7 h-7 rounded-full object-cover shrink-0"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div className="w-7 h-7 rounded-full bg-[var(--surface-2)] flex items-center justify-center shrink-0">
      <span className="text-[9px] font-bold text-[var(--muted)] uppercase">
        {symbol.slice(0, 3)}
      </span>
    </div>
  );
}

export function WalletSection({ onTotalUpdate }: Props) {
  const { data, mutate } = useBridge();
  const [showForm, setShowForm] = useState(false);
  const [formNetwork, setFormNetwork] = useState<WalletNetwork>("ethereum");
  const [formAddress, setFormAddress] = useState("");
  const [formLabel, setFormLabel] = useState("");
  const [states, setStates] = useState<Record<string, WalletState>>({});
  const [usdToAud, setUsdToAud] = useState(1.55);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const onTotalRef = useRef(onTotalUpdate);
  onTotalRef.current = onTotalUpdate;

  const refresh = useCallback(async () => {
    if (data.wallets.length === 0) return;
    setRefreshing(true);

    setStates((prev) => {
      const next = { ...prev };
      data.wallets.forEach((w) => {
        next[w.id] = {
          balance: null, audValue: null,
          tokens: prev[w.id]?.tokens ?? [], tokensLoading: false,
          error: null, loading: true,
        };
      });
      return next;
    });

    const [fxData, priceData] = await Promise.all([
      fetch("/api/fx/rate").then((r) => r.json()).catch(() => ({ usdToAud: 1.55 })),
      fetchCryptoPrices(),
    ]);
    const rate: number = fxData.usdToAud ?? 1.55;
    setUsdToAud(rate);

    await Promise.all(
      data.wallets.map(async (wallet) => {
        try {
          const balance = await fetchWalletBalance(wallet.network, wallet.address);
          const info = NETWORK_INFO[wallet.network];
          const priceUsd = priceData[info.coingeckoId];
          const audValue = priceUsd !== null ? balance * priceUsd * rate : null;

          setStates((prev) => ({
            ...prev,
            [wallet.id]: {
              balance, audValue,
              tokens: prev[wallet.id]?.tokens ?? [],
              tokensLoading: wallet.network === "solana" || wallet.network === "ethereum",
              error: null, loading: false,
            },
          }));

          // Auto-fetch tokens for SOL and ETH wallets immediately
          if (wallet.network === "solana" || wallet.network === "ethereum") {
            fetch(
              `/api/wallet/tokens?network=${encodeURIComponent(wallet.network)}&address=${encodeURIComponent(wallet.address)}`
            )
              .then((r) => r.json())
              .then((d) => {
                setStates((prev) => ({
                  ...prev,
                  [wallet.id]: {
                    ...(prev[wallet.id] ?? {}),
                    tokens: d.tokens ?? [],
                    tokensLoading: false,
                  } as WalletState,
                }));
              })
              .catch(() => {
                setStates((prev) => ({
                  ...prev,
                  [wallet.id]: { ...(prev[wallet.id] ?? {}), tokens: [], tokensLoading: false } as WalletState,
                }));
              });
          }
        } catch (err) {
          setStates((prev) => ({
            ...prev,
            [wallet.id]: {
              balance: null, audValue: null,
              tokens: [], tokensLoading: false,
              error: err instanceof Error ? err.message : "Failed to fetch",
              loading: false,
            },
          }));
        }
      })
    );

    setRefreshing(false);
    setLastRefreshed(new Date());
  }, [data.wallets]);

  // Save portfolio snapshot + report total to parent
  useEffect(() => {
    const walletValues = Object.values(states);
    if (walletValues.length === 0) return;
    if (walletValues.some((s) => s.loading)) return; // wait until all loaded

    const nativeTotal = walletValues.reduce((s, w) => s + (w.audValue ?? 0), 0);
    const tokenTotal = walletValues.reduce(
      (s, w) => s + (w.tokens?.reduce((ts, t) => ts + (t.valueAud ?? 0), 0) ?? 0),
      0
    );
    const grandTotal = nativeTotal + tokenTotal;
    if (grandTotal <= 0) return;

    onTotalRef.current?.(grandTotal);

    const today = getToday();
    mutate((d) => {
      const snapshots = [...(d.portfolioSnapshots ?? [])];
      const idx = snapshots.findIndex((s) => s.date === today);
      if (idx >= 0) snapshots[idx] = { date: today, totalAud: grandTotal };
      else snapshots.push({ date: today, totalAud: grandTotal });
      snapshots.sort((a, b) => a.date.localeCompare(b.date));
      return { ...d, portfolioSnapshots: snapshots.slice(-365) };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [states]);

  useEffect(() => { refresh(); }, // eslint-disable-next-line react-hooks/exhaustive-deps
  [data.wallets.length]);

  function addWallet() {
    if (!formAddress.trim()) return;
    mutate((d) => ({
      ...d,
      wallets: [
        ...d.wallets,
        {
          id: uid(),
          network: formNetwork,
          address: formAddress.trim(),
          label: formLabel.trim() || NETWORK_INFO[formNetwork].label,
        },
      ],
    }));
    setFormAddress("");
    setFormLabel("");
    setShowForm(false);
  }

  function deleteWallet(id: string) {
    mutate((d) => ({ ...d, wallets: d.wallets.filter((w) => w.id !== id) }));
    setStates((prev) => { const n = { ...prev }; delete n[id]; return n; });
  }

  const totalAud = Object.values(states).reduce((sum, s) => {
    return (
      sum +
      (s.audValue ?? 0) +
      (s.tokens?.reduce((ts, t) => ts + (t.valueAud ?? 0), 0) ?? 0)
    );
  }, 0);

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 mt-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-[var(--text)]" />
          <h2 className="font-semibold text-[var(--text)] text-sm">Crypto Wallets</h2>
          {data.wallets.length > 0 && totalAud > 0 && (
            <span className="text-xs text-[var(--muted)]">≈ {formatAUD(totalAud)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {lastRefreshed && (
            <span className="text-xs text-[var(--faint)]">{lastRefreshed.toLocaleTimeString()}</span>
          )}
          {data.wallets.length > 0 && (
            <button
              onClick={refresh}
              disabled={refreshing}
              className="text-[var(--muted)] hover:text-[var(--text)] transition-colors disabled:opacity-40"
            >
              <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
            </button>
          )}
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 text-xs text-[var(--text)] hover:text-[var(--text)] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Wallet
          </button>
        </div>
      </div>

      {/* Add Wallet Form */}
      {showForm && (
        <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-4 mb-4 space-y-3">
          <div>
            <label className="text-xs text-[var(--muted)] mb-1.5 block">Network</label>
            <div className="flex gap-2 flex-wrap">
              {NETWORKS.map((n) => {
                const info = NETWORK_INFO[n];
                return (
                  <button
                    key={n}
                    onClick={() => setFormNetwork(n)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border transition-colors",
                      formNetwork === n
                        ? "bg-[var(--chip)] border-[var(--border-2)] text-[var(--text)]"
                        : "bg-[var(--surface)] border-[var(--border)] text-[var(--muted)] hover:border-[var(--border)]"
                    )}
                  >
                    <ChainIcon network={n} />
                    <span className={info.color}>{info.symbol}</span>
                    <span className="text-[var(--muted)]">{info.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] mb-1 block">Address</label>
            <input
              autoFocus
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--faint)] font-mono focus:outline-none focus:border-[var(--border-2)]"
              placeholder={NETWORK_INFO[formNetwork].placeholder}
              value={formAddress}
              onChange={(e) => setFormAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addWallet()}
            />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] mb-1 block">Label (optional)</label>
            <input
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)]"
              placeholder="e.g. Main wallet, Cold storage…"
              value={formLabel}
              onChange={(e) => setFormLabel(e.target.value)}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={addWallet}
              className="px-4 py-1.5 bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] text-xs font-medium rounded-lg transition-colors"
            >
              Add Wallet
            </button>
          </div>
        </div>
      )}

      {/* Wallet List */}
      {data.wallets.length === 0 ? (
        <p className="text-sm text-[var(--muted)] text-center py-6">
          No wallets linked. Add one to track your crypto balances.
        </p>
      ) : (
        <div className="space-y-2">
          {data.wallets.map((wallet) => {
            const info = NETWORK_INFO[wallet.network];
            const s = states[wallet.id];
            const hasTokenSupport = wallet.network === "solana" || wallet.network === "ethereum";
            // Filter out tokens worth less than A$1 (dust/rugs)
            const visibleTokens = (s?.tokens ?? []).filter(
              (t) => t.valueAud === null || t.valueAud >= 1
            );

            return (
              <div
                key={wallet.id}
                className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden"
              >
                {/* Wallet row */}
                <div className="flex items-center gap-3 px-4 py-3 group">
                  <ChainIcon network={wallet.network} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-[var(--text)]">{wallet.label}</p>
                      <span className={cn("text-xs font-medium", info.color)}>{info.symbol}</span>
                    </div>
                    <p className="text-xs text-[var(--faint)] font-mono truncate">{wallet.address}</p>
                  </div>

                  <div className="text-right shrink-0 mr-1">
                    {s?.loading ? (
                      <div className="flex items-center gap-1 text-[var(--muted)]">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        <span className="text-xs">Loading…</span>
                      </div>
                    ) : s?.error ? (
                      <div className="flex items-center gap-1 text-[var(--text)]" title={s.error}>
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span className="text-xs">Error</span>
                      </div>
                    ) : s?.balance !== null && s?.balance !== undefined ? (
                      <>
                        <p className="text-sm font-mono font-semibold text-[var(--text)]">
                          {s.balance < 0.0001 ? s.balance.toExponential(4) : s.balance.toFixed(6)} {info.symbol}
                        </p>
                        {s.audValue !== null ? (
                          <p className="text-xs text-[var(--text)]">{formatAUD(s.audValue)}</p>
                        ) : (
                          <p className="text-xs text-[var(--muted)]">Price unavailable</p>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-[var(--muted)]">—</span>
                    )}
                  </div>

                  <button
                    onClick={() => deleteWallet(wallet.id)}
                    className="opacity-0 group-hover:opacity-100 text-[var(--muted)] hover:text-[var(--text)] transition-all shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Token list — always visible for SOL/ETH, no toggle needed */}
                {hasTokenSupport && (
                  <div className="border-t border-[var(--border)] px-4 py-3">
                    {s?.tokensLoading ? (
                      <div className="flex items-center gap-2 text-xs text-[var(--muted)] py-3">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        Fetching tokens…
                      </div>
                    ) : visibleTokens.length > 0 ? (
                      <>
                        <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-3">
                          Tokens ({visibleTokens.length})
                        </p>
                        <div className="space-y-0.5">
                          {visibleTokens.map((token) => (
                            <div
                              key={token.mint}
                              className="flex items-center gap-3 py-2 border-b border-[var(--border)] last:border-0"
                            >
                              <TokenIcon logoUri={token.logoUri} symbol={token.symbol} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-[var(--text)] leading-tight">
                                  {token.symbol}
                                </p>
                                <p className="text-xs text-[var(--muted)] truncate leading-tight">
                                  {token.name}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-sm font-mono text-[var(--text)]">
                                  {token.balance < 0.001
                                    ? token.balance.toExponential(2)
                                    : token.balance.toLocaleString("en-AU", {
                                        maximumFractionDigits: 4,
                                      })}
                                </p>
                                {token.valueAud !== null ? (
                                  <p className="text-xs text-[var(--text)]">
                                    {formatAUD(token.valueAud)}
                                  </p>
                                ) : token.priceUsd === null ? (
                                  <p className="text-xs text-[var(--faint)]">No price</p>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>

                        {visibleTokens.some((t) => t.valueAud !== null) && (
                          <div className="flex justify-between pt-3 mt-1 border-t border-[var(--border)]">
                            <span className="text-xs text-[var(--muted)]">Token value</span>
                            <span className="text-xs font-semibold text-[var(--text)]">
                              {formatAUD(visibleTokens.reduce((sum, t) => sum + (t.valueAud ?? 0), 0))}
                            </span>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-[var(--muted)] py-3">
                        No tokens found in this wallet.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* FX rate footer */}
      <div className="mt-4 pt-3 border-t border-[var(--border)]">
        <span className="text-xs text-[var(--faint)]">
          1 USD = {formatAUD(usdToAud)}
        </span>
      </div>
    </div>
  );
}
