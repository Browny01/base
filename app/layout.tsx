import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme-context";
import { AccentProvider } from "@/lib/accent-context";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bridge — Personal Command Center",
  description: "Your personal hub for focus, productivity, and income.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Bridge" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`h-full ${geist.variable}`} suppressHydrationWarning>
      <head>
        {/* Apply persisted theme before paint to avoid a flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('bridge_theme')||'dark';document.documentElement.classList.add(t==='dark'?'dark':'light');document.documentElement.dataset.nav=localStorage.getItem('bridge_nav_mode')==='dock'?'dock':'sidebar';var a=localStorage.getItem('bridge_accent');if(a)document.documentElement.style.setProperty('--accent',a)}catch(e){document.documentElement.classList.add('dark');document.documentElement.dataset.nav='sidebar'}`,
          }}
        />
      </head>
      <body className="h-full antialiased">
        <ThemeProvider><AccentProvider>{children}</AccentProvider></ThemeProvider>
      </body>
    </html>
  );
}
