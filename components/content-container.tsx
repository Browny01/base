"use client";

import { usePathname } from "next/navigation";

// Most pages are centered in a max-width column. The Vision Board is full-bleed
// (fills the whole main area beside the sidebar / under the top bar).
export function ContentContainer({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const fullBleed = pathname === "/" || pathname === "/vision" || pathname === "/notes" || pathname === "/player" || pathname === "/news" || pathname === "/finance" || pathname === "/learn" || pathname === "/gym" || pathname === "/calendar";
  const canvas = pathname === "/notes" || pathname === "/vision";
  return (
    <div key={pathname} className={`nx-page-shell ${canvas ? "nx-fade w-full h-full flex flex-col" : fullBleed ? "nx-page-enter w-full" : "nx-page-enter mx-auto w-full max-w-[1180px]"}`}>
      {children}
    </div>
  );
}
