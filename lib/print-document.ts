let nativePrinter: ((html: string) => Promise<void>) | null = null;
export function installPrinter(printer: (html: string) => Promise<void>) { nativePrinter = printer; }
export function printDocument(html: string) {
  if (nativePrinter) return nativePrinter(html);
  const window = globalThis.window.open("", "_blank");
  if (!window) return;
  window.document.write(html); window.document.close(); window.focus();
  setTimeout(() => window.print(), 350);
}
