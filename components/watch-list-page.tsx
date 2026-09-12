"use client";

import { ListPage, type ListPageConfig } from "@/components/list-page";
import { Play } from "lucide-react";

const CONFIG: ListPageConfig = {
  dataKey: "watchList",
  title: "Watch List",
  addLabel: "Add Title",
  namePlaceholder: "Movie or show…",
  emptyIcon: Play,
  emptyText: "Your watch list is empty. Add things you want to watch!",
  gotLabel: (n) => `Watched (${n})`,
  categories: [
    { value: "movie",       label: "Movie",       emoji: "🎬" },
    { value: "series",      label: "Series",      emoji: "📺" },
    { value: "anime",       label: "Anime",       emoji: "🌸" },
    { value: "documentary", label: "Documentary", emoji: "🎥" },
    { value: "youtube",     label: "YouTube",     emoji: "▶️" },
    { value: "other",       label: "Other",       emoji: "📦" },
  ],
};

export function WatchListPage() {
  return <ListPage cfg={CONFIG} />;
}