"use client";

import { useRef, useState } from "react";
import { useBridge } from "@/lib/hooks";
import { uid, cn } from "@/lib/utils";
import { BookOpen, ImagePlus, X, Loader2 } from "lucide-react";
import { CardListPage, type CardConfig } from "@/components/card-list-page";
import type { ReadingCategory, ReadingListItem } from "@/lib/store";

const CATEGORIES: { value: ReadingCategory; label: string; emoji: string }[] = [
  { value: "fiction",     label: "Fiction",     emoji: "📖" },
  { value: "non-fiction", label: "Non-fiction", emoji: "🧠" },
  { value: "self-help",   label: "Self-help",   emoji: "🌱" },
  { value: "business",    label: "Business",    emoji: "💼" },
  { value: "tech",        label: "Tech",        emoji: "💻" },
  { value: "biography",   label: "Biography",   emoji: "🧑‍🚀" },
  { value: "other",       label: "Other",       emoji: "📦" },
];

const emojiFor = (c: string) => CATEGORIES.find((x) => x.value === c)?.emoji ?? "📦";

// Resize an uploaded image to a book-cover-sized data-URL (max ~512px, webp).
async function fileToCover(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result as string);
    fr.onerror = () => rej(new Error("read failed"));
    fr.readAsDataURL(file);
  });
  const img = document.createElement("img");
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = () => rej(new Error("decode failed"));
    img.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 768;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  const scale = Math.max(512 / img.width, 768 / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (512 - w) / 2, (768 - h) / 2, w, h);
  return canvas.toDataURL("image/webp", 0.85);
}

const CONFIG: CardConfig<ReadingListItem> = {
  dataKey: "readingList",
  title: "Reading List",
  addLabel: "Add Book",
  emptyIcon: BookOpen,
  emptyText: "Your reading list is empty. Add books you want to read!",
  doneLabel: (n) => `Read (${n})`,
  cover: (item) => item.cover,
  titleOf: (item) => item.name,
  subtitleOf: (item) => item.author || undefined,
  aspect: () => "aspect-[2/3]",
  badge: (item) => ({ label: CATEGORIES.find((c) => c.value === item.category)?.label ?? "Other" }),
  fallbackEmoji: (item) => emojiFor(item.category),
};

function AddBook({ close, append }: { close: () => void; append: (item: ReadingListItem) => void }) {
  const [name, setName] = useState("");
  const [author, setAuthor] = useState("");
  const [category, setCategory] = useState<ReadingCategory>("fiction");
  const [cover, setCover] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      setCover(await fileToCover(file));
    } catch {
      setUploadError("Couldn't read that image.");
    } finally {
      setUploading(false);
    }
  }

  function submit() {
    if (!name.trim()) return;
    append({
      id: uid(),
      name: name.trim(),
      author: author.trim(),
      category,
      checked: false,
      createdAt: new Date().toISOString(),
      cover: cover || undefined,
    });
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border-2)] rounded-xl p-5 space-y-4">
      <h2 className="text-sm font-semibold text-[var(--text)]">Add Book</h2>

      <div className="flex gap-4">
        {/* Cover preview — larger than an emoji, real book-cover size */}
        <div className="shrink-0">
          <div className="w-28 h-40 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] overflow-hidden grid place-items-center relative">
            {cover ? (
              <img src={cover} alt="Book cover" className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <span className="text-4xl opacity-30">{emojiFor(category)}</span>
            )}
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[11px] font-medium text-[var(--muted)] hover:text-[var(--text)] transition-colors"
            >
              <ImagePlus className="w-3.5 h-3.5" />
              {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Cover"}
            </button>
            {cover && (
              <button type="button" onClick={() => setCover("")} title="Clear cover" className="text-[var(--faint)] hover:text-[var(--text)] transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
        </div>

        <div className="flex-1 min-w-0 space-y-3">
          <input
            autoFocus
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)] transition-colors"
            placeholder="Book title…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <input
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)] transition-colors"
            placeholder="Author (optional)"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <div>
            <p className="text-xs text-[var(--muted)] uppercase tracking-widest font-semibold mb-2">Cover URL <span className="normal-case font-normal text-[var(--faint)]">(or upload above)</span></p>
            <input
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-[var(--text)] placeholder-[var(--faint)] focus:outline-none focus:border-[var(--border-2)] transition-colors"
              placeholder="https://…/cover.jpg"
              value={cover.startsWith("data:") ? "" : cover}
              onChange={(e) => setCover(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
          {uploadError && <p className="text-[11px] text-[var(--c-red)]">{uploadError}</p>}
        </div>
      </div>

      {/* Category */}
      <div>
        <p className="text-xs text-[var(--muted)] uppercase tracking-widest font-semibold mb-2">Category</p>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => setCategory(cat.value)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all",
                category === cat.value
                  ? "bg-[var(--chip)] border-[var(--border-2)] text-[var(--text)]"
                  : "bg-[var(--surface-2)] border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--border)]"
              )}
            >
              <span>{cat.emoji}</span>
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <button onClick={close} className="px-4 py-2 text-xs text-[var(--muted)] hover:text-[var(--text)] transition-colors">Cancel</button>
        <button onClick={submit} className="px-5 py-2 bg-[var(--text)] hover:bg-[var(--text-hover)] text-[var(--bg)] text-xs font-semibold rounded-lg transition-colors">Add Book</button>
      </div>
    </div>
  );
}

export function ReadingListPage() {
  const { data } = useBridge();
  const items = (data.readingList ?? []) as ReadingListItem[];

  return (
    <CardListPage
      config={CONFIG}
      items={items}
      renderAdd={({ close, append }) => <AddBook close={close} append={append} />}
    />
  );
}