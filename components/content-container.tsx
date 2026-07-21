"use client";

import { usePathname } from "next/navigation";

// Most pages are centered in a max-width column. The Vision Board is full-bleed
// (fills the whole main area beside the sidebar / under the top bar).
export function ContentContainer({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const fullBleed = pathname === "/" || pathname === "/vision" || pathname === "/notes" || pathname === "/player" || pathname === "/chat" || pathname === "/news" || pathname === "/finance" || pathname === "/learn" || pathname === "/gym";
  return (
    <div key={pathname} className={`nx-page-shell nx-page-enter ${fullBleed ? "w-full h-full" : "mx-auto w-full max-w-[1180px]"}`}>
      {children}
    </div>
  );
}
