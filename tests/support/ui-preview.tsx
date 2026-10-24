/// <reference types="vite/client" />
import { createRoot } from "react-dom/client";
import { HabitsPage } from "../../components/habits-page";
import { WikiPage } from "../../components/wiki-page";
import { ShoppingListPage } from "../../components/shopping-list-page";
import { WatchListPage } from "../../components/watch-list-page";
import { ReadingListPage } from "../../components/reading-list-page";
import { Sidebar } from "../../components/sidebar";
import { TopBar } from "../../components/topbar";
import { ContentContainer } from "../../components/content-container";
import { BottomNav } from "../../components/bottom-nav";
import { SidebarProvider } from "../../lib/sidebar-context";
import { ThemeProvider } from "../../lib/theme-context";
import { NavModeProvider } from "../../lib/nav-mode-context";
import { ToastProvider } from "../../lib/toast-context";
import { ConfirmProvider } from "../../lib/confirm-context";
import { usePathname } from "../../apps/desktop/src/navigation";
import { runNoteSelectionChecks } from "../note-selection.browser";
import { runNoteExportChecks } from "../note-export.browser";
import "../../app/globals.css";
function Preview() {
  const path = usePathname();
  const Page = path === "/notes" ? WikiPage : path === "/watch-list" ? WatchListPage : path === "/reading-list" ? ReadingListPage : path === "/shopping-list" ? ShoppingListPage : HabitsPage;
  return <ThemeProvider><SidebarProvider><NavModeProvider><ToastProvider><ConfirmProvider><div className="flex h-dvh overflow-hidden"><div className="hidden md:flex"><Sidebar/></div><div className="flex min-w-0 flex-1 flex-col"><TopBar/><main className="nx-main min-h-0 flex-1 overflow-auto"><ContentContainer><Page/></ContentContainer></main><div className="md:hidden"><BottomNav/></div></div></div></ConfirmProvider></ToastProvider></NavModeProvider></SidebarProvider></ThemeProvider>;
}
Object.assign(window, { runNoteSelectionChecks, runNoteExportChecks });
const root = createRoot(document.getElementById("root")!);
root.render(<Preview/>);
import.meta.hot?.dispose(() => root.unmount());
