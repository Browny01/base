// Throwaway visual-check script: logs in and screenshots the dashboard.
import { chromium } from "playwright-core";

const BASE = "http://localhost:3311";
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });

for (const [name, theme, width, height] of [
  ["dash-light", "light", 1440, 1000],
  ["dash-dark", "dark", 1440, 1000],
  ["dash-mobile-dark", "dark", 390, 844],
]) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("input[type=password]", "151715");
  await page.keyboard.press("Enter");
  await page.waitForURL(`${BASE}/`, { timeout: 15000 }).catch(() => {});
  // force the theme after login, then reload so the pre-paint script applies it
  await page.evaluate((t) => localStorage.setItem("bridge_theme", t), theme);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.evaluate((t) => {
    document.documentElement.classList.toggle("dark", t === "dark");
    document.documentElement.classList.toggle("light", t === "light");
  }, theme);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `/tmp/${name}.png` });
  await ctx.close();
  console.log("done", name);
}
await browser.close();
