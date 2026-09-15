import type { CapacitorConfig } from "@capacitor/cli";

// The mobile apps load the production Bounty service. Keep this URL aligned
// with NEXT_PUBLIC_SITE_URL so universal links and authentication callbacks
// return users to the canonical domain.
const config: CapacitorConfig = {
  appId: "dev.joinbounty.app",
  appName: "Bounty",
  webDir: "public",
  server: {
    url: "https://joinbounty.dev",
    cleartext: false,
    allowNavigation: ["joinbounty.dev", "*.supabase.co"],
  },
};

export default config;

