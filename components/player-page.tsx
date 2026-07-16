"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useBridge } from "@/lib/hooks";
import { uid } from "@/lib/utils";
import type { PlayerSkill, DomainKey, SkillType, ReviewFreq, Goal, GoalPeriod, BodyMetrics, ProgressPhoto, BridgeData } from "@/lib/store";
import {
  DOMAIN_WEIGHTS, DOMAIN_META, getTier, calcDomainScore, calcSubdomainScore,
  calcOverallRating, getTopDomain, getWeakestDomain, getMostImproved,
  getNeedsReview, getSubdomains, getAllDomainScores, getSkillTrend,
} from "@/lib/player-engine";
import { cn } from "@/lib/utils";
import {
  ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus, Info, X, Plus,
  BarChart2, Trophy, Pencil, CheckCircle2, Zap,
  Sun, CalendarDays, CalendarRange, Flag, Check, Trash2, Target, type LucideIcon,
  Moon, Scale, HeartPulse, Ruler, Camera, LineChart as LineChartIcon, Flame, X as XIcon,
  Loader2, RefreshCw,
} from "lucide-react";
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Area, AreaChart, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";
import { processFile } from "@/lib/chat-files";
import { mdToHtml } from "@/lib/markdown";

// ── Seed data ──────────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().split("T")[0];
const LAST_WEEK  = new Date(Date.now() - 7  * 86400000).toISOString().split("T")[0];
const LAST_MONTH = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

// A colour per life domain — used to liven up the otherwise-monochrome ratings UI.
const DOMAIN_HUE: Record<DomainKey, string> = {
  mental: "var(--c-indigo)", physical: "var(--c-rose)", sports: "var(--c-amber)",
  appearance: "var(--c-pink)", culture: "var(--c-purple)", wealth: "var(--c-emerald)", lifestyle: "var(--c-cyan)",
};

function sk(name: string, domain: DomainKey, sub: string, score: number, target: number, weight: number, opts: Partial<PlayerSkill> = {}): PlayerSkill {
  return { id: uid(), name, domain, subdomain: sub, type: opts.type ?? "skill", currentScore: score, targetScore: target, weight, lastReviewed: opts.lastReviewed ?? LAST_WEEK, reviewFrequency: opts.reviewFrequency ?? "monthly", history: opts.history, testMethod: opts.testMethod, primaryMetric: opts.primaryMetric, bottleneck: opts.bottleneck, nextAction: opts.nextAction, notes: opts.notes };
}

export const INITIAL_SKILLS: PlayerSkill[] = [
  // MENTAL
  sk("Consistency",           "mental","Discipline",8.0,9.5,9,{history:[{date:LAST_MONTH,score:7.5},{date:LAST_WEEK,score:7.8},{date:TODAY,score:8.0}],nextAction:"Track daily wins for 30 days straight",testMethod:"Habit streak logging"}),
  sk("Time Management",       "mental","Discipline",7.5,9.0,8,{history:[{date:LAST_MONTH,score:7.0},{date:TODAY,score:7.5}],nextAction:"Time-block every morning by 7am",bottleneck:"Evening schedule drift"}),
  sk("Accountability",        "mental","Discipline",7.5,9.0,7,{nextAction:"Weekly review every Sunday"}),
  sk("Deep Work",             "mental","Focus",     7.5,9.5,9,{history:[{date:LAST_MONTH,score:7.0},{date:TODAY,score:7.5}],primaryMetric:"Deep work mins/day",testMethod:"Track focused hours",nextAction:"Hit 4h deep work daily",bottleneck:"Phone in the morning"}),
  sk("Focus Quality",         "mental","Focus",     7.0,9.0,7,{nextAction:"No phone until 10am"}),
  sk("Distraction Resistance","mental","Focus",     6.5,9.0,8,{bottleneck:"Social media dopamine loops",nextAction:"App limits + greyscale mode"}),
  sk("Resilience",            "mental","Mindset",   7.5,9.5,9,{nextAction:"Reframe failures as data points"}),
  sk("Dopamine Control",      "mental","Mindset",   6.5,9.0,8,{bottleneck:"Short-form content habits",nextAction:"No Shorts / Reels after 8pm"}),
  sk("Emotional Regulation",  "mental","Mindset",   7.0,8.5,7,{nextAction:"Box breathing before high-pressure moments"}),
  sk("Confidence",            "mental","Mindset",   7.5,9.5,8,{history:[{date:LAST_MONTH,score:7.0},{date:TODAY,score:7.5}]}),
  sk("Communication",         "mental","Social",    7.5,9.0,7,{nextAction:"Lead more conversations"}),
  sk("Charisma",              "mental","Social",    7.5,9.0,6,{nextAction:"Record yourself talking weekly"}),
  sk("Strategic Thinking",    "mental","Cognition", 7.5,9.5,8,{nextAction:"1 business/strategy book per month"}),
  sk("Leadership",            "mental","Cognition", 7.0,9.0,7,{nextAction:"Lead team meetings for each project"}),
  // PHYSICAL
  sk("Overall Strength",  "physical","Strength",   7.5,9.5,9,{primaryMetric:"Bench/squat 1RM",testMethod:"1RM test",nextAction:"Increase bench 5kg this month"}),
  sk("Core Strength",     "physical","Strength",   7.0,9.0,7,{primaryMetric:"Plank hold time",testMethod:"Max plank",nextAction:"3×90s plank daily"}),
  sk("Grip Strength",     "physical","Strength",   6.5,8.5,6,{primaryMetric:"Dead hang time",testMethod:"Max dead hang",nextAction:"2min dead hang in warmup"}),
  sk("Sprint Speed",      "physical","Speed",      8.0,9.5,8,{primaryMetric:"100m time",testMethod:"Timed 100m",nextAction:"Sprint training 2×/week"}),
  sk("Acceleration",      "physical","Speed",      7.5,9.0,8,{primaryMetric:"0–30m time",testMethod:"30m fly",nextAction:"Resistance band starts"}),
  sk("Explosiveness",     "physical","Conditioning",7.5,9.0,8,{primaryMetric:"Vertical jump cm",testMethod:"Vert jump test",nextAction:"Depth jumps 3×/week"}),
  sk("Endurance",         "physical","Conditioning",7.5,9.0,8,{primaryMetric:"2km run time",testMethod:"2km time trial",nextAction:"Increase weekly run volume"}),
  sk("Body Composition",  "physical","Body",       8.0,9.5,8,{nextAction:"Maintain sub-12% body fat"}),
  sk("Mobility",          "physical","Body",       6.5,8.5,7,{bottleneck:"Hip flexor tightness",nextAction:"15min mobility before bed"}),
  sk("Recovery",          "physical","Body",       7.0,9.0,7,{nextAction:"Ice bath 1×/week after hard training"}),
  // SPORTS — Footy
  sk("Kicking",                "sports","Footy",7.0,9.5,9,{testMethod:"Accuracy drill",primaryMetric:"% acc at 40m",nextAction:"100 kicks/day",bottleneck:"Left foot inconsistency"}),
  sk("Kicking Under Pressure", "sports","Footy",6.5,9.0,9,{nextAction:"Practice with defenders on you"}),
  sk("Handballing",            "sports","Footy",7.5,9.0,7,{nextAction:"Both hands equally"}),
  sk("Marking",                "sports","Footy",7.0,9.0,8,{nextAction:"Contest marking drills daily"}),
  sk("Tackling",               "sports","Footy",7.5,9.0,7,{nextAction:"Low and hard technique focus"}),
  sk("Sidestep / Agility",     "sports","Footy",7.5,9.5,8,{primaryMetric:"5-5-10 agility time",nextAction:"Cone drills 3×/week"}),
  sk("Game Awareness",         "sports","Footy",6.5,9.0,9,{bottleneck:"Reading play before it happens",nextAction:"Watch game film weekly"}),
  sk("Composure Under Pressure","sports","Footy",7.0,9.5,8,{nextAction:"Practice late-game scenarios"}),
  sk("Repeat Efforts",         "sports","Footy",7.0,9.0,8,{nextAction:"HIIT 2×/week"}),
  // SPORTS — Water Polo
  sk("Eggbeater Endurance","sports","Water Polo",6.5,9.5,9,{nextAction:"Eggbeater-only sets 30min",bottleneck:"Shoulder fatigue early"}),
  sk("Freestyle Speed",    "sports","Water Polo",7.0,9.0,8,{primaryMetric:"50m freestyle time",nextAction:"Improve turn efficiency"}),
  sk("Ball Control",       "sports","Water Polo",7.0,9.0,7,{nextAction:"1-arm juggle drills in water"}),
  sk("Shooting",           "sports","Water Polo",6.5,9.0,8,{bottleneck:"Power off weak side",nextAction:"Penalty drill 50 shots/session"}),
  sk("Passing",            "sports","Water Polo",7.0,9.0,7,{nextAction:"2v1 passing circuit"}),
  sk("Defensive Pressure", "sports","Water Polo",7.0,8.5,7,{nextAction:"Close out drills with team"}),
  sk("Treading Under Fatigue","sports","Water Polo",6.5,9.0,8,{nextAction:"End-of-session eggbeater sprints"}),
  // SPORTS — Running
  sk("50m Sprint",     "sports","Running",7.5,9.5,8,{primaryMetric:"50m time (sec)",nextAction:"Improve block start"}),
  sk("100m Sprint",    "sports","Running",7.0,9.0,8,{primaryMetric:"100m time (sec)",nextAction:"Weekly time trial"}),
  sk("2km Time Trial", "sports","Running",6.5,8.5,6,{primaryMetric:"2km time (min:sec)",nextAction:"Negative split training"}),
  sk("Running Economy","sports","Running",6.5,8.5,6,{nextAction:"Stride mechanics session"}),
  // SPORTS — Swimming
  sk("50m Freestyle",   "sports","Swimming",7.0,9.0,8,{primaryMetric:"50m freestyle time",nextAction:"Tumble turn technique"}),
  sk("Stroke Technique","sports","Swimming",6.5,8.5,7,{bottleneck:"High elbow catch",nextAction:"Drill sets with pull buoy"}),
  sk("Swim Endurance",  "sports","Swimming",7.0,8.5,6,{nextAction:"1500m continuous weekly"}),
  sk("Breath Control",  "sports","Swimming",6.5,8.5,6,{nextAction:"Every-5 breathing drills"}),
  // APPEARANCE
  sk("Skin",           "appearance","Face", 7.0,9.0,8,{nextAction:"Consistent AM/PM skincare",lastReviewed:LAST_MONTH}),
  sk("Teeth",          "appearance","Face", 7.5,9.0,7,{nextAction:"Whitening strips monthly"}),
  sk("Hair",           "appearance","Face", 7.5,8.5,7,{nextAction:"Consistent cut timing + signature style"}),
  sk("Body Aesthetics","appearance","Body", 7.5,9.5,9,{nextAction:"Maintain current training intensity"}),
  sk("Posture",        "appearance","Body", 6.5,9.0,8,{bottleneck:"Desk posture habits",nextAction:"Standing desk + postural drills"}),
  sk("Neck Appearance","appearance","Body", 6.5,8.5,6,{nextAction:"Neck training 3×/week"}),
  sk("Grooming",       "appearance","Style",7.5,9.0,7,{nextAction:"Consistent grooming schedule"}),
  sk("Style / Fashion","appearance","Style",6.5,8.5,7,{bottleneck:"No clear personal aesthetic",nextAction:"Define 3 core outfit archetypes",lastReviewed:LAST_MONTH}),
  sk("Presence",       "appearance","Style",7.0,9.0,7,{nextAction:"Enter rooms with intent and composure"}),
  // CULTURE
  sk("General Knowledge",  "culture","Knowledge",6.0,8.5,7,{nextAction:"Read 30min/day on current events",lastReviewed:LAST_MONTH}),
  sk("History & Politics", "culture","Knowledge",5.5,8.0,6,{bottleneck:"Low baseline",nextAction:"1 history podcast/week",lastReviewed:LAST_MONTH}),
  sk("Music Literacy",     "culture","Arts",     6.5,8.5,6,{nextAction:"Explore 1 new genre/month"}),
  sk("Film Literacy",      "culture","Arts",     5.5,8.0,6,{nextAction:"1 acclaimed film/week",lastReviewed:LAST_MONTH}),
  sk("Aesthetic Taste",    "culture","Arts",     6.5,8.5,7,{nextAction:"Study design and visual composition"}),
  sk("Fashion Awareness",  "culture","Social",   6.5,8.0,6,{nextAction:"Follow key fashion accounts"}),
  sk("Social Etiquette",   "culture","Social",   7.0,8.5,7,{nextAction:"Study high-level social dynamics"}),
  sk("Conversation Range", "culture","Social",   6.5,8.5,7,{nextAction:"Read widely across fields"}),
  // WEALTH
  sk("Sales",               "wealth","Execution",6.5,9.5,9,{nextAction:"Outreach 10 prospects/day",bottleneck:"Weak closing",lastReviewed:LAST_MONTH}),
  sk("Copywriting",         "wealth","Execution",6.0,9.0,8,{nextAction:"Write 1 sales email/day for practice",lastReviewed:LAST_MONTH}),
  sk("Offer Creation",      "wealth","Execution",6.0,9.0,8,{bottleneck:"Not positioning value clearly",nextAction:"Refine Systemly offer stack"}),
  sk("Outreach",            "wealth","Execution",6.5,9.0,7,{nextAction:"Build 100-lead list this week"}),
  sk("Negotiation",         "wealth","Execution",5.5,8.5,7,{nextAction:"Read Never Split the Difference"}),
  sk("Financial Discipline","wealth","Systems",  7.0,9.0,8,{nextAction:"Monthly P&L review"}),
  sk("Business Systems",    "wealth","Systems",  6.5,9.0,7,{nextAction:"Document SOPs for each project"}),
  sk("Brand Building",      "wealth","Systems",  5.5,8.5,7,{bottleneck:"No consistent public presence",nextAction:"Post 1 insight/day on X",lastReviewed:LAST_MONTH}),
  sk("Content Strategy",    "wealth","Systems",  5.5,8.5,6,{nextAction:"Create 90-day content calendar"}),
  // LIFESTYLE
  sk("Sleep Quality",       "lifestyle","Recovery",7.0,9.5,9,{primaryMetric:"Hours/night + score",nextAction:"10pm bedtime non-negotiable",bottleneck:"Late-night phone use"}),
  sk("Morning Routine",     "lifestyle","Routines",7.5,9.5,8,{nextAction:"No phone for first 60min"}),
  sk("Night Routine",       "lifestyle","Routines",6.5,9.0,7,{bottleneck:"Inconsistent wind-down",nextAction:"Journaling + reading before bed"}),
  sk("Planning & Scheduling","lifestyle","Systems",7.0,9.5,8,{nextAction:"Weekly planning session every Sunday"}),
  sk("Organisation",        "lifestyle","Systems",7.0,9.0,8,{nextAction:"Inbox zero + clean desk daily"}),
  sk("Reflection",          "lifestyle","Systems",6.5,9.0,7,{nextAction:"10min journaling daily"}),
  sk("Digital Hygiene",     "lifestyle","Systems",6.0,9.0,7,{bottleneck:"Screen time creep",nextAction:"Screen time limit 2h/day social"}),
  sk("Environment",         "lifestyle","Systems",7.0,8.5,7,{nextAction:"Workspace audit weekly"}),
  sk("Recovery Systems",    "lifestyle","Recovery",6.5,9.0,7,{nextAction:"Cold exposure + stretching weekly"}),
];

