"use client";

import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  X, MoreHorizontal, Sun, Moon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme-context";
import { useBase } from "@/lib/hooks";
import { visiblePages, isHidden, PAGE_BY_KEY, SETTINGS_PAGE, DEFAULT_NAV_PREFS, type NavPage } from "@/lib/nav-config";

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

function Tab({ item, active }: { item: NavPage; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "tap relative flex flex-col items-center justify-center gap-0.5 w-[58px] min-w-11 shrink-0 h-[46px] rounded-[16px] transition-colors",
        active ? "text-[var(--text)]" : "text-[var(--faint)]",
      )}
    >
      {active && <span className="absolute inset-0 rounded-[16px] bg-[var(--surface-2)]" aria-hidden="true" />}
      <Icon className="relative shrink-0" style={{ width: 22, height: 22 }} strokeWidth={active ? 2.1 : 1.8} />
    </Link>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { theme, toggle: toggleTheme } = useTheme();
  const { data } = useBase();
  const isDark = theme === "dark";

  const navPrefs = data.navPrefs;
  const tabsKeys = navPrefs?.bottomTabs?.length ? navPrefs.bottomTabs : DEFAULT_NAV_PREFS.bottomTabs;
  const tabs = tabsKeys
    .map((key) => PAGE_BY_KEY.get(key))
    .filter((p): p is NavPage => !!p && !isHidden(p.key, navPrefs));
  const all = [...visiblePages(navPrefs), SETTINGS_PAGE];

  const TAB_HREFS = new Set(tabs.map((t) => t.href));
  const onOtherPage = !TAB_HREFS.has(pathname) && ![...TAB_HREFS].some((h) => h !== "/" && pathname.startsWith(h + "/")) && pathname !== "/";
  const moreActive = open || onOtherPage;

  return (
    <>
      {/* More sheet — the full app map */}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px] nx-fade" />
          <Dialog.Content
            aria-describedby={undefined}
            onCloseAutoFocus={(event) => { event.preventDefault(); triggerRef.current?.focus(); }}
            className="fixed inset-x-3 bottom-[var(--app-bottom-clearance)] z-[70] max-h-[calc(100dvh-var(--app-bottom-clearance)-env(safe-area-inset-top)-1rem)] overflow-y-auto overscroll-contain glass glass-edge border border-[var(--border)] rounded-[26px] p-4 nx-slide-up"
          >
              <div className="flex items-center justify-between mb-3">
                <Dialog.Title className="eyebrow">All pages</Dialog.Title>
                <Dialog.Close aria-label="Close all pages" className="tap w-11 h-11 flex items-center justify-center rounded-full text-[var(--faint)] hover:text-[var(--text)] hover:bg-[var(--chip)]">
                  <X className="w-4 h-4" />
                </Dialog.Close>
              </div>
              <div className="grid grid-cols-3 min-[375px]:grid-cols-4 gap-1.5">

                {all.map(({ href, label, icon: Icon }, i) => {
                  const active = isActive(pathname, href);
                  return (
                    <Link key={href} href={href} onClick={() => setOpen(false)}
                      className={cn("tap nx-slide-up flex flex-col items-center gap-1.5 py-3 rounded-2xl text-center border",
                        active ? "bg-[var(--surface-2)] text-[var(--text)] border-[var(--border-2)]" : "text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] border-transparent")}
                      style={{ animationDelay: `${i * 16}ms` }}>
                      <Icon style={{ width: 19, height: 19 }} strokeWidth={active ? 2.1 : 1.8} />
                      <span className="text-[10.5px] font-medium">{label}</span>
                    </Link>
                  );
                })}
              </div>
              <button onClick={() => { toggleTheme(); setOpen(false); }}
                className="tap mt-2.5 w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] text-[13px] font-medium">
                {isDark ? <Sun style={{ width: 16, height: 16 }} strokeWidth={1.9} /> : <Moon style={{ width: 16, height: 16 }} strokeWidth={1.9} />}
                {isDark ? "Light mode" : "Dark mode"}
              </button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Floating liquid-glass tab bar */}
      <div
        className="fixed inset-x-0 bottom-0 z-50 flex justify-center pointer-events-none px-4"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 8px)" }}
      >
        <div className="pointer-events-auto max-w-full glass glass-edge border border-[var(--border)] rounded-[24px] px-1.5 py-1.5 flex items-center gap-0.5">
          <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto no-scrollbar">
            {tabs.map((item) => (
              <Tab key={item.href} item={item} active={isActive(pathname, item.href)} />
            ))}
          </div>
          <button
            ref={triggerRef}
            onClick={() => setOpen((v) => !v)}
            aria-label="More"
            aria-expanded={open}
            aria-haspopup="dialog"
            className={cn(
              "tap relative flex items-center justify-center w-[58px] min-w-11 shrink-0 h-[46px] rounded-[16px] transition-colors",
              moreActive ? "text-[var(--text)]" : "text-[var(--faint)]",
            )}
          >
            {moreActive && <span className="absolute inset-0 rounded-[16px] bg-[var(--surface-2)]" aria-hidden="true" />}
            <MoreHorizontal className="relative" style={{ width: 22, height: 22 }} strokeWidth={moreActive ? 2.1 : 1.8} />
          </button>
        </div>
      </div>
    </>
  );
}