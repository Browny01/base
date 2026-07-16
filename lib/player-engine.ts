import type { PlayerSkill, DomainKey } from "./store";
import { Brain, Dumbbell, Zap, Sparkles, Drama, Coins, Leaf, type LucideIcon } from "lucide-react";

// ── Domain configuration ───────────────────────────────────────────────────────

export const DOMAIN_WEIGHTS: Record<DomainKey, number> = {
  mental:     20,
  physical:   20,
  sports:     20,
  appearance: 10,
  culture:    10,
  wealth:     10,
  lifestyle:  10,
};

export const DOMAIN_META: Record<DomainKey, {
  label: string; emoji: string; Icon: LucideIcon; accent: string;
  bg: string; text: string; border: string; bar: string;
}> = {
  mental:     { label: "Mental",     emoji: "🧠", Icon: Brain,    accent: "#0a0a0a", bg: "bg-[var(--chip)]", text: "text-[var(--text)]", border: "border-[var(--border)]", bar: "bg-[var(--text)]" },
  physical:   { label: "Physical",   emoji: "💪", Icon: Dumbbell, accent: "#3d3d3d", bg: "bg-[var(--chip)]", text: "text-[var(--text)]", border: "border-[var(--border)]", bar: "bg-[var(--text)]" },
  sports:     { label: "Sports",     emoji: "⚡", Icon: Zap,      accent: "#555555", bg: "bg-[var(--chip)]", text: "text-[var(--text)]", border: "border-[var(--border)]", bar: "bg-[var(--text)]" },
  appearance: { label: "Appearance", emoji: "✨", Icon: Sparkles, accent: "#6e6e6e", bg: "bg-[var(--chip)]", text: "text-[var(--text)]", border: "border-[var(--border)]", bar: "bg-[var(--text)]" },
  culture:    { label: "Culture",    emoji: "🎭", Icon: Drama,    accent: "#878787", bg: "bg-[var(--chip)]", text: "text-[var(--text)]", border: "border-[var(--border)]", bar: "bg-[var(--text)]" },
  wealth:     { label: "Wealth",     emoji: "💰", Icon: Coins,    accent: "#9e9e9e", bg: "bg-[var(--chip)]", text: "text-[var(--text)]", border: "border-[var(--border)]", bar: "bg-[var(--text)]" },
  lifestyle:  { label: "Lifestyle",  emoji: "🌿", Icon: Leaf,     accent: "#b8b8b8", bg: "bg-[var(--chip)]", text: "text-[var(--text)]", border: "border-[var(--border)]", bar: "bg-[var(--text)]" },
};

// ── Tier configuration ─────────────────────────────────────────────────────────

export interface TierInfo {
  label: string; min: number; color: string; gradient: string; glow: string; textGradient: string;
}

export const TIERS: TierInfo[] = [
  { min: 90, label: "ELITE",      color: "#0a0a0a", gradient: "from-[var(--text)] to-[#525252]", glow: "rgba(10,10,10,0.18)",    textGradient: "from-[var(--text)] to-[#404040]" },
  { min: 80, label: "STRONG",     color: "#404040", gradient: "from-[var(--text-hover)] to-[var(--muted)]", glow: "rgba(38,38,38,0.16)",    textGradient: "from-[var(--text-hover)] to-[#525252]" },
  { min: 70, label: "DEVELOPING", color: "#737373", gradient: "from-[#525252] to-[var(--faint)]", glow: "rgba(82,82,82,0.14)",    textGradient: "from-[#525252] to-[var(--muted)]" },
  { min: 60, label: "AVERAGE",    color: "#a3a3a3", gradient: "from-[var(--muted)] to-[#c4c4c4]", glow: "rgba(115,115,115,0.12)", textGradient: "from-[var(--muted)] to-[var(--faint)]" },
  { min: 0,  label: "WEAK BASE",  color: "#c4c4c4", gradient: "from-[var(--faint)] to-[var(--border-2)]", glow: "rgba(163,163,163,0.12)", textGradient: "from-[var(--faint)] to-[#c4c4c4]" },
];

