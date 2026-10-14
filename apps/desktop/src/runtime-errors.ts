// Keep diagnostics local; never include document contents or send them to a server.
export function reportSyntaxError(error: unknown, context: string) {
  const message = String(error);
  if (!(error instanceof Error && error.name === 'SyntaxError') && !/SyntaxError|expected pattern/i.test(message)) return;
  const stack = error instanceof Error ? error.stack : undefined;
  window.dispatchEvent(new CustomEvent('base:syntax-error', { detail: `${context}\n${stack || message + '\n' + new Error().stack}` }));
}
