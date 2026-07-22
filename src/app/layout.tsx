import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Atlas.io — Character Studio", description: "Persistent memory for character production." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
