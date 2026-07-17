// Throwaway visual-check: logs in and screenshots the dashboard in each mode.
import { chromium } from "playwright-core";

const BASE = "http://localhost:3311";
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });

async function login(ctx) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("input[type=password]", "151715");
  await page.keyboard.press("Enter");
  await page.waitForURL(`${BASE}/`, { timeout: 15000 }).catch(() => {});
  return page;
}

const shots = [
  { name: "dash-sidebar", theme: "dark", nav: "sidebar", w: 1440, h: 1050 },
  { name: "dash-dock", theme: "dark", nav: "dock", w: 1440, h: 1050 },
  { name: "dash-light", theme: "light", nav: "sidebar", w: 1440, h: 1050 },
  { name: "dash-mobile", theme: "dark", nav: "sidebar", w: 390, h: 844 },
];

for (const s of shots) {
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 2 });
  const page = await login(ctx);
  await page.evaluate(({ theme, nav }) => {
    localStorage.setItem("bridge_theme", theme);
    localStorage.setItem("bridge_nav_mode", nav);
  }, s);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.evaluate(({ theme, nav }) => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("light", theme === "light");
    document.documentElement.dataset.nav = nav;
  }, s);
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `/tmp/${s.name}.png` });
  await ctx.close();
  console.log("done", s.name);
}
await browser.close();
