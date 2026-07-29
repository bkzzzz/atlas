import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atlas Forge — AI Game Asset Studio",
  description:
    "Turn a reference and a few creative choices into production-ready 2D game art.",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#090a18",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
