import { Component, lazy, Suspense, useEffect, type ReactNode } from "react";
import { Sidebar } from "@/components/sidebar";
import { Dock } from "@/components/dock";
import { BottomNav } from "@/components/bottom-nav";
import { TopBar } from "@/components/topbar";
import { ContentContainer } from "@/components/content-container";
import { SidebarProvider } from "@/lib/sidebar-context";
import { NavModeProvider } from "@/lib/nav-mode-context";
import { ToastProvider } from "@/lib/toast-context";
import { ConfirmProvider } from "@/lib/confirm-context";
import { ThemeProvider } from "@/lib/theme-context";
import { AccentProvider } from "@/lib/accent-context";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { usePathname } from "./navigation";
import { DesktopAccountSettings, DesktopSyncButton, DesktopFeedback } from "./desktop-controls";
import { useUnsaved, useWorkspaceScope } from "./store";
import { PageSkeleton } from "@/components/ui/page-heading";

class PageRecovery extends Component<{children:ReactNode},{error:Error|null}> {
  state:{error:Error|null}={error:null};
  static getDerivedStateFromError(error:Error){return {error};}
  render(){return this.state.error?<div role="alert" className="p-6"><h1 className="text-lg font-semibold">This page could not open</h1><p className="mt-2">Your stored workspace is retained. Use Settings → Accounts & Sync to export a recovery copy, or open another page.</p><p className="mt-2 text-sm text-[var(--muted)]">{this.state.error.message}</p><button className="mt-3 underline" onClick={()=>this.setState({error:null})}>Retry page</button></div>:this.props.children;}
}

const Dashboard = lazy(() => import("@/components/dashboard").then(m => ({ default: m.Dashboard })));
const Tasks = lazy(() => import("@/components/tasks-page").then(m => ({ default: m.TasksPage })));
const Calendar = lazy(() => import("@/components/calendar-page").then(m => ({ default: m.CalendarPage })));
const Projects = lazy(() => import("@/components/projects-page").then(m => ({ default: m.ProjectsPage })));
const Project = lazy(() => import("@/components/project-detail").then(m => ({ default: m.ProjectDetail })));
const Notes = lazy(() => import("@/components/wiki-page").then(m => ({ default: m.WikiPage })));
const Vision = lazy(() => import("@/components/vision-board-page").then(m => ({ default: m.VisionBoardPage })));
const Finance = lazy(() => import("@/components/finance-page").then(m => ({ default: m.FinancePage })));
const Money = lazy(() => import("@/components/money-page").then(m => ({ default: m.MoneyPage })));
const Focus = lazy(() => import("@/components/focus-page").then(m => ({ default: m.FocusPage })));
const News = lazy(() => import("@/components/news-page").then(m => ({ default: m.NewsPage })));
const Shopping = lazy(() => import("@/components/shopping-list-page").then(m => ({ default: m.ShoppingListPage })));
const Reading = lazy(() => import("@/components/reading-list-page").then(m => ({ default: m.ReadingListPage })));
const Watch = lazy(() => import("@/components/watch-list-page").then(m => ({ default: m.WatchListPage })));
const Settings = lazy(() => import("@/components/settings-page").then(m => ({ default: m.SettingsPage })));
function Route() {
  const path = usePathname();
  switch (path) {
    case "/": return <Dashboard />;
    case "/tasks": return <Tasks />;
    case "/calendar": return <Calendar />;
    case "/projects": return <Projects />;
    case "/notes": return <Notes />;
    case "/vision": return <Vision />;
    case "/finance": return <Finance />;
    case "/money": return <Money />;
    case "/focus": return <Focus />;
    case "/news": return <News />;
    case "/shopping-list": return <Shopping />;
    case "/reading-list": return <Reading />;
    case "/watch-list": return <Watch />;
    case "/settings": return <Settings accountSection={<DesktopAccountSettings />} />;
    default: return path.startsWith("/projects/") ? <Project id={decodeURIComponent(path.slice(10))} /> : <div className="p-6">Page not found. Use the sidebar to return to your workspace.</div>;
  }
}
function ReportReady() {
  useEffect(()=>{
    let second=0;
    const first=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>window.dispatchEvent(new Event("base:page-ready")));});
    return ()=>{cancelAnimationFrame(first);cancelAnimationFrame(second);};
  },[]);
  return null;
}
export function App() {
  const unsaved=useUnsaved();
  const path=usePathname(),scope=useWorkspaceScope();
  return <ThemeProvider><AccentProvider><SidebarProvider><NavModeProvider><ToastProvider><ConfirmProvider>
    <KeyboardShortcuts />
    <a className="base-skip-link" href="#base-main" onClick={event=>{event.preventDefault();document.getElementById("base-main")?.focus();}}>Skip to content</a>
    <div className="flex h-dvh overflow-hidden bg-[var(--bg)]">
      <div className="nx-desktop-sidebar hidden md:flex shrink-0"><Sidebar /></div>
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <TopBar syncControl={<DesktopSyncButton />} /><DesktopFeedback />
        <main id="base-main" tabIndex={-1} inert={unsaved} className="nx-main flex-1 min-h-0 overflow-y-auto overscroll-contain"><ContentContainer>
          <PageRecovery key={`${scope}:${path}`}><Suspense fallback={<PageSkeleton />}><Route /><ReportReady /></Suspense></PageRecovery>
        </ContentContainer></main>
      </div>
      <div className="nx-desktop-dock"><Dock /></div>
      <div className="md:hidden"><BottomNav /></div>
    </div>
  </ConfirmProvider></ToastProvider></NavModeProvider></SidebarProvider></AccentProvider></ThemeProvider>;
}
