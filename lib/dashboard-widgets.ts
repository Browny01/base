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
  const next=widgets.filter(id=>id!==source);next.splice(widgets.indexOf(target),0,source);return next;
}

export type WidgetSize = { columns: number; height: number };
export type WidgetSizes = Partial<Record<DashboardWidget, WidgetSize>>;
export function clampWidgetSize(id: DashboardWidget, columns: number, height: number): WidgetSize {
  return { columns: Math.max(1, Math.min(4, Math.round(Number.isFinite(columns)?columns:2))), height: Math.max(id.endsWith("metric")?176:240, Math.min(1200, Math.round((Number.isFinite(height)?height:320)/16)*16)) };
}
export function readWidgetSizes(raw: string): WidgetSizes {
  try {
    const value: unknown=JSON.parse(raw);if(!value||typeof value!=="object"||Array.isArray(value))return {};
    return Object.fromEntries(DASHBOARD_WIDGETS.flatMap(id=>{const size=(value as Record<string,WidgetSize>)[id];return size&&typeof size.columns==="number"&&typeof size.height==="number"?[[id,clampWidgetSize(id,size.columns,size.height)]]:[];}));
  } catch { return {}; }
}
