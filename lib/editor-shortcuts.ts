export function editorFormatCommand(event: { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }): string | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (!event.shiftKey) return ({ b: "bold", i: "italic", u: "underline", k: "createLink" } as Record<string,string>)[key] ?? null;
  return key === "x" ? "strikeThrough" : key === "\\" ? "removeFormat" : null;
}
