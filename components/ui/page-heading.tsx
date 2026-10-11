import type { ReactNode } from "react";

export function PageHeading({ title, description, children }: { title: ReactNode; description?: ReactNode; children?: ReactNode }) {
  return <header className="base-page-heading">
    <div className="min-w-0"><h1 className="base-page-title">{title}</h1>{description && <p className="base-page-description">{description}</p>}</div>
    {children && <div className="base-page-actions">{children}</div>}
  </header>;
}

export function EmptyState({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return <div className="base-empty"><div className="base-empty-mark" aria-hidden="true">○</div><h2>{title}</h2>{description && <p>{description}</p>}{children}</div>;
}

export function PageSkeleton() {
  return <div className="base-page" role="status" aria-label="Opening page"><div className="base-skeleton mb-3 h-7 w-36"/><div className="base-skeleton mb-8 h-4 w-56"/><div className="grid gap-4 sm:grid-cols-2"><div className="base-skeleton h-48"/><div className="base-skeleton h-48"/></div><span className="sr-only">Opening page…</span></div>;
}
