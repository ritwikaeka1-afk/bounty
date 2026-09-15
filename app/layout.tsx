import type { Metadata } from "next";
import "./globals.css";
import "./landing-enhancements.css";
import "./public-info.css";
import { brand } from "../lib/brand";
import { LandingEnhancements } from "./components/LandingEnhancements";
import { PublicInfoPages } from "./components/PublicInfoPages";
import { NativeAppBridge } from "./components/NativeAppBridge";

export const metadata: Metadata = {
  metadataBase: new URL(brand.siteUrl),
  title: `${brand.name} — ${brand.tagline}`,
  description: brand.description,
  openGraph: { title: brand.name, description: brand.description, siteName: brand.name },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}<LandingEnhancements /><PublicInfoPages /><NativeAppBridge /></body></html>;
}

