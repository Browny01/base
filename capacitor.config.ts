import type { CapacitorConfig } from "@capacitor/cli";

// Bridge iOS shell.
//
// We load the LIVE web app (server.url) instead of bundling static assets, so
// every Vercel deploy of the web app updates the iOS app instantly — no App
// Store resubmit. Native capabilities (widgets, push, live activities) are added
// as separate Xcode targets that share data with the app via an App Group.
//
// See docs/ios-app.md for the full setup + roadmap.
const config: CapacitorConfig = {
  appId: "app.bridge.personal",
  appName: "Bridge",
  // Fallback web assets used only if the remote server is unreachable. `public`
  // already exists; a proper offline fallback can replace this later.
  webDir: "public",
  server: {
    url: "https://bridge-ten-lovat.vercel.app",
    cleartext: false,
  },
  backgroundColor: "#0a0a0b",
  ios: {
    // Let the web content manage its own safe-area insets (we pad chrome with
    // env(safe-area-inset-*) in CSS), and keep the scroll edges dark.
    contentInset: "never",
    backgroundColor: "#0a0a0b",
    scrollEnabled: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: "#0a0a0b",
      showSpinner: false,
    },
  },
};

export default config;
