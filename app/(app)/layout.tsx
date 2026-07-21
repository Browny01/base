import { Sidebar } from "@/components/sidebar";
import { Dock } from "@/components/dock";
import { BottomNav } from "@/components/bottom-nav";
import { TopBar } from "@/components/topbar";
import { ContentContainer } from "@/components/content-container";
import { SidebarProvider } from "@/lib/sidebar-context";
import { NavModeProvider } from "@/lib/nav-mode-context";
import { ToastProvider } from "@/lib/toast-context";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";

// Desktop nav (sidebar vs dock) is chosen by the `data-nav` attribute on <html> +
// CSS in globals.css, so switching modes never flashes. Both are always rendered.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <NavModeProvider>
       <ToastProvider>
        <KeyboardShortcuts />
        <div className="flex h-full bg-[var(--bg)]">
          {/* Sidebar — desktop, when nav mode = sidebar */}
          <div className="nx-desktop-sidebar hidden md:flex shrink-0">
            <Sidebar />
          </div>

          {/* Main column */}
          <div className="flex-1 flex flex-col min-w-0">
            <TopBar />
            <main className="nx-main flex-1 overflow-y-auto">
              <ContentContainer>{children}</ContentContainer>
            </main>
          </div>

          {/* Dock — desktop, when nav mode = dock (hidden by CSS otherwise) */}
          <div className="nx-desktop-dock">
            <Dock />
          </div>

          {/* Bottom nav — mobile only */}
          <div className="md:hidden">
            <BottomNav />
          </div>
        </div>
       </ToastProvider>
      </NavModeProvider>
    </SidebarProvider>
  );
}