// ── Shared UI helpers ──────────────────────────────────────────────────────────

function ScoreBar({ score, max = 10, color = "bg-[var(--text)]", hue, className = "" }: { score: number; max?: number; color?: string; hue?: string; className?: string }) {
  return (
    <div className={cn("h-1.5 bg-[var(--chip)] rounded-full overflow-hidden", className)}>
      <div className={cn("h-full rounded-full transition-all duration-500", !hue && color)} style={{ width: `${Math.min((score / max) * 100, 100)}%`, ...(hue ? { background: hue } : {}) }} />
    </div>
  );
}

function TrendIcon({ delta }: { delta: number }) {
  if (delta > 0) return <TrendingUp className="w-3 h-3 text-[var(--text)]" />;
  if (delta < 0) return <TrendingDown className="w-3 h-3 text-[var(--text)]" />;
  return <Minus className="w-3 h-3 text-[var(--faint)]" />;
}

function WeightBadge({ weight }: { weight: number }) {
  const label = weight >= 8 ? "High" : weight >= 5 ? "Med" : "Low";
  const cls   = weight >= 8 ? "bg-[var(--chip)] text-[var(--text)]" : weight >= 5 ? "bg-[var(--chip)] text-[var(--muted)]" : "bg-[var(--chip)] text-[var(--faint)]";
  return <span className={cn("text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide shrink-0", cls)}>{label}</span>;
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] text-[var(--faint)] uppercase tracking-[0.15em] font-semibold block mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)] transition-colors";

// ── Edit Skill Modal ───────────────────────────────────────────────────────────

