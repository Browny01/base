export const DASHBOARD_WIDGETS = ["tasks-metric", "revenue-metric", "tasks", "calendar", "news", "projects", "bookmarks", "focus", "notes", "payments"] as const;
export type DashboardWidget = typeof DASHBOARD_WIDGETS[number];
export const DEFAULT_DASHBOARD_WIDGETS: DashboardWidget[] = ["tasks-metric", "revenue-metric", "tasks", "calendar", "projects", "news", "focus", "notes", "bookmarks"];
/** Unknown versions/IDs never make the dashboard unusable or reorder user data. */
export function readDashboardWidgets(raw: string): DashboardWidget[] {
  try { const value: unknown = JSON.parse(raw); if (!Array.isArray(value)) return [...DEFAULT_DASHBOARD_WIDGETS]; return [...new Set(value.filter((id):id is DashboardWidget => typeof id === "string" && (DASHBOARD_WIDGETS as readonly string[]).includes(id)))]; }
  catch { return [...DEFAULT_DASHBOARD_WIDGETS]; }
}
export function moveDashboardWidget(widgets: DashboardWidget[], id: DashboardWidget, direction: -1 | 1): DashboardWidget[] {
  const next=[...widgets], index=next.indexOf(id), target=index+direction;
  if(index<0||target<0||target>=next.length)return next;
  [next[index],next[target]]=[next[target],next[index]];return next;
}
export function reorderDashboardWidget(widgets:DashboardWidget[], source:DashboardWidget, target:DashboardWidget):DashboardWidget[] {
  if(source===target || !widgets.includes(source) || !widgets.includes(target))return [...widgets];
  const next=widgets.filter(id=>id!==source);next.splice(next.indexOf(target),0,source);return next;
}
