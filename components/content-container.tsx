"use client";

import { usePathname } from "@/lib/navigation";
import { LazyMotion, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { useAppActive } from "@/lib/activity";
import { useEffect } from "react";

const features = () => import("./ui/motion-features").then(module => module.default);

// Most pages are centered in a max-width column. The Vision Board is full-bleed
// (fills the whole main area beside the sidebar / under the top bar).
export function ContentContainer({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const active = useAppActive();
  useEffect(()=>{document.documentElement.dataset.inactive=String(!active);},[active]);
  const fullBleed = pathname === "/" || pathname === "/vision" || pathname === "/notes" || pathname === "/player" || pathname === "/news" || pathname === "/finance" || pathname === "/learn" || pathname === "/gym" || pathname === "/calendar";
  const canvas = pathname === "/notes" || pathname === "/vision";
  return (
    <LazyMotion features={features} strict><m.div key={pathname}
      initial={reduceMotion || !active ? false : { opacity: 0 }}
      animate={{ opacity: 1 }} transition={{ duration: active && !reduceMotion ? 0.14 : 0 }}
      className={`nx-page-shell base-route ${canvas ? "w-full h-full flex flex-col" : fullBleed ? "w-full" : "mx-auto w-full max-w-[1280px]"}`}>
      {children}
    </m.div></LazyMotion>
  );
}