function EditSkillModal({ skill, onSave, onDelete, onClose }: {
  skill: PlayerSkill;
  onSave: (id: string, updates: Partial<PlayerSkill>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name:            skill.name,
    subdomain:       skill.subdomain,
    currentScore:    skill.currentScore,
    targetScore:     skill.targetScore,
    weight:          skill.weight,
    type:            skill.type as SkillType,
    testMethod:      skill.testMethod ?? "",
    primaryMetric:   skill.primaryMetric ?? "",
    reviewFrequency: (skill.reviewFrequency ?? "monthly") as ReviewFreq,
    bottleneck:      skill.bottleneck ?? "",
    nextAction:      skill.nextAction ?? "",
    notes:           skill.notes ?? "",
  });
  const meta = DOMAIN_META[skill.domain];

  function save() {
    onSave(skill.id, {
      ...form,
      testMethod:    form.testMethod    || undefined,
      primaryMetric: form.primaryMetric || undefined,
      bottleneck:    form.bottleneck    || undefined,
      nextAction:    form.nextAction    || undefined,
      notes:         form.notes         || undefined,
    });
    onClose();
  }

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-lg max-h-[88vh] overflow-y-auto shadow-2xl nx-slide-up" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={cn("flex items-center justify-between px-5 py-4 border-b border-[var(--border)]", meta.bg)}>
          <div className="flex items-center gap-2">
            <meta.Icon className="w-4 h-4 text-[var(--text)] shrink-0" strokeWidth={1.9} />
            <div>
              <p className={cn("text-sm font-bold", meta.text)}>Edit Skill</p>
              <p className="text-[11px] text-[var(--faint)]">{meta.label} · {skill.subdomain}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-[var(--faint)] hover:text-[var(--text)] transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          <FormField label="Skill Name">
            <input className={inputCls} value={form.name} onChange={e => set("name", e.target.value)} />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Subdomain / Category">
              <input className={inputCls} value={form.subdomain} onChange={e => set("subdomain", e.target.value)} />
            </FormField>
            <FormField label="Type">
              <select className={inputCls} value={form.type} onChange={e => set("type", e.target.value as SkillType)}>
                {(["skill","trait","habit","metric","knowledge"] as SkillType[]).map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </FormField>
          </div>

          {/* Score sliders */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label={`Current Score: ${form.currentScore.toFixed(1)}`}>
              <input type="range" min="1" max="10" step="0.5" value={form.currentScore}
                onChange={e => set("currentScore", parseFloat(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer" />
              <div className="flex justify-between text-[10px] text-[var(--faint)] mt-0.5"><span>1</span><span>10</span></div>
            </FormField>
            <FormField label={`Target Score: ${form.targetScore.toFixed(1)}`}>
              <input type="range" min="1" max="10" step="0.5" value={form.targetScore}
                onChange={e => set("targetScore", parseFloat(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer" />
              <div className="flex justify-between text-[10px] text-[var(--faint)] mt-0.5"><span>1</span><span>10</span></div>
            </FormField>
          </div>

          <FormField label={`Importance / Weight: ${form.weight}/10`}>
            <input type="range" min="1" max="10" step="1" value={form.weight}
              onChange={e => set("weight", parseInt(e.target.value))}
              className="w-full accent-violet-500 cursor-pointer" />
            <div className="flex justify-between text-[10px] text-[var(--faint)] mt-0.5"><span>1 Low</span><span>10 Critical</span></div>
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Test Method">
              <input className={inputCls} placeholder="How do you measure this?" value={form.testMethod} onChange={e => set("testMethod", e.target.value)} />
            </FormField>
            <FormField label="Primary Metric">
              <input className={inputCls} placeholder="e.g. 100m time" value={form.primaryMetric} onChange={e => set("primaryMetric", e.target.value)} />
            </FormField>
          </div>

          <FormField label="Review Frequency">
            <select className={inputCls} value={form.reviewFrequency} onChange={e => set("reviewFrequency", e.target.value as ReviewFreq)}>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
            </select>
          </FormField>

          <FormField label="Current Bottleneck">
            <textarea className={inputCls} rows={2} placeholder="What's holding this back?" value={form.bottleneck} onChange={e => set("bottleneck", e.target.value)} />
          </FormField>
          <FormField label="Next Action">
            <textarea className={inputCls} rows={2} placeholder="The specific next step" value={form.nextAction} onChange={e => set("nextAction", e.target.value)} />
          </FormField>
          <FormField label="Notes">
            <textarea className={inputCls} rows={2} placeholder="Any extra context" value={form.notes} onChange={e => set("notes", e.target.value)} />
          </FormField>
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-[var(--border)]">
          <button onClick={() => { if (confirm("Delete this skill?")) { onDelete(skill.id); onClose(); } }}
            className="text-xs text-[var(--text)] hover:text-[var(--text)] transition-colors font-medium">
            Delete skill
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-xs text-[var(--faint)] hover:text-[var(--text)] transition-colors">Cancel</button>
            <button onClick={save} className="px-4 py-1.5 bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] text-xs font-semibold rounded-lg transition-colors">Save Changes</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Log Practice Modal ─────────────────────────────────────────────────────────

function LogPracticeModal({ skill, onLog, onClose }: {
  skill: PlayerSkill;
  onLog: (id: string, newScore: number, note: string) => void;
  onClose: () => void;
}) {
  const [note, setNote]       = useState("");
  const [delta, setDelta]     = useState(0);
  const newScore = Math.min(10, Math.max(1, parseFloat((skill.currentScore + delta).toFixed(1))));
  const meta = DOMAIN_META[skill.domain];

  const OPTIONS = [
    { label: "Logged — no change", d: 0,   color: "border-[var(--border)] text-[var(--muted)] hover:border-[var(--border)] hover:text-[var(--text)]" },
    { label: "+0.5  Small gain",   d: 0.5, color: "border-[var(--border-2)] text-[var(--text)] hover:border-[var(--border-2)]" },
    { label: "+1.0  Big gain",     d: 1.0, color: "border-[var(--border-2)] text-[var(--text)] hover:border-[var(--border-2)]" },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-md shadow-2xl nx-slide-up" onClick={e => e.stopPropagation()}>
        <div className={cn("flex items-center justify-between px-5 py-4 border-b border-[var(--border)]", meta.bg)}>
          <div className="flex items-center gap-2">
            <Zap className={cn("w-4 h-4", meta.text)} />
            <p className={cn("text-sm font-bold", meta.text)}>Log Practice</p>
          </div>
          <button onClick={onClose} className="text-[var(--faint)] hover:text-[var(--text)] transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <p className="text-base font-bold text-[var(--text)]">{skill.name}</p>
            <p className="text-xs text-[var(--faint)] mt-0.5">Current: {skill.currentScore.toFixed(1)}/10 · {meta.label}</p>
          </div>

          <FormField label="What did you work on?">
            <textarea
              className={cn(inputCls, "resize-none")} rows={3}
              placeholder="Describe the session, drill, or practice..."
              value={note} onChange={e => setNote(e.target.value)}
              autoFocus
            />
          </FormField>

          <FormField label="Score Update">
            <div className="space-y-2">
              {OPTIONS.map(opt => (
                <button key={opt.d} onClick={() => setDelta(opt.d)}
                  className={cn("w-full flex items-center justify-between px-4 py-2.5 rounded-xl border text-sm font-medium transition-all",
                    delta === opt.d ? opt.color.replace("hover:", "") + " ring-1 ring-current/30" : opt.color
                  )}>
                  <span>{opt.label}</span>
                  {delta === opt.d && <CheckCircle2 className="w-4 h-4" />}
                </button>
              ))}
            </div>
          </FormField>

          {delta > 0 && (
            <div className="flex items-center justify-between bg-[var(--chip)] border border-[var(--border-2)] rounded-xl px-4 py-2.5">
              <span className="text-xs text-[var(--faint)]">New score</span>
              <span className="text-sm font-bold text-[var(--text)]">{skill.currentScore.toFixed(1)} → {newScore.toFixed(1)}</span>
            </div>
          )}
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-[var(--faint)] hover:text-[var(--text)] transition-colors border border-[var(--border)] rounded-xl">Cancel</button>
          <button
            onClick={() => { onLog(skill.id, newScore, note); onClose(); }}
            className="flex-1 py-2 text-sm font-semibold text-[var(--bg)] bg-[var(--text)] hover:bg-[var(--text-hover)] rounded-xl transition-colors"
          >
            Log Session
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add Skill Modal ────────────────────────────────────────────────────────────

function AddSkillModal({ domain, onAdd, onClose }: {
  domain: DomainKey;
  onAdd: (skill: PlayerSkill) => void;
  onClose: () => void;
}) {
  const meta = DOMAIN_META[domain];
  const [form, setForm] = useState({ name: "", subdomain: "", currentScore: 5, targetScore: 8, weight: 5, nextAction: "" });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm(f => ({ ...f, [k]: v }));

  function save() {
    if (!form.name.trim()) return;
    onAdd({
      id: uid(), domain, type: "skill",
      name: form.name.trim(), subdomain: form.subdomain.trim() || "General",
      currentScore: form.currentScore, targetScore: form.targetScore, weight: form.weight,
      nextAction: form.nextAction || undefined,
      lastReviewed: TODAY, reviewFrequency: "monthly", history: [],
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-md shadow-2xl nx-slide-up" onClick={e => e.stopPropagation()}>
        <div className={cn("flex items-center justify-between px-5 py-4 border-b border-[var(--border)]", meta.bg)}>
          <div className="flex items-center gap-2">
            <meta.Icon className="w-4 h-4 text-[var(--text)] shrink-0" strokeWidth={1.9} />
            <p className={cn("text-sm font-bold", meta.text)}>Add Skill to {meta.label}</p>
          </div>
          <button onClick={onClose} className="text-[var(--faint)] hover:text-[var(--text)] transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <FormField label="Skill Name">
            <input autoFocus className={inputCls} placeholder="e.g. Deep Work" value={form.name} onChange={e => set("name", e.target.value)} onKeyDown={e => e.key === "Enter" && save()} />
          </FormField>
          <FormField label="Subdomain / Category">
            <input className={inputCls} placeholder="e.g. Focus, Strength, Execution..." value={form.subdomain} onChange={e => set("subdomain", e.target.value)} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={`Current Score: ${form.currentScore}/10`}>
              <input type="range" min="1" max="10" step="0.5" value={form.currentScore} onChange={e => set("currentScore", parseFloat(e.target.value))} className="w-full accent-indigo-500 cursor-pointer" />
            </FormField>
            <FormField label={`Target Score: ${form.targetScore}/10`}>
              <input type="range" min="1" max="10" step="0.5" value={form.targetScore} onChange={e => set("targetScore", parseFloat(e.target.value))} className="w-full accent-indigo-500 cursor-pointer" />
            </FormField>
          </div>
          <FormField label={`Importance: ${form.weight}/10`}>
            <input type="range" min="1" max="10" step="1" value={form.weight} onChange={e => set("weight", parseInt(e.target.value))} className="w-full accent-violet-500 cursor-pointer" />
          </FormField>
          <FormField label="Next Action (optional)">
            <input className={inputCls} placeholder="The first specific step" value={form.nextAction} onChange={e => set("nextAction", e.target.value)} />
          </FormField>
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-[var(--faint)] hover:text-[var(--text)] border border-[var(--border)] rounded-xl transition-colors">Cancel</button>
          <button onClick={save} className="flex-1 py-2 text-sm font-semibold text-[var(--bg)] bg-[var(--text)] hover:bg-[var(--text-hover)] rounded-xl transition-colors">Add Skill</button>
        </div>
      </div>
    </div>
  );
}

// ── Calc Panel ─────────────────────────────────────────────────────────────────

function CalcPanel({ skills, onClose }: { skills: PlayerSkill[]; onClose: () => void }) {
  const overall = calcOverallRating(skills);
  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 max-w-lg w-full shadow-2xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-bold text-[var(--text)]">Rating Calculation</h2>
            <p className="text-xs text-[var(--faint)] mt-0.5">How your overall score is calculated</p>
          </div>
          <button onClick={onClose} className="text-[var(--faint)] hover:text-[var(--text)] transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          {(Object.keys(DOMAIN_META) as DomainKey[]).map(domain => {
            const meta = DOMAIN_META[domain];
            const weight = DOMAIN_WEIGHTS[domain];
            const score = calcDomainScore(skills, domain);
            return (
              <div key={domain} className={cn("rounded-xl p-3 border", meta.bg, meta.border)}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <meta.Icon className="w-4 h-4 text-[var(--text)] shrink-0" strokeWidth={1.9} />
                    <span className={cn("text-sm font-bold", meta.text)}>{meta.label}</span>
                    <span className="text-[10px] text-[var(--faint)]">({weight}% weight)</span>
                  </div>
                  <div>
                    <span className="text-sm font-bold text-[var(--text)]">{score}/100</span>
                    <span className="text-xs text-[var(--faint)] ml-2">→ +{((score * weight) / 100).toFixed(1)}</span>
                  </div>
                </div>
                <ScoreBar score={score} max={100} color={meta.bar} />
                <p className="text-[10px] text-[var(--faint)] mt-1.5">{skills.filter(s => s.domain === domain).length} skills · weighted average × {weight}%</p>
              </div>
            );
          })}
        </div>
        <div className="mt-4 pt-4 border-t border-[var(--border)] flex items-center justify-between">
          <p className="text-xs text-[var(--faint)]">Overall = Σ(domain score × weight) ÷ 100</p>
          <p className="text-2xl font-extrabold text-[var(--text)] tabular">{overall}</p>
        </div>
      </div>
    </div>
  );
}

// ── Overall Rating Card ────────────────────────────────────────────────────────

function OverallCard({ rating, skills, onInfo }: { rating: number; skills: PlayerSkill[]; onInfo: () => void }) {
  const tier = getTier(rating);
  const domainScores = getAllDomainScores(skills);
  const radarData = (Object.keys(DOMAIN_META) as DomainKey[]).map(d => ({
    domain: DOMAIN_META[d].label, score: domainScores[d], fullMark: 100,
  }));

  return (
    <div className="grid md:grid-cols-[264px_1fr] gap-4">
      {/* OVR card — always dark, even in light mode (inline bg bypasses CSS selectors) */}
      <div className="relative rounded-2xl overflow-hidden"
        style={{
          background: "#0a0a0a",
          boxShadow: `0 0 48px ${tier.glow}, 0 0 0 1px ${tier.color}22`,
        }}>
        <div className="absolute inset-0" style={{ background: `linear-gradient(145deg, ${tier.color}12 0%, transparent 65%)` }} />
        <div className="relative flex flex-col items-center justify-center py-8 px-6 text-center gap-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.28em]" style={{ color: "#737373" }}>Personal Rating</p>
          {/* Solid white number with a tier-coloured glow — fully cross-browser */}
          <span style={{
            display: "block",
            fontSize: "clamp(80px, 12vw, 108px)",
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: "-0.04em",
            color: "#ffffff",
            textShadow: "0 0 40px rgba(255,255,255,0.18)",
          }}>
            {rating}
          </span>
          <span className="px-4 py-1 rounded-full text-[11px] font-bold tracking-[0.22em]"
            style={{ background: "rgba(255,255,255,0.08)", color: "#ffffff", border: "1px solid rgba(255,255,255,0.16)" }}>
            {tier.label}
          </span>
          <p className="text-[11px] font-medium" style={{ color: "#737373" }}>{skills.length} skills · {Object.keys(DOMAIN_META).length} domains</p>
          <button onClick={onInfo} className="absolute top-3 right-3 p-1.5 transition-colors" style={{ color: "#737373" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#0a0a0a")}
            onMouseLeave={e => (e.currentTarget.style.color = "#737373")}
          ><Info className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {/* Domain breakdown */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 flex flex-col justify-center gap-3">
          {(Object.keys(DOMAIN_META) as DomainKey[]).map(d => {
            const meta = DOMAIN_META[d];
            const score = domainScores[d];
            return (
              <div key={d} className="flex items-center gap-3">
                <span className={cn("text-[11px] font-bold w-[82px] shrink-0", meta.text)}>{meta.label}</span>
                <div className="flex-1"><ScoreBar score={score} max={100} color={meta.bar} /></div>
                <span className="text-[13px] font-bold text-[var(--text)] tabular w-7 text-right">{score}</span>
                <span className="text-[9px] text-[var(--faint)] w-8 text-right shrink-0">{DOMAIN_WEIGHTS[d]}%</span>
              </div>
            );
          })}
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 flex items-center justify-center" style={{ minWidth: 180 }}>
          <ResponsiveContainer width={180} height={180}>
            <RadarChart cx="50%" cy="50%" outerRadius="72%" data={radarData}>
              <PolarGrid stroke="#e5e5e5" />
              <PolarAngleAxis dataKey="domain" tick={{ fill: "#737373", fontSize: 9, fontWeight: 700, fontFamily: "var(--font-sans)" }} />
              <Radar dataKey="score" stroke="#0a0a0a" fill="#0a0a0a" fillOpacity={0.18} strokeWidth={1.5} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ── Domain grid card ───────────────────────────────────────────────────────────

function DomainCard({ domain, score, skillCount, selected, onClick }: {
  domain: DomainKey; score: number; skillCount: number; selected: boolean; onClick: () => void;
}) {
  const meta = DOMAIN_META[domain];
  const tier = getTier(score);
  const hue = DOMAIN_HUE[domain];
  return (
    <button onClick={onClick} className="text-left rounded-2xl p-4 border transition-all duration-200 relative overflow-hidden"
      style={{ borderColor: selected ? `color-mix(in srgb, ${hue} 45%, transparent)` : "var(--border)", background: selected ? `color-mix(in srgb, ${hue} 10%, var(--surface))` : "var(--surface)" }}>
      <div className="absolute top-0 left-4 right-4 h-[2px] rounded-full" style={{ background: hue, opacity: selected ? 1 : 0.55 }} />
      <div className="flex items-start justify-between mb-3 mt-0.5">
        <div>
          <meta.Icon className="w-5 h-5 mb-1.5" strokeWidth={1.9} style={{ color: hue }} />
          <p className="text-sm font-bold text-[var(--text)]">{meta.label}</p>
          <p className="text-[10px] text-[var(--faint)]">{DOMAIN_WEIGHTS[domain]}% · {skillCount} skills</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-extrabold tabular leading-none" style={{ color: hue }}>{score}</p>
          <p className="text-[10px] mt-0.5" style={{ color: tier.color }}>{tier.label}</p>
        </div>
      </div>
      <ScoreBar score={score} max={100} hue={hue} />
    </button>
  );
}

// ── Skill Row ──────────────────────────────────────────────────────────────────

function SkillRow({ skill, onEdit, onLog }: {
  skill: PlayerSkill;
  onEdit: (skill: PlayerSkill) => void;
  onLog: (skill: PlayerSkill) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const trend = getSkillTrend(skill);
  const meta  = DOMAIN_META[skill.domain];

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden transition-all">
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[var(--chip)] transition-colors group"
        onClick={() => setExpanded(v => !v)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-sm font-semibold text-[var(--text)] truncate">{skill.name}</span>
            <WeightBadge weight={skill.weight} />
            <TrendIcon delta={trend} />
          </div>
          <div className="flex items-center gap-2.5">
            <ScoreBar score={skill.currentScore} max={10} color={meta.bar} className="flex-1" />
            <span className="text-[10px] text-[var(--faint)] shrink-0 tabular">→ {skill.targetScore}/10</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[15px] font-extrabold text-[var(--text)] tabular">{skill.currentScore.toFixed(1)}</p>
          <p className="text-[9px] text-[var(--faint)]">/10</p>
        </div>
        {/* Action buttons - visible on hover */}
        <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
          <button onClick={() => onLog(skill)} title="Log practice session"
            className="p-1.5 rounded-lg bg-[var(--chip)] text-[var(--text)] hover:bg-[var(--chip-2)] transition-colors">
            <Zap className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onEdit(skill)} title="Edit skill"
            className="p-1.5 rounded-lg bg-[var(--chip)] text-[var(--faint)] hover:text-[var(--text)] hover:bg-[var(--chip)] transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="text-[var(--faint)] shrink-0">
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-[var(--border)] pt-3 space-y-3">
          {/* Score vs target */}
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-[var(--faint)]">
              <span>Current: {skill.currentScore.toFixed(1)}</span>
              <span>Target: {skill.targetScore.toFixed(1)} · gap: +{(skill.targetScore - skill.currentScore).toFixed(1)}</span>
            </div>
            <div className="h-2 bg-[var(--chip)] rounded-full overflow-hidden relative">
              <div className={cn("h-full rounded-full transition-all", meta.bar)} style={{ width: `${(skill.currentScore / 10) * 100}%` }} />
              <div className="absolute top-0 bottom-0 w-0.5 bg-[var(--border)]" style={{ left: `${(skill.targetScore / 10) * 100}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            {skill.lastReviewed && <div><span className="text-[var(--faint)]">Reviewed </span><span className="text-[var(--muted)]">{skill.lastReviewed}</span></div>}
            {skill.testMethod   && <div><span className="text-[var(--faint)]">Method </span><span className="text-[var(--muted)]">{skill.testMethod}</span></div>}
            {skill.primaryMetric && <div className="col-span-2"><span className="text-[var(--faint)]">Metric </span><span className="text-[var(--muted)]">{skill.primaryMetric}</span></div>}
          </div>

          {skill.bottleneck && (
            <div className="bg-[var(--chip)] border border-[var(--border-2)] rounded-lg px-3 py-2">
              <p className="text-[10px] text-[var(--text)] font-bold uppercase tracking-wider mb-0.5">Bottleneck</p>
              <p className="text-xs text-[var(--text)]">{skill.bottleneck}</p>
            </div>
          )}
          {skill.nextAction && (
            <div className="bg-[var(--chip)] border border-[var(--border-2)] rounded-lg px-3 py-2">
              <p className="text-[10px] text-[var(--text)] font-bold uppercase tracking-wider mb-0.5">Next Action</p>
              <p className="text-xs text-[var(--text)]">{skill.nextAction}</p>
            </div>
          )}
          {skill.notes && (
            <div className="bg-[var(--chip)] border border-[var(--border)] rounded-lg px-3 py-2">
              <p className="text-[10px] text-[var(--faint)] font-bold uppercase tracking-wider mb-0.5">Notes</p>
              <p className="text-xs text-[var(--muted)]">{skill.notes}</p>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={() => onLog(skill)} className="flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold text-[var(--text)] border border-[var(--border-2)] rounded-lg hover:bg-[var(--chip-2)] transition-colors">
              <Zap className="w-3.5 h-3.5" /> Log Practice
            </button>
            <button onClick={() => onEdit(skill)} className="flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold text-[var(--muted)] border border-[var(--border)] rounded-lg hover:text-[var(--text)] hover:bg-[var(--chip)] transition-colors">
              <Pencil className="w-3.5 h-3.5" /> Edit Skill
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Goals (daily / weekly / monthly / yearly) ────────────────────────────────────

const GOAL_PERIODS: { key: GoalPeriod; label: string; Icon: LucideIcon; hint: string }[] = [
  { key: "daily",   label: "Daily",   Icon: Sun,           hint: "Today's focus" },
  { key: "weekly",  label: "Weekly",  Icon: CalendarDays,  hint: "This week" },
  { key: "monthly", label: "Monthly", Icon: CalendarRange, hint: "This month" },
  { key: "yearly",  label: "Yearly",  Icon: Flag,          hint: "This year" },
];

function GoalColumn({ period, label, Icon, hint, goals, onAdd, onToggle, onDelete }: {
  period: GoalPeriod; label: string; Icon: LucideIcon; hint: string;
  goals: Goal[];
  onAdd: (period: GoalPeriod, text: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [text, setText] = useState("");
  const items = goals.filter(g => g.period === period);
  const done  = items.filter(g => g.done).length;
  const pct   = items.length ? Math.round((done / items.length) * 100) : 0;

  function submit() {
    const t = text.trim();
    if (!t) return;
    onAdd(period, t);
    setText("");
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 flex flex-col">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--chip)] border border-[var(--border)] shrink-0">
          <Icon className="w-4 h-4 text-[var(--text)]" strokeWidth={1.9} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--text)] leading-tight">{label}</p>
          <p className="text-[10px] text-[var(--faint)]">{hint}</p>
        </div>
        <span className="ml-auto text-[11px] font-bold text-[var(--faint)] tabular shrink-0">{done}/{items.length}</span>
      </div>

      <div className="h-1.5 bg-[var(--chip)] rounded-full overflow-hidden mb-3">
        <div className="h-full bg-[var(--text)] rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>

      <div className="space-y-1 mb-3 flex-1">
        {items.length === 0 ? (
          <p className="text-[11px] text-[var(--faint)] py-3 text-center">No goals yet.</p>
        ) : (
          items.map(g => (
            <div key={g.id} className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--chip)] transition-colors">
              <button onClick={() => onToggle(g.id)}
                className={cn("flex items-center justify-center w-4 h-4 rounded-[5px] border shrink-0 transition-colors",
                  g.done ? "bg-[var(--text)] border-[var(--text)]" : "border-[var(--border-2)] hover:border-[var(--text)]")}>
                {g.done && <Check className="w-3 h-3 text-[var(--bg)]" strokeWidth={3} />}
              </button>
              <span className={cn("flex-1 text-[12.5px] leading-snug", g.done ? "text-[var(--faint)] line-through" : "text-[var(--text)]")}>{g.text}</span>
              <button onClick={() => onDelete(g.id)}
                className="opacity-0 group-hover:opacity-100 text-[var(--faint)] hover:text-[var(--text)] transition-all shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submit()}
          placeholder={`Add ${label.toLowerCase()} goal…`}
          className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-[12.5px] text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)] transition-colors"
        />
        <button onClick={submit} className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--text)] text-[var(--bg)] hover:bg-[var(--text-hover)] transition-colors shrink-0">
          <Plus className="w-4 h-4" strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}

function GoalsSection({ goals, onAdd, onToggle, onDelete }: {
  goals: Goal[];
  onAdd: (period: GoalPeriod, text: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const total = goals.length;
  const done  = goals.filter(g => g.done).length;
  return (
    <div className="mt-8">
      <div className="flex items-center gap-2.5 mb-3">
        <Target className="w-4 h-4 text-[var(--text)]" />
        <p className="text-[10px] font-bold text-[var(--faint)] uppercase tracking-[0.18em]">Goals</p>
        <div className="flex-1 h-px bg-[var(--chip)]" />
        {total > 0 && <span className="text-[11px] text-[var(--faint)] tabular">{done}/{total} done</span>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {GOAL_PERIODS.map(p => (
          <GoalColumn key={p.key} period={p.key} label={p.label} Icon={p.Icon} hint={p.hint}
            goals={goals} onAdd={onAdd} onToggle={onToggle} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

// ── Body & Health ───────────────────────────────────────────────────────────────

const bmiCategory = (bmi: number) =>
  bmi < 18.5 ? { label: "Underweight", color: "var(--c-amber)" }
  : bmi < 25 ? { label: "Healthy", color: "var(--c-emerald)" }
  : bmi < 30 ? { label: "Overweight", color: "var(--c-amber)" }
  : { label: "Obese", color: "var(--c-rose)" };

const yearsSince = (iso: string) => {
  const b = new Date(iso).getTime();
  if (Number.isNaN(b)) return null;
  return (Date.now() - b) / (365.25 * 86400000);
};

// Fun, transparent "biological age" estimate: chronological age nudged by BMI,
// body-fat, sleep quality, workout frequency and habit consistency.
function computeBioAge(chrono: number, bmi: number | null, bodyFat: number | null, avgSleep: number | null, workouts30: number, habits7: number) {
  let bio = chrono;
  const factors: { label: string; years: number }[] = [];
  if (bmi != null) {
    const d = bmi > 25 ? (bmi - 25) * 0.4 : bmi < 18.5 ? (18.5 - bmi) * 0.4 : -0.6;
    bio += d; factors.push({ label: "BMI", years: d });
  }
  if (bodyFat != null) {
    const d = bodyFat > 20 ? (bodyFat - 20) * 0.22 : bodyFat < 8 ? (8 - bodyFat) * 0.22 : -0.5;
    bio += d; factors.push({ label: "Body fat", years: d });
  }
  if (avgSleep != null) {
    const d = (72 - avgSleep) * 0.05;
    bio += d; factors.push({ label: "Sleep", years: d });
  }
  const wd = -Math.min(workouts30, 12) * 0.25;
  if (workouts30 > 0) { bio += wd; factors.push({ label: "Training", years: wd }); }
  const hd = -Math.min(habits7, 14) * 0.1;
  if (habits7 > 0) { bio += hd; factors.push({ label: "Habits", years: hd }); }
  bio = Math.max(chrono - 12, Math.min(chrono + 15, bio));
  return { bio, factors };
}

// Current streak of consecutive calendar days (ending today/yesterday) meeting a threshold.
function sleepStreak(log: { date: string; score: number }[], threshold = 80): number {
  const byDate = new Map(log.map((e) => [e.date, e.score]));
  let streak = 0;
  const d = new Date();
  // allow the streak to be "current" if today isn't logged yet but yesterday is
  const todayStr = d.toISOString().slice(0, 10);
  if (!byDate.has(todayStr)) d.setDate(d.getDate() - 1);
  for (;;) {
    const key = d.toISOString().slice(0, 10);
    const v = byDate.get(key);
    if (v != null && v >= threshold) { streak++; d.setDate(d.getDate() - 1); } else break;
  }
  return streak;
}

function MiniSpark({ values, color = "var(--text)" }: { values: number[]; color?: string }) {
  if (values.length < 2) return <div className="h-8" />;
  const data = values.map((v) => ({ v }));
  return (
    <ResponsiveContainer width="100%" height={32}>
      <AreaChart data={data} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={color} fillOpacity={0.1} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// Larger trend line for the expandable "Trends" view.
function TrendChart({ data, unit }: { data: { date: string; v: number }[]; unit: string }) {
  if (data.length < 2) return <div className="flex h-[200px] items-center justify-center text-sm text-[var(--faint)]">Log at least 2 entries to see a trend.</div>;
  const pts = data.map((d) => ({ date: d.date.slice(5), v: d.v }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={pts} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <XAxis dataKey="date" tick={{ fill: "#737373", fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
        <YAxis domain={["auto", "auto"]} tick={{ fill: "#737373", fontSize: 10 }} tickLine={false} axisLine={false} width={40} />
        <Tooltip contentStyle={{ backgroundColor: "#0a0a0a", border: "1px solid #262626", borderRadius: "8px", color: "#fff", fontSize: "12px" }} formatter={(v: unknown) => [`${Number(v).toFixed(1)}${unit}`, ""]} />
        <Line type="monotone" dataKey="v" stroke="var(--text)" strokeWidth={2} dot={{ r: 2 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Deurenberg body-fat estimate from BMI + age (male). A rough estimate for tracking.
function estimateBodyFat(bmi: number, age: number, male = true): number {
  return Math.max(3, Math.min(60, 1.2 * bmi + 0.23 * age - 10.8 * (male ? 1 : 0) - 5.4));
}
const parseHM = (s: string): number | null => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ""); return m ? (+m[1]) * 60 + (+m[2]) : null; };
// Hours between bedtime and wake ("HH:MM"), handling crossing midnight.
function sleepHours(bedtime: string, wake: string): number | null {
  const b = parseHM(bedtime), w = parseHM(wake);
  if (b == null || w == null) return null;
  let h = (w - b) / 60; if (h <= 0) h += 24;
  return Math.round(h * 10) / 10;
}
// Score 0-100 peaking at ~8h; undersleep penalised more than oversleep.
function sleepScoreFromHours(h: number): number {
  const d = h < 8 ? (8 - h) * 14 : (h - 8) * 8;
  return Math.max(0, Math.min(100, Math.round(100 - d)));
}

type TrendMetric = "weight" | "fat" | "sleep";

function BodyHealthSection({ data, mutate }: { data: BridgeData; mutate: (fn: (d: BridgeData) => BridgeData) => void }) {
  const bm: BodyMetrics = data.bodyMetrics ?? { weightLog: [], sleepLog: [] };
  const today = new Date().toISOString().slice(0, 10);
  const [wInput, setWInput] = useState("");
  const [bedInput, setBedInput] = useState("");
  const [wakeInput, setWakeInput] = useState("");
  const [editHeight, setEditHeight] = useState(false);
  const [hInput, setHInput] = useState(bm.heightCm ? String(bm.heightCm) : "");
  const [editTarget, setEditTarget] = useState(false);
  const [tInput, setTInput] = useState(bm.targetWeightKg ? String(bm.targetWeightKg) : "");
  const [uploading, setUploading] = useState(false);
  const [trends, setTrends] = useState<TrendMetric | null>(null);
  const [lightbox, setLightbox] = useState<ProgressPhoto | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  const setBM = (patch: Partial<BodyMetrics>) =>
    mutate((d) => ({ ...d, bodyMetrics: { ...(d.bodyMetrics ?? { weightLog: [], sleepLog: [] }), ...patch } }));

  // Personal app — Lucas's birth date (25 May 2010) is fixed.
  const chrono = yearsSince("2010-05-25")!;
  const heightM = bm.heightCm ? bm.heightCm / 100 : null;
  const bmiOf = (kg: number) => (heightM ? kg / (heightM * heightM) : null);

  const weightLog = [...bm.weightLog].sort((a, b) => a.date.localeCompare(b.date));
  const latestW = weightLog.at(-1) ?? null;
  const prevW = weightLog.at(-2) ?? null;
  const wDelta = latestW && prevW ? latestW.kg - prevW.kg : null;
  const bmi = latestW ? bmiOf(latestW.kg) : null;
  // Body fat is CALCULATED from BMI + age (no manual entry).
  const estFat = bmi != null ? estimateBodyFat(bmi, chrono) : null;

  const sleepLog = [...bm.sleepLog].sort((a, b) => a.date.localeCompare(b.date));
  const lastSleep = sleepLog.at(-1) ?? null;
  const last7Sleep = sleepLog.slice(-7);
  const withHours = last7Sleep.filter((s) => s.hours != null);
  const avgHours = withHours.length ? withHours.reduce((s, e) => s + (e.hours ?? 0), 0) / withHours.length : null;
  const avgScore = last7Sleep.length ? last7Sleep.reduce((s, e) => s + e.score, 0) / last7Sleep.length : null;
  const streak = sleepStreak(bm.sleepLog);

  const photos = [...(bm.photos ?? [])].sort((a, b) => b.date.localeCompare(a.date));

  const d30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const d7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const workouts30 = (data.workouts ?? []).filter((w) => (w.date ?? "") >= d30).length;
  const habits7 = (data.habitLogs ?? []).filter((l) => l.completed && l.date >= d7).length;
  const bioResult = computeBioAge(chrono, bmi, estFat, avgScore, workouts30, habits7);

  // weight goal progress (start = first logged weight)
  const startW = weightLog[0]?.kg ?? null;
  const target = bm.targetWeightKg ?? null;
  const goalPct = latestW && target && startW && startW !== target
    ? Math.max(0, Math.min(100, ((startW - latestW.kg) / (startW - target)) * 100)) : null;

  const logWeight = () => {
    const kg = parseFloat(wInput); if (!kg || kg <= 0) return;
    setBM({ weightLog: [...bm.weightLog.filter((w) => w.date !== today), { date: today, kg }] });
    setWInput("");
  };
  const logSleep = () => {
    const hours = sleepHours(bedInput, wakeInput);
    if (hours == null) return;
    const score = sleepScoreFromHours(hours);
    setBM({ sleepLog: [...bm.sleepLog.filter((s) => s.date !== today), { date: today, score, hours, bedtime: bedInput, wake: wakeInput }] });
    setBedInput(""); setWakeInput("");
  };
  const saveHeight = () => { const cm = parseFloat(hInput); setBM({ heightCm: cm > 0 ? cm : undefined }); setEditHeight(false); };
  const saveTarget = () => { const kg = parseFloat(tInput); setBM({ targetWeightKg: kg > 0 ? kg : undefined }); setEditTarget(false); };

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    const results = await Promise.all(Array.from(files).filter((f) => f.type.startsWith("image/")).map((f) => processFile(f).catch(() => null)));
    const newPhotos: ProgressPhoto[] = results.filter((r): r is NonNullable<typeof r> => !!r && !!r.url).map((r) => ({ id: uid(), date: today, url: r.url! }));
    if (newPhotos.length) setBM({ photos: [...(bm.photos ?? []), ...newPhotos] });
    setUploading(false);
    if (photoRef.current) photoRef.current.value = "";
  };
  const deletePhoto = (id: string) => setBM({ photos: (bm.photos ?? []).filter((p) => p.id !== id) });

  const inputCls = "w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)]";

  const trendData = trends === "weight" ? weightLog.map((w) => ({ date: w.date, v: w.kg }))
    : trends === "fat" ? weightLog.map((w) => { const b = bmiOf(w.kg); return b != null ? { date: w.date, v: estimateBodyFat(b, chrono) } : null; }).filter((x): x is { date: string; v: number } => !!x)
    : sleepLog.filter((s) => s.hours != null).map((s) => ({ date: s.date, v: s.hours! }));

  return (
    <div className="mt-8">
      <input ref={photoRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addPhotos(e.target.files)} />
      <div className="flex items-center gap-2.5 mb-3">
        <HeartPulse className="w-4 h-4 text-[var(--c-rose)]" strokeWidth={2} />
        <p className="text-[10px] font-bold text-[var(--faint)] uppercase tracking-[0.18em]">Body &amp; Health</p>
        <div className="flex-1 h-px bg-[var(--chip)]" />
        <div className="flex gap-1">
          {(["weight", "fat", "sleep"] as TrendMetric[]).map((m) => (
            <button key={m} onClick={() => setTrends((t) => t === m ? null : m)}
              className={cn("flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold capitalize transition-colors",
                trends === m ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]")}>
              <LineChartIcon className="w-3 h-3" /> {m === "fat" ? "Body fat" : m}
            </button>
          ))}
        </div>
      </div>

      {/* Trends chart (expandable) */}
      {trends && (
        <div className="mb-3 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--faint)] mb-2">{trends === "fat" ? "Body fat" : trends === "sleep" ? "Sleep hours" : trends} trend{trends === "sleep" && avgHours != null ? ` · avg ${avgHours.toFixed(1)}h` : ""}</p>
          <TrendChart data={trendData} unit={trends === "weight" ? " kg" : trends === "fat" ? "%" : " h"} />
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        {/* Weight & Height */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="p-1.5 rounded-lg" style={{ background: "color-mix(in srgb, var(--c-cyan) 15%, transparent)", color: "var(--c-cyan)" }}><Scale className="w-4 h-4" /></span>
            <span className="text-[11px] text-[var(--faint)] uppercase tracking-[0.15em] font-semibold">Weight &amp; Body</span>
          </div>
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-2xl font-extrabold text-[var(--text)] tabular leading-none">{latestW ? `${latestW.kg.toFixed(1)}` : "—"}<span className="text-sm font-semibold text-[var(--faint)]"> kg</span></p>
              {wDelta != null && <p className="text-[11px] font-medium mt-1" style={{ color: wDelta <= 0 ? "var(--c-emerald)" : "var(--c-amber)" }}>{wDelta > 0 ? "+" : ""}{wDelta.toFixed(1)} kg</p>}
            </div>
            <div className="text-right space-y-1">
              {bmi != null && (() => { const c = bmiCategory(bmi); return (<div><p className="text-base font-bold tabular leading-none" style={{ color: c.color }}>{bmi.toFixed(1)}</p><p className="text-[9px] font-semibold" style={{ color: c.color }}>{c.label} · BMI</p></div>); })()}
              {estFat != null && <div><p className="text-base font-bold tabular leading-none text-[var(--c-amber)]">{estFat.toFixed(1)}%</p><p className="text-[9px] font-semibold text-[var(--faint)]">est. body fat</p></div>}
            </div>
          </div>
          <div className="my-2"><MiniSpark values={weightLog.slice(-14).map((w) => w.kg)} color="var(--c-cyan)" /></div>

          {/* weight goal */}
          <div className="flex items-center gap-1.5 mb-1.5 text-xs">
            <Target className="w-3.5 h-3.5 text-[var(--faint)] shrink-0" />
            {editTarget ? (
              <><input value={tInput} onChange={(e) => setTInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveTarget()} placeholder="kg" className="w-16 bg-[var(--surface-2)] border border-[var(--border)] rounded px-1.5 py-0.5 text-xs text-[var(--text)] focus:outline-none" autoFocus /><button onClick={saveTarget} className="text-xs font-semibold text-[var(--accent)]">Save</button></>
            ) : (
              <button onClick={() => setEditTarget(true)} className="text-[var(--muted)] hover:text-[var(--text)]">{target ? `Goal ${target} kg${latestW ? ` · ${Math.abs(latestW.kg - target).toFixed(1)} to go` : ""}` : "Set goal weight"}</button>
            )}
          </div>
          {goalPct != null && <div className="w-full bg-[var(--chip)] rounded-full h-1 mb-2 overflow-hidden"><div className="h-1 rounded-full" style={{ width: `${goalPct}%`, background: "var(--c-emerald)" }} /></div>}

          <div className="flex items-center gap-1.5 mb-2 text-xs">
            <Ruler className="w-3.5 h-3.5 text-[var(--faint)] shrink-0" />
            {editHeight ? (
              <><input value={hInput} onChange={(e) => setHInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveHeight()} placeholder="cm" className="w-16 bg-[var(--surface-2)] border border-[var(--border)] rounded px-1.5 py-0.5 text-xs text-[var(--text)] focus:outline-none" autoFocus /><button onClick={saveHeight} className="text-xs font-semibold text-[var(--accent)]">Save</button></>
            ) : (
              <button onClick={() => setEditHeight(true)} className="text-[var(--muted)] hover:text-[var(--text)]">{bm.heightCm ? `${bm.heightCm} cm` : "Set height"}</button>
            )}
          </div>
          <div className="flex gap-1.5">
            <input value={wInput} onChange={(e) => setWInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && logWeight()} inputMode="decimal" placeholder="Log today's weight (kg)" className={inputCls} />
            <button onClick={logWeight} className="shrink-0 px-2.5 rounded-lg bg-[var(--text)] text-[var(--bg)] hover:bg-[var(--text-hover)] transition-colors"><Plus className="w-4 h-4" /></button>
          </div>
          <p className="text-[10px] text-[var(--faint)] mt-1.5">BMI &amp; body-fat % are calculated from your height, weight &amp; age.</p>
        </div>

        {/* Sleep */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="p-1.5 rounded-lg" style={{ background: "color-mix(in srgb, var(--c-indigo) 15%, transparent)", color: "var(--c-indigo)" }}><Moon className="w-4 h-4" /></span>
            <span className="text-[11px] text-[var(--faint)] uppercase tracking-[0.15em] font-semibold">Sleep Score</span>
            {streak > 0 && <span className="ml-auto flex items-center gap-0.5 text-[11px] font-bold text-[var(--c-amber)]"><Flame className="w-3.5 h-3.5" />{streak}d</span>}
          </div>
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-2xl font-extrabold text-[var(--text)] tabular leading-none">{lastSleep?.hours != null ? lastSleep.hours.toFixed(1) : "—"}<span className="text-sm font-semibold text-[var(--faint)]"> h</span></p>
              <p className="text-[11px] font-medium mt-1 text-[var(--c-indigo)]">{lastSleep ? `score ${lastSleep.score}/100` : "last night"}</p>
            </div>
            {avgHours != null && <div className="text-right"><p className="text-lg font-bold tabular leading-none text-[var(--c-indigo)]">{avgHours.toFixed(1)}h</p><p className="text-[10px] font-semibold text-[var(--faint)]">7-day avg</p></div>}
          </div>
          <div className="my-2"><MiniSpark values={sleepLog.slice(-14).filter((s) => s.hours != null).map((s) => s.hours!)} color="var(--c-indigo)" /></div>
          <p className="text-[11px] text-[var(--faint)] mb-2">Enter when you fell asleep &amp; woke up — hours &amp; score are calculated. {streak > 0 ? `🔥 ${streak}-night streak (80+).` : ""}</p>
          <div className="flex items-center gap-1.5">
            <input type="time" value={bedInput} onChange={(e) => setBedInput(e.target.value)} title="Fell asleep" className="flex-1 min-w-0 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--border-2)]" />
            <span className="text-[var(--faint)] text-xs shrink-0">→</span>
            <input type="time" value={wakeInput} onChange={(e) => setWakeInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && logSleep()} title="Woke up" className="flex-1 min-w-0 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--border-2)]" />
            <button onClick={logSleep} disabled={sleepHours(bedInput, wakeInput) == null} className="shrink-0 px-2.5 py-1.5 rounded-lg bg-[var(--text)] text-[var(--bg)] hover:bg-[var(--text-hover)] disabled:opacity-40 transition-colors"><Plus className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Biological age */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="p-1.5 rounded-lg" style={{ background: "color-mix(in srgb, var(--c-emerald) 15%, transparent)", color: "var(--c-emerald)" }}><HeartPulse className="w-4 h-4" /></span>
            <span className="text-[11px] text-[var(--faint)] uppercase tracking-[0.15em] font-semibold">Biological Age</span>
          </div>
          {(() => {
            const delta = chrono - bioResult.bio;
            const younger = delta >= 0;
            return (
              <>
                <div className="flex items-end justify-between gap-2">
                  <p className="text-2xl font-extrabold tabular leading-none" style={{ color: younger ? "var(--c-emerald)" : "var(--c-rose)" }}>{bioResult.bio.toFixed(1)}<span className="text-sm font-semibold text-[var(--faint)]"> yrs</span></p>
                  <div className="text-right"><p className="text-lg font-bold tabular leading-none text-[var(--text)]">{Math.floor(chrono)}</p><p className="text-[10px] font-semibold text-[var(--faint)]">actual</p></div>
                </div>
                <p className="text-[11px] font-semibold mt-1" style={{ color: younger ? "var(--c-emerald)" : "var(--c-rose)" }}>{Math.abs(delta).toFixed(1)} yrs {younger ? "younger" : "older"} than your age</p>
                <div className="mt-2.5 space-y-1">
                  {bioResult.factors.map((f) => (
                    <div key={f.label} className="flex items-center justify-between text-[11px]">
                      <span className="text-[var(--muted)]">{f.label}</span>
                      <span className="font-semibold tabular" style={{ color: f.years <= 0 ? "var(--c-emerald)" : "var(--c-rose)" }}>{f.years > 0 ? "+" : ""}{f.years.toFixed(1)} yr</span>
                    </div>
                  ))}
                  {bioResult.factors.length === 0 && <p className="text-[11px] text-[var(--faint)]">Log weight, sleep &amp; workouts to refine this.</p>}
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* Progress photos */}
      <div className="mt-3 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="p-1.5 rounded-lg" style={{ background: "color-mix(in srgb, var(--c-pink) 15%, transparent)", color: "var(--c-pink)" }}><Camera className="w-4 h-4" /></span>
          <span className="text-[11px] text-[var(--faint)] uppercase tracking-[0.15em] font-semibold">Progress Photos</span>
          <button onClick={() => photoRef.current?.click()} disabled={uploading} className="ml-auto flex items-center gap-1.5 rounded-lg bg-[var(--text)] text-[var(--bg)] px-2.5 py-1 text-xs font-semibold hover:bg-[var(--text-hover)] disabled:opacity-50 transition-colors">
            <Plus className="w-3.5 h-3.5" /> {uploading ? "Uploading…" : "Add"}
          </button>
        </div>
        {photos.length === 0 ? (
          <p className="text-sm text-[var(--faint)]">No photos yet. Add one to track visual progress over time.</p>
        ) : (
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {photos.map((p) => (
              <div key={p.id} className="group relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.date} onClick={() => setLightbox(p)} className="h-28 w-24 rounded-xl object-cover border border-[var(--border)] cursor-pointer" loading="lazy" />
                <span className="absolute bottom-1 left-1 right-1 rounded bg-black/55 px-1 py-0.5 text-center text-[9px] font-semibold text-white">{p.date.slice(5)}</span>
                <button onClick={() => deletePhoto(p.id)} className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white opacity-0 group-hover:opacity-100 transition-opacity"><XIcon className="h-3 w-3" /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6 nx-fade" onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox.url} alt={lightbox.date} className="max-h-full max-w-full rounded-2xl object-contain nx-pop" />
          <button onClick={() => setLightbox(null)} className="absolute top-5 right-5 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"><XIcon className="h-5 w-5" /></button>
        </div>
      )}
    </div>
  );
}

// ── Weekly review (AI) ────────────────────────────────────────────────────────────

function WeeklyReview({ data, overallRating }: { data: BridgeData; overallRating: number }) {
  const [state, setState] = useState<{ loading: boolean; review?: string; error?: string }>({ loading: false });

  const generate = async () => {
    setState({ loading: true });
    const d7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const inWeek = (dt?: string | null) => !!dt && dt.slice(0, 10) >= d7;
    const stats = {
      overallRating,
      tasks: { open: data.tasks.filter((t) => !t.done).length, doneTotal: data.tasks.filter((t) => t.done).length, createdThisWeek: data.tasks.filter((t) => inWeek(t.createdAt)).length },
      habitCompletionsThisWeek: (data.habitLogs ?? []).filter((l) => l.completed && l.date >= d7).length,
      totalHabits: (data.habits ?? []).length,
      focusMinsThisWeek: (data.focusSessions ?? []).filter((s) => s.date >= d7).reduce((a, s) => a + s.durationMins, 0),
      workoutsThisWeek: (data.workouts ?? []).filter((w) => (w.date ?? "") >= d7).length,
      revenueThisWeek: (data.incomeEntries ?? []).filter((e) => e.type === "income" && e.date >= d7).reduce((a, e) => a + e.amount, 0),
      goals: { total: (data.goals ?? []).length, done: (data.goals ?? []).filter((g) => g.done).length },
      activeProjects: data.projects.filter((p) => p.status === "active").length,
    };
    try {
      const res = await fetch("/api/review/weekly", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stats }) });
      const j = await res.json();
      setState(j.ok ? { loading: false, review: j.review } : { loading: false, error: j.error || "Couldn't generate the review." });
    } catch (e) { setState({ loading: false, error: String(e) }); }
  };

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2.5 mb-3">
        <CalendarRange className="w-4 h-4 text-[var(--c-purple)]" strokeWidth={2} />
        <p className="text-[10px] font-bold text-[var(--faint)] uppercase tracking-[0.18em]">Weekly Review</p>
        <div className="flex-1 h-px bg-[var(--chip)]" />
        <button onClick={generate} disabled={state.loading} className="flex items-center gap-1.5 rounded-lg bg-[var(--text)] text-[var(--bg)] px-2.5 py-1 text-xs font-semibold hover:bg-[var(--text-hover)] disabled:opacity-50 transition-colors">
          {state.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} {state.review ? "Regenerate" : "Generate"}
        </button>
      </div>
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5">
        {state.loading ? (
          <div className="flex items-center gap-2 text-[13px] text-[var(--faint)]"><Loader2 className="w-4 h-4 animate-spin" /> Reviewing your week…</div>
        ) : state.error ? (
          <p className="text-[13px] text-[var(--faint)]">{state.error}</p>
        ) : state.review ? (
          <div className="nx-md text-[13.5px]" dangerouslySetInnerHTML={{ __html: mdToHtml(state.review) }} />
        ) : (
          <p className="text-sm text-[var(--faint)]">Generate an AI retro of your last 7 days — wins, misses, and where to focus next week.</p>
        )}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

type ViewFilter = "all" | "weakest" | "strongest" | "needs-review";

export function PlayerPage() {
  const { data, mutate, loaded } = useBridge();
  const [selectedDomain, setSelectedDomain] = useState<DomainKey | null>(null);
  const [filterView, setFilterView]         = useState<ViewFilter>("all");
  const [showCalc, setShowCalc]             = useState(false);
  const [editingSkill, setEditingSkill]     = useState<PlayerSkill | null>(null);
  const [loggingSkill, setLoggingSkill]     = useState<PlayerSkill | null>(null);
  const [showAddSkill, setShowAddSkill]     = useState(false);

  // Seed defaults if empty — but ONLY after Redis hydration has settled, so a brand-new
  // (pre-load) empty state can't seed skills and then push a near-empty blob to the cloud.
  useEffect(() => {
    if (loaded && (data.playerSkills ?? []).length === 0) {
      mutate(d => ({ ...d, playerSkills: INITIAL_SKILLS }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const skills        = data.playerSkills ?? [];
  const overallRating = useMemo(() => calcOverallRating(skills), [skills]);
  const domainScores  = useMemo(() => getAllDomainScores(skills), [skills]);
  const tier          = getTier(overallRating);
  const topDomain     = useMemo(() => getTopDomain(skills),    [skills]);
  const weakDomain    = useMemo(() => getWeakestDomain(skills),[skills]);
  const mostImproved  = useMemo(() => getMostImproved(skills), [skills]);
  const needsReview   = useMemo(() => getNeedsReview(skills),  [skills]);

  // ── Mutations ──────────────────────────────────────────────────────────────

  function updateSkill(id: string, updates: Partial<PlayerSkill>) {
    mutate(d => ({
      ...d,
      playerSkills: (d.playerSkills ?? []).map(s => s.id !== id ? s : { ...s, ...updates }),
    }));
  }

  function logPractice(id: string, newScore: number, note: string) {
    const today = new Date().toISOString().split("T")[0];
    mutate(d => ({
      ...d,
      playerSkills: (d.playerSkills ?? []).map(s => {
        if (s.id !== id) return s;
        const entry = { date: today, score: newScore, note } as { date: string; score: number; note?: string };
        const history = [...(s.history ?? []), entry].slice(-20);
        return { ...s, currentScore: newScore, lastReviewed: today, history };
      }),
    }));
  }

  function addSkill(skill: PlayerSkill) {
    mutate(d => ({ ...d, playerSkills: [...(d.playerSkills ?? []), skill] }));
  }

  function deleteSkill(id: string) {
    mutate(d => ({ ...d, playerSkills: (d.playerSkills ?? []).filter(s => s.id !== id) }));
  }

  // ── Goals ──────────────────────────────────────────────────────────────────

  const goals = data.goals ?? [];

  function addGoal(period: GoalPeriod, text: string) {
    mutate(d => ({ ...d, goals: [...(d.goals ?? []), { id: uid(), period, text, done: false, createdAt: new Date().toISOString() }] }));
  }
  function toggleGoal(id: string) {
    mutate(d => ({ ...d, goals: (d.goals ?? []).map(g => g.id === id ? { ...g, done: !g.done } : g) }));
  }
  function deleteGoal(id: string) {
    mutate(d => ({ ...d, goals: (d.goals ?? []).filter(g => g.id !== id) }));
  }

  // ── Derived for domain detail ──────────────────────────────────────────────

  const activeDomainSkills = useMemo(() => {
    if (!selectedDomain) return [];
    let ds = skills.filter(s => s.domain === selectedDomain);
    if (filterView === "weakest")       ds = [...ds].sort((a, b) => a.currentScore - b.currentScore);
    else if (filterView === "strongest") ds = [...ds].sort((a, b) => b.currentScore - a.currentScore);
    else if (filterView === "needs-review") ds = ds.filter(s => needsReview.some(nr => nr.id === s.id));
    return ds;
  }, [selectedDomain, skills, filterView, needsReview]);

  const activeSubdomains = useMemo(() =>
    selectedDomain ? getSubdomains(activeDomainSkills, selectedDomain) : [],
  [selectedDomain, activeDomainSkills]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2.5 mb-1">
          <Trophy className="w-5 h-5 text-[var(--text)]" />
          <h1 className="text-[1.6rem] font-extrabold text-[var(--text)] tracking-tight">Personal</h1>
        </div>
        <p className="text-sm text-[var(--faint)] font-medium">Your self-improvement OS — live ratings across every domain of life.</p>
      </div>

      {/* Overall Rating */}
      <div className="mb-5">
        <OverallCard rating={overallRating} skills={skills} onInfo={() => setShowCalc(true)} />
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Top Domain",     value: topDomain ? DOMAIN_META[topDomain.domain].label : "—",     sub: topDomain ? `${topDomain.score}/100` : undefined,  hue: topDomain ? DOMAIN_HUE[topDomain.domain] : undefined },
          { label: "Weakest Domain", value: weakDomain ? DOMAIN_META[weakDomain.domain].label : "—",   sub: weakDomain ? `${weakDomain.score}/100 · focus here` : undefined, hue: weakDomain ? DOMAIN_HUE[weakDomain.domain] : undefined },
          { label: "Skills Tracked", value: skills.length.toString(), sub: `${needsReview.length} need review`, hue: "var(--c-blue)" },
          { label: "Most Improved",  value: mostImproved ? mostImproved.name : "—", sub: mostImproved ? `+${mostImproved.gain.toFixed(1)} pts` : "Log history to see gains", hue: mostImproved ? "var(--c-emerald)" : undefined },
        ].map(s => (
          <div key={s.label} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 relative overflow-hidden">
            {s.hue && <div className="absolute top-0 left-4 right-4 h-[2px] rounded-full" style={{ background: s.hue }} />}
            <p className="text-[10px] text-[var(--faint)] uppercase tracking-[0.15em] font-bold mb-2 mt-0.5">{s.label}</p>
            <p className="text-lg font-extrabold leading-none truncate" style={s.hue ? { color: s.hue } : undefined}>{s.value}</p>
            {s.sub && <p className="text-[11px] text-[var(--faint)] mt-1">{s.sub}</p>}
          </div>
        ))}
      </div>

      {/* Domain grid */}
      <div className="mb-2">
        <p className="text-[10px] font-bold text-[var(--faint)] uppercase tracking-[0.18em] mb-3">Domains</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {(Object.keys(DOMAIN_META) as DomainKey[]).map(d => (
            <DomainCard key={d} domain={d} score={domainScores[d]}
              skillCount={skills.filter(s => s.domain === d).length}
              selected={selectedDomain === d}
              onClick={() => { setSelectedDomain(p => p === d ? null : d); setFilterView("all"); }}
            />
          ))}
        </div>
      </div>

      {/* Domain detail */}
      {selectedDomain && (() => {
        const meta  = DOMAIN_META[selectedDomain];
        const score = domainScores[selectedDomain];
        const dt    = getTier(score);
        const hue   = DOMAIN_HUE[selectedDomain];
        const domNeedsReview = needsReview.filter(s => s.domain === selectedDomain).length;
        return (
          <div className="mt-4 bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
            {/* Domain header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]" style={{ background: `color-mix(in srgb, ${hue} 12%, var(--surface))` }}>
              <div className="flex items-center gap-3">
                <span className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0" style={{ background: `color-mix(in srgb, ${hue} 18%, transparent)`, color: hue }}><meta.Icon className="w-5 h-5" strokeWidth={1.9} /></span>
                <div>
                  <h3 className="text-base font-extrabold" style={{ color: hue }}>{meta.label}</h3>
                  <p className="text-xs text-[var(--faint)]">{skills.filter(s => s.domain === selectedDomain).length} skills · {DOMAIN_WEIGHTS[selectedDomain]}% of overall</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-3xl font-extrabold tabular" style={{ color: hue }}>{score}</p>
                  <p className="text-xs" style={{ color: dt.color }}>{dt.label}</p>
                </div>
                <button onClick={() => setShowAddSkill(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--chip)] hover:bg-[var(--border)] border border-[var(--border)] rounded-lg text-xs font-semibold text-[var(--muted)] hover:text-[var(--text)] transition-all">
                  <Plus className="w-3.5 h-3.5" /> Add Skill
                </button>
              </div>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-1 p-3 border-b border-[var(--border)] bg-[var(--surface)]">
              {(["all", "weakest", "strongest", "needs-review"] as ViewFilter[]).map(v => (
                <button key={v} onClick={() => setFilterView(v)}
                  className={cn("px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors",
                    filterView === v ? "bg-[var(--text)] text-[var(--bg)]" : "text-[var(--faint)] hover:text-[var(--text)] hover:bg-[var(--chip)]"
                  )}>
                  {v === "needs-review" ? `Review${domNeedsReview > 0 ? ` (${domNeedsReview})` : ""}` : v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
              <div className="ml-auto flex items-center gap-1.5 text-[11px] text-[var(--faint)]">
                <BarChart2 className="w-3 h-3" />
                <span>Avg: {(activeDomainSkills.reduce((a,s)=>a+s.currentScore,0)/Math.max(activeDomainSkills.length,1)).toFixed(1)}/10</span>
              </div>
            </div>

            {/* Skills by subdomain */}
            <div className="p-4 space-y-6">
              {activeSubdomains.length === 0 ? (
                <p className="text-sm text-[var(--faint)] text-center py-6">No skills match this filter.</p>
              ) : (
                activeSubdomains.map(sub => {
                  const subSkills = activeDomainSkills.filter(s => s.subdomain === sub);
                  const subScore  = calcSubdomainScore(skills, selectedDomain, sub);
                  return (
                    <div key={sub}>
                      <div className="flex items-center gap-3 mb-3">
                        <h4 className="text-[11px] font-bold text-[var(--faint)] uppercase tracking-[0.18em]">{sub}</h4>
                        <div className="flex-1 h-px bg-[var(--chip)]" />
                        <span className={cn("text-xs font-bold", meta.text)}>{subScore}</span>
                      </div>
                      <div className="space-y-2">
                        {subSkills.map(skill => (
                          <SkillRow key={skill.id} skill={skill} onEdit={setEditingSkill} onLog={setLoggingSkill} />
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })()}

      {/* Goals — daily / weekly / monthly / yearly */}
      <GoalsSection goals={goals} onAdd={addGoal} onToggle={toggleGoal} onDelete={deleteGoal} />

      {/* Weekly review — AI retro of the past 7 days */}
      <WeeklyReview data={data} overallRating={overallRating} />

      {/* Body & Health — weight/BMI, sleep score, biological age */}
      <BodyHealthSection data={data} mutate={mutate} />

      {/* Modals */}
      {showCalc    && <CalcPanel skills={skills} onClose={() => setShowCalc(false)} />}
      {editingSkill && (
        <EditSkillModal
          skill={editingSkill}
          onSave={(id, updates) => updateSkill(id, updates)}
          onDelete={deleteSkill}
          onClose={() => setEditingSkill(null)}
        />
      )}
      {loggingSkill && (
        <LogPracticeModal
          skill={loggingSkill}
          onLog={logPractice}
          onClose={() => setLoggingSkill(null)}
        />
      )}
      {showAddSkill && selectedDomain && (
        <AddSkillModal
          domain={selectedDomain}
          onAdd={addSkill}
          onClose={() => setShowAddSkill(false)}
        />
      )}
    </div>
  );
}
