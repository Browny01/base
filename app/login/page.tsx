"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.replace("/");
        router.refresh();
      } else {
        setError("Incorrect password");
        setPassword("");
      }
    } catch {
      setError("Something went wrong — try again");
    }

    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-[340px]">
        {/* Logo — the one place the brand accent appears */}
        <div className="flex items-center justify-center gap-2.5 mb-10">
          <div
            className="w-8 h-8 rounded-[9px] flex items-center justify-center"
            style={{ background: "var(--accent)" }}
          >
            <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-lg font-semibold text-[var(--text)] tracking-tight">Bridge</span>
        </div>

        {/* Card */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6">
          <h1 className="text-lg font-semibold text-[var(--text)] tracking-tight mb-1">
            Welcome back
          </h1>
          <p className="text-sm text-[var(--muted)] mb-6">Enter your password to continue</p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="relative">
              <input
                type={show ? "text" : "password"}
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                placeholder="Password"
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-3 pr-11 text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShow(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--faint)] hover:text-[var(--muted)] transition-colors"
              >
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {error && (
              <p className="text-sm text-[var(--text)] font-medium">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full py-3 rounded-xl font-medium text-[var(--bg)] bg-[var(--text)] border border-[var(--text)] hover:bg-[var(--text-hover)] transition-colors disabled:opacity-40 disabled:hover:bg-[var(--text)]"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-[var(--faint)] mt-6">
          Session lasts 30 days
        </p>
      </div>
    </div>
  );
}
