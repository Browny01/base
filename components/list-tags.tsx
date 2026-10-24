"use client";
import { useState } from "react";
import { Tag, X, Pencil, Trash2 } from "lucide-react";
import { EditorDialog } from "./ui/editor-dialog";
import { useBase } from "@/lib/hooks";
import { useConfirm } from "@/lib/confirm-context";
import { uid } from "@/lib/utils";
import { itemTags, listTagCatalog, updateListTag, type ListKey, type TaggedItem } from "@/lib/list-tags";
import type { ListTag } from "@/lib/store";

export function TagFilters({ items, selected, onChange }: { items: TaggedItem[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const tags = listTagCatalog(items);
  return tags.length > 0 || selected.length > 0 ? <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="Filter by tags">
    <span className="mr-1 text-xs text-[var(--muted)]">Tags</span>
    {tags.map(tag => <button key={tag.id} aria-pressed={selected.includes(tag.id)} onClick={() => onChange(selected.includes(tag.id) ? selected.filter(id => id !== tag.id) : [...selected, tag.id])} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${selected.includes(tag.id) ? "border-[var(--accent)] bg-[var(--chip)]" : "border-[var(--border)]"}`}><span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />{tag.name}</button>)}
    {selected.length > 0 && <button className="text-xs text-[var(--muted)] underline" onClick={() => onChange([])}>Clear tags</button>}
  </div> : null;
}

export function ItemTags({ item, dataKey, title }: { item: TaggedItem; dataKey: ListKey; title: string }) {
  const { data, mutate } = useBase();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false), [search, setSearch] = useState("");
  const [editing, setEditing] = useState<string | null>(null), [name, setName] = useState(""), [color, setColor] = useState("#8b8cf8");
  const [error, setError] = useState("");
  const items = data[dataKey];
  const tags = open ? listTagCatalog(items) : [], assigned = itemTags(item);
  function assign(tag: ListTag) {
    mutate(current => ({ ...current, [dataKey]: current[dataKey].map(row => row.id !== item.id ? row : { ...row, tags: itemTags(row).some(t => t.id === tag.id) ? itemTags(row).filter(t => t.id !== tag.id) : [...itemTags(row), tag] }) }));
  }
  function reset() { setEditing(null); setName(""); setError(""); }
  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label={`Edit tags for ${title}`} className="mt-2 flex max-w-full flex-wrap items-center gap-1.5 rounded text-xs text-[var(--muted)] hover:text-[var(--text)]">
      {assigned.map(tag => <span key={tag.id} className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2 py-0.5"><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tag.color }}/><span className="max-w-28 truncate">{tag.name}</span></span>)}
      <span className="inline-flex items-center gap-1"><Tag className="h-3 w-3"/>{assigned.length ? "Edit" : "Add tag"}</span>
    </button>
    {open && <EditorDialog title={`Tags for ${title}`} onClose={() => setOpen(false)}>
      <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Tags</h2><p className="mt-1 text-sm text-[var(--muted)]">{title}</p></div><button aria-label="Close tags" onClick={() => setOpen(false)}><X className="h-5 w-5"/></button></div>
      <input aria-label="Search your tags" placeholder="Search your tags…" value={search} onChange={event => setSearch(event.target.value)} className="mb-3 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2.5 text-sm"/>
      <div className="max-h-64 space-y-1 overflow-auto">
        {tags.filter(tag => tag.name.toLowerCase().includes(search.toLowerCase())).map(tag => <div key={tag.id} className="flex items-center gap-2 rounded-lg p-2 hover:bg-[var(--surface-2)]">
          <label className="flex min-w-0 flex-1 items-center gap-2 text-sm"><input type="checkbox" checked={assigned.some(t => t.id === tag.id)} onChange={() => assign(tag)}/><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: tag.color }}/><span className="truncate">{tag.name}</span></label>
          <button aria-label={`Edit ${tag.name}`} onClick={() => { setEditing(tag.id); setName(tag.name); setColor(tag.color); }}><Pencil className="h-3.5 w-3.5"/></button>
          <button aria-label={`Delete tag ${tag.name}`} onClick={async () => { if (await confirm({ message: `Remove “${tag.name}” from every item in this list? The items will stay.` })) { mutate(current => ({ ...current, [dataKey]: updateListTag<(typeof current)[ListKey][number]>(current[dataKey], tag.id, null) })); reset(); } }}><Trash2 className="h-3.5 w-3.5 text-[var(--muted)]"/></button>
        </div>)}
        {!tags.length && <p className="py-3 text-sm text-[var(--muted)]">Create your first tag below. Your tags will be available on other items in this list.</p>}
      </div>
      <form className="mt-5 border-t border-[var(--border)] pt-4" onSubmit={event => {
        event.preventDefault(); if (!name.trim()) return;
        const existing = tags.find(tag => tag.name.toLowerCase() === name.trim().toLowerCase() && tag.id !== editing);
        if (existing) {
          if (editing) { setError("A tag with that name already exists. Choose another name or select it above."); return; }
          if (!assigned.some(t => t.id === existing.id)) assign(existing); reset(); return;
        }
        if (editing) mutate(current => ({ ...current, [dataKey]: updateListTag<(typeof current)[ListKey][number]>(current[dataKey], editing, { name: name.trim(), color }) }));
        else assign({ id: uid(), name: name.trim(), color });
        reset();
      }}>
        <p className="mb-2 text-sm font-medium">{editing ? "Edit tag for this list" : "Create a tag"}</p>
        <div className="flex items-center gap-2"><input type="color" aria-label="Tag colour" value={color} onChange={event => setColor(event.target.value)} className="h-10 w-10 rounded border border-[var(--border)] bg-transparent"/><input aria-label="Tag name" maxLength={40} value={name} onChange={event => setName(event.target.value)} placeholder="Name your tag" className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2.5 text-sm"/><button disabled={!name.trim()} className="base-button base-button-primary">{editing ? "Save" : "Create"}</button></div>
        {editing && <button type="button" className="mt-2 text-xs underline" onClick={reset}>Cancel edit</button>}
        {error && <p role="alert" className="mt-2 text-xs text-[var(--c-rose)]">{error}</p>}
      </form>
    </EditorDialog>}
  </>;
}