export function getTier(score: number): TierInfo {
  return TIERS.find(t => score >= t.min) ?? TIERS[TIERS.length - 1];
}

// ── Score calculation ──────────────────────────────────────────────────────────

export function calcDomainScore(skills: PlayerSkill[], domain: DomainKey): number {
  const ds = skills.filter(s => s.domain === domain);
  if (!ds.length) return 0;
  const totalW = ds.reduce((a, s) => a + s.weight, 0);
  if (!totalW) return 0;
  return Math.round((ds.reduce((a, s) => a + s.currentScore * s.weight, 0) / totalW) * 10);
}

export function calcSubdomainScore(skills: PlayerSkill[], domain: DomainKey, sub: string): number {
  const ss = skills.filter(s => s.domain === domain && s.subdomain === sub);
  if (!ss.length) return 0;
  const totalW = ss.reduce((a, s) => a + s.weight, 0);
  if (!totalW) return 0;
  return Math.round((ss.reduce((a, s) => a + s.currentScore * s.weight, 0) / totalW) * 10);
}

export function calcOverallRating(skills: PlayerSkill[]): number {
  const domains = Object.keys(DOMAIN_WEIGHTS) as DomainKey[];
  const totalW = domains.reduce((a, d) => a + DOMAIN_WEIGHTS[d], 0);
  const weighted = domains.reduce((a, d) => a + calcDomainScore(skills, d) * DOMAIN_WEIGHTS[d], 0);
  return Math.round(totalW ? weighted / totalW : 0);
}

// ── Analytics helpers ──────────────────────────────────────────────────────────

export function getTopDomain(skills: PlayerSkill[]): { domain: DomainKey; score: number } | null {
  const domains = (Object.keys(DOMAIN_WEIGHTS) as DomainKey[])
    .map(d => ({ domain: d, score: calcDomainScore(skills, d) }))
    .filter(d => d.score > 0);
  if (!domains.length) return null;
  return domains.reduce((a, b) => b.score > a.score ? b : a);
}

export function getWeakestDomain(skills: PlayerSkill[]): { domain: DomainKey; score: number } | null {
  const domains = (Object.keys(DOMAIN_WEIGHTS) as DomainKey[])
    .map(d => ({ domain: d, score: calcDomainScore(skills, d) }))
    .filter(d => d.score > 0);
  if (!domains.length) return null;
  return domains.reduce((a, b) => b.score < a.score ? b : a);
}

export function getSkillTrend(skill: PlayerSkill): number {
  const h = skill.history;
  if (!h || h.length < 2) return 0;
  return skill.currentScore - h[h.length - 2].score;
}

export function getMostImproved(skills: PlayerSkill[]): (PlayerSkill & { gain: number }) | null {
  const candidates = skills
    .map(s => ({ ...s, gain: getSkillTrend(s) }))
    .filter(s => s.gain > 0)
    .sort((a, b) => b.gain - a.gain);
  return candidates[0] ?? null;
}

export function getNeedsReview(skills: PlayerSkill[]): PlayerSkill[] {
  const now = new Date();
  return skills.filter(s => {
    if (!s.lastReviewed) return true;
    const days = (now.getTime() - new Date(s.lastReviewed).getTime()) / 86400000;
    const limit = s.reviewFrequency === "weekly" ? 7 : s.reviewFrequency === "quarterly" ? 90 : 30;
    return days > limit;
  });
}

export function getSubdomains(skills: PlayerSkill[], domain: DomainKey): string[] {
  return [...new Set(skills.filter(s => s.domain === domain).map(s => s.subdomain))];
}

export function getAllDomainScores(skills: PlayerSkill[]): Record<DomainKey, number> {
  return Object.fromEntries(
    (Object.keys(DOMAIN_WEIGHTS) as DomainKey[]).map(d => [d, calcDomainScore(skills, d)])
  ) as Record<DomainKey, number>;
}
