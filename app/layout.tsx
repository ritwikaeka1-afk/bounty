import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CampusBounty — Get help. Get credit.",
  description: "A verified-student bounty marketplace powered by campus credit."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
