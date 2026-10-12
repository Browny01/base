"use client";
import { useState } from "react";
import { Plus, Rss, Trash2, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { NEWS_SOURCES } from "@/packages/core/src/news-sources";
import {
  CATEGORY_LABEL,
  uid,
  type NewsPrefs,
  type YoutubeChannel,
} from "@/lib/news-prefs";
type Platform = "youtube" | "reddit" | "x" | "twitch" | "kick";
export function NewsSourceSettings({
  prefs,
  setPrefs,
}: {
  prefs: NewsPrefs;
  setPrefs: (prefs: NewsPrefs | ((current: NewsPrefs) => NewsPrefs)) => void;
}) {
  const [platform, setPlatform] = useState<Platform>("youtube"),
    [input, setInput] = useState(""),
    [name, setName] = useState(""),
    [category, setCategory] = useState<YoutubeChannel["category"]>("general"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const selected = prefs.newsSources ?? NEWS_SOURCES.map((s) => s.id);
  const rows = [
    ...prefs.youtube.map((v) => ({
      id: v.id,
      name: v.name,
      detail: "YouTube · " + CATEGORY_LABEL[v.category],
      remove: () =>
        setPrefs((current) => ({
          ...current,
          youtube: current.youtube.filter((x) => x.id !== v.id),
        })),
    })),
    ...prefs.reddit.map((v) => ({
      id: "reddit-" + v,
      name: "r/" + v,
      detail: "Reddit",
      remove: () =>
        setPrefs((current) => ({
          ...current,
          reddit: current.reddit.filter((x) => x !== v),
        })),
    })),
    ...prefs.x.map((v) => ({
      id: "x-" + v,
      name: "@" + v,
      detail: "X",
      remove: () =>
        setPrefs((current) => ({
          ...current,
          x: current.x.filter((x) => x !== v),
        })),
    })),
    ...prefs.creators.map((v) => ({
      id: v.id,
      name: v.name,
      detail: v.platform === "twitch" ? "Twitch" : "Kick",
      remove: () =>
        setPrefs((current) => ({
          ...current,
          creators: current.creators.filter((x) => x.id !== v.id),
        })),
    })),
  ];
  async function add() {
    setError("");
    setBusy(true);
    try {
      const raw = input.trim();
      if (!raw) throw new Error("Enter a source to add.");
      if (platform === "youtube") {
        const r = await apiFetch(
          "/api/youtube/channel?channel=" + encodeURIComponent(raw),
        );
        const v = await r.json();
        if (!r.ok || !v.channelId)
          throw new Error(v.error || "Could not find this channel.");
        if (prefs.youtube.some((c) => c.channelId === v.channelId))
          throw new Error("This channel is already added.");
        if (!name.trim()) throw new Error("Give this channel a display name.");
        setPrefs((current) => ({
          ...current,
          youtube: [
            ...current.youtube,
            {
              id: uid(),
              channelId: v.channelId,
              name: name.trim().replaceAll("|", " "),
              category,
            },
          ],
        }));
      } else {
        let value = raw;
        if (raw.startsWith("https://")) {
          const u = new URL(raw);
          const allowed =
            platform === "reddit"
              ? ["reddit.com", "www.reddit.com"]
              : platform === "x"
                ? ["x.com", "twitter.com", "www.x.com", "www.twitter.com"]
                : platform === "twitch"
                  ? ["twitch.tv", "www.twitch.tv"]
                  : ["kick.com", "www.kick.com"];
          if (!allowed.includes(u.hostname))
            throw new Error("Use a link for the selected platform.");
          value = u.pathname
            .replace(/^\/r\//, "")
            .replace(/^\//, "")
            .split("/")[0];
        }
        value = value.replace(/^r\//, "").replace(/^@/, "");
        if (!/^[A-Za-z0-9_-]{1,100}$/.test(value))
          throw new Error("Enter a valid handle or source link.");
        if (platform === "reddit" || platform === "x") {
          if (
            prefs[platform].some((x) => x.toLowerCase() === value.toLowerCase())
          )
            throw new Error("This source is already added.");
          setPrefs((current) => ({
            ...current,
            [platform]: [...current[platform], value],
          }));
        } else {
          if (
            prefs.creators.some(
              (x) =>
                x.platform === platform &&
                x.handle.toLowerCase() === value.toLowerCase(),
            )
          )
            throw new Error("This creator is already added.");
          setPrefs((current) => ({
            ...current,
            creators: [
              ...current.creators,
              {
                id: uid(),
                platform,
                name: name.trim() || value,
                handle: value,
              },
            ],
          }));
        }
      }
      setInput("");
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="base-settings-card">
      <div className="base-settings-card-heading">
        <Rss className="h-5 w-5" />
        <div>
          <h2>Your news sources</h2>
          <p>
            Choose your headlines, then add the channels and creators you
            follow.
          </p>
        </div>
      </div>
      <div className="base-news-publications">
        {NEWS_SOURCES.map((source) => (
          <label key={source.id}>
            <input
              type="checkbox"
              checked={selected.includes(source.id)}
              onChange={(e) => {
                const checked = e.currentTarget.checked;
                setPrefs((current) => {
                  const active =
                    current.newsSources ?? NEWS_SOURCES.map((item) => item.id);
                  return {
                    ...current,
                    newsSources: checked
                      ? [...new Set([...active, source.id])]
                      : active.filter((id) => id !== source.id),
                  };
                });
              }}
            />
            <span>
              <strong>{source.name}</strong>
              <small>{source.category}</small>
            </span>
          </label>
        ))}
      </div>
      <form
        className="base-source-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <div className="base-source-composer-heading">
          <h3>Add a source</h3>
          <span>Links and handles are welcome.</span>
        </div>
        <div className="base-source-inputs">
          <label>
            Platform
            <select
              value={platform}
              onChange={(e) => {
                setPlatform(e.target.value as Platform);
                setError("");
              }}
            >
              {["youtube", "reddit", "x", "twitch", "kick"].map((v) => (
                <option key={v} value={v}>
                  {v === "youtube"
                    ? "YouTube"
                    : v === "x"
                      ? "X"
                      : v[0].toUpperCase() + v.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Source
            <input
              required
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                platform === "youtube"
                  ? "@handle or channel URL"
                  : platform === "reddit"
                    ? "r/subreddit or link"
                    : "@handle or profile link"
              }
            />
          </label>
          {platform !== "reddit" && platform !== "x" && (
            <label>
              Display name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required={platform === "youtube"}
                placeholder="A name you recognise"
              />
            </label>
          )}
          {platform === "youtube" && (
            <label>
              Category
              <select
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as YoutubeChannel["category"])
                }
              >
                {(["general", "crypto", "ai", "irl", "gaming"] as const).map(
                  (v) => (
                    <option key={v} value={v}>
                      {CATEGORY_LABEL[v]}
                    </option>
                  ),
                )}
              </select>
            </label>
          )}
          <button disabled={busy} className="base-button base-button-primary">
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add source
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-[var(--c-rose)]">
            {error}
          </p>
        )}
      </form>
      <div className="base-source-list">
        {rows.length ? (
          rows.map((row) => (
            <div key={row.id}>
              <span>
                <strong>{row.name}</strong>
                <small>{row.detail}</small>
              </span>
              <button
                type="button"
                onClick={row.remove}
                aria-label={"Remove " + row.name}
                className="base-icon-button"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        ) : (
          <p className="text-sm text-[var(--muted)]">
            Add your first source above. Selected publications still appear in
            News.
          </p>
        )}
      </div>
    </section>
  );
}
