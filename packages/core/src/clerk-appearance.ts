/** Shared ClerkJS v5 theme for hosted account pages and browser entry. */
export function clerkAppearance(dark = false) {
  return {
    variables: {
      colorPrimary: dark ? "#979af5" : "#514bd4",
      colorText: dark ? "#eeeeec" : "#252524",
      colorTextSecondary: dark ? "#aaa9a3" : "#686862",
      colorBackground: dark ? "#20201e" : "#ffffff",
      colorInputBackground: dark ? "#191918" : "#fafaf9",
      colorInputText: dark ? "#eeeeec" : "#252524",
      colorNeutral: dark ? "#eeeeec" : "#252524",
      fontFamily: '"Base Geist", -apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: "14px", borderRadius: "10px",
    },
    elements: {
      rootBox: { width: "100%" },
      cardBox: { width: "100%", boxShadow: "none", border: "none" },
      card: { padding: "24px", boxShadow: "none", border: "none" },
      headerTitle: { fontWeight: "600", letterSpacing: "-0.03em" },
      socialButtonsBlockButton: { minHeight: "42px", boxShadow: "none" },
      formButtonPrimary: { minHeight: "42px", textTransform: "none", boxShadow: "none" },
      formFieldInput: { minHeight: "42px", boxShadow: "none" },
      navbar: { background: dark ? "#191918" : "#f6f6f4" },
      navbarButton: { fontWeight: "500" },
      footer: { background: dark ? "#191918" : "#fafaf9" },
    },
  };
}
