"use client";

import { ListPage, type ListPageConfig } from "@/components/list-page";
import { BookOpen } from "lucide-react";

const CONFIG: ListPageConfig = {
  dataKey: "readingList",
  title: "Reading List",
  addLabel: "Add Book",
  namePlaceholder: "Book title…",
  emptyIcon: BookOpen,
  emptyText: "Your reading list is empty. Add books you want to read!",
  gotLabel: (n) => `Read (${n})`,
  categories: [
    { value: "fiction",     label: "Fiction",     emoji: "📖" },
    { value: "non-fiction", label: "Non-fiction", emoji: "🧠" },
    { value: "self-help",   label: "Self-help",   emoji: "🌱" },
    { value: "business",    label: "Business",    emoji: "💼" },
    { value: "tech",        label: "Tech",        emoji: "💻" },
    { value: "biography",   label: "Biography",   emoji: "🧑‍🚀" },
    { value: "other",       label: "Other",       emoji: "📦" },
  ],
  extraFields: [{ key: "author", label: "Author", placeholder: "Author name (optional)" }],
};

export function ReadingListPage() {
  return <ListPage cfg={CONFIG} />;
}